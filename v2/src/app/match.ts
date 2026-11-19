// MATCH CONTROLLER — owns the fixed-step loop, the renderer, and every command the UI issues.
//
// The UI never touches `GameState` directly. It calls methods here, which build a `Command` and hand it
// to the sim. That matters for two reasons: every player action goes through the same rejection path
// (so an illegal action produces a player-visible notice rather than silent nothing), and the loop stays
// the only place that advances time.
import { TICK_MS } from '../core/constants';
import { initMatch } from '../sim/factory';
import type { SimServices } from '../sim/context';
import { stepSimulation } from '../sim/step';
import type { Command, EntityId, GameState, PlayerId } from '../sim/types';

/**
 * A command without its player id.
 *
 * `Omit<Command, 'playerId'>` collapses the discriminated union to its common keys, which is why it
 * rejected `entityIds` and `defId`. Distributing the Omit over the union preserves each variant's own
 * fields.
 */
export type CommandPayload = Command extends infer C ? (C extends Command ? Omit<C, 'playerId'> : never) : never;
import { Renderer } from '../render/renderer';
import type { LoadedAtlas } from '../render/atlas';
import type { Registry } from '../data/registry';
import { teamIdForColor } from '../render/renderer';
import type { LobbyConfig, MatchSession, LobbyPlayer } from './state';

export interface MatchHooks {
  /** Called at most once per frame after a tick ran, so the HUD can re-read state. */
  onTick: (state: GameState) => void;
  /** Called when the match ends, with the winning team (null = draw). */
  onEnd: (winnerTeam: number | null) => void;
  /** Called when the sim rejects a command, with the reason it gave. */
  onReject: (reason: string) => void;
}

export class MatchController {
  readonly session: MatchSession;
  private renderer: Renderer;
  private hooks: MatchHooks;
  private raf = 0;
  private last = 0;
  private running = false;
  private paused = false;
  private speed = 1;
  /** Wall-clock ms of simulation advanced, for the HUD clock. */
  private elapsedMs = 0;

  private constructor(session: MatchSession, renderer: Renderer, hooks: MatchHooks) {
    this.session = session;
    this.renderer = renderer;
    this.hooks = hooks;
    this.speed = session.config.speed;
  }

  static async create(
    registry: Registry,
    atlas: LoadedAtlas,
    config: LobbyConfig,
    host: HTMLElement,
    hooks: MatchHooks,
  ): Promise<MatchController> {
    const { state, services } = initMatch(registry, {
      mapId: config.mapId,
      seed: (Date.now() ^ (config.players.length * 2654435761)) >>> 0,
      players: config.players.map((p: LobbyPlayer) => ({
        id: p.id,
        controller: p.controller,
        team: p.team,
        color: p.color,
        startIndex: p.startIndex,
        factionId: p.factionId,
        ...(p.aiDifficulty ? { aiDifficulty: p.aiDifficulty } : {}),
      })),
    } as never);

    const renderer = new Renderer(registry, registry.map(config.mapId));
    await renderer.init(host, atlas);

    const session: MatchSession = { state, services, registry, config, accumulator: 0, endedAtTick: null };
    const ctrl = new MatchController(session, renderer, hooks);
    ctrl.focusPlayerBase();
    return ctrl;
  }

  get state(): GameState {
    return this.session.state;
  }

  get services(): SimServices {
    return this.session.services;
  }

  get camera(): Renderer['camera'] {
    return this.renderer.camera;
  }

  get rend(): Renderer {
    return this.renderer;
  }

  /** The human player, i.e. the one this client controls in a single-player match. */
  get me(): PlayerId {
    const human = this.session.state.players.find((p) => p.controller === 'human');
    return human?.id ?? this.session.state.players[0]!.id;
  }

  /** Centre the camera on the local player's starting building. */
  focusPlayerBase(): void {
    const st = this.session.state;
    const myIndex = st.players.findIndex((p) => p.id === this.me);
    let found = -1;
    for (let s = 0; s < st.entities.count; s++) {
      if (st.entities.dead[s]) continue;
      if (st.entities.kind[s] !== 1) continue;
      if (st.entities.ownerIndex[s] !== myIndex) continue;
      found = s;
      break;
    }
    if (found >= 0) {
      this.renderer.camera.centerOn(st.entities.posX[found]!, st.entities.posY[found]!);
    }
    this.renderer.setViewer(teamIdForColor(st.players[myIndex]!.color));
    this.renderer.camera.setZoom(1);
  }

  setSpeed(speed: number): void {
    this.speed = Math.max(0.25, Math.min(3, speed));
  }

  get currentSpeed(): number {
    return this.speed;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  /** Advance exactly one tick while paused (sandbox step). */
  stepOnce(): void {
    this.tick();
    this.renderer.sync(this.session.state);
    this.hooks.onTick(this.session.state);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number): void => {
      if (!this.running) return;
      const dt = Math.min(100, now - this.last);
      this.last = now;
      if (!this.paused) {
        this.session.accumulator += dt * this.speed;
        let steps = 0;
        // Bounded catch-up: never simulate more than 5 ticks in one frame, or a slow frame spirals.
        while (this.session.accumulator >= TICK_MS && steps < 5) {
          this.tick();
          this.session.accumulator -= TICK_MS;
          steps++;
        }
      }
      if (!this.paused) {
        this.renderer.sync(this.session.state);
        this.hooks.onTick(this.session.state);
      }
      this.renderer.render(this.session.state, Math.min(1, this.session.accumulator / TICK_MS), new Set());
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  destroy(): void {
    this.stop();
    this.renderer.destroy();
  }

  // ───────────────────────────────────────────────────────────────────────── the tick

  private tick(): void {
    const st = this.session.state;
    if (st.ended) {
      if (this.session.endedAtTick === null) {
        this.session.endedAtTick = st.tick;
        this.hooks.onEnd(st.winnerTeam ?? null);
      }
      return;
    }
    const cmds = this.aiCommands();
    const res = stepSimulation(st, this.session.services, cmds);
    this.elapsedMs += TICK_MS;
    for (const ev of res.events) {
      if (ev.type === 'commandRejected') this.hooks.onReject(ev.reason);
    }
    if (st.ended && this.session.endedAtTick === null) {
      this.session.endedAtTick = st.tick;
      this.hooks.onEnd(st.winnerTeam ?? null);
    }
  }

  /** AI opponents. Phase 5 replaces this stub with the real planners. */
  private aiCommands(): Command[] {
    const st = this.session.state;
    const out: Command[] = [];
    for (const p of st.players) {
      if (p.controller !== 'ai' || p.defeated) continue;
      out.push(...simpleBot(st, p.id));
    }
    return out;
  }

  /**
   * Issue a command as the local player and surface any rejection.
   *
   * Returns true when the sim accepted it. The HUD uses this so a failed build (not enough mana, bad
   * placement) tells the player why instead of doing nothing.
   */
  issue(cmd: CommandPayload): boolean {
    const full = { ...cmd, playerId: (cmd as { playerId?: PlayerId }).playerId ?? this.me } as Command;
    const res = stepSimulation(this.session.state, this.session.services, [full]);
    const rejection = res.events.find((e) => e.type === 'commandRejected');
    if (rejection && rejection.type === 'commandRejected') {
      this.hooks.onReject(rejection.reason);
      return false;
    }
    this.renderer.sync(this.session.state);
    this.hooks.onTick(this.session.state);
    return true;
  }

  /** The match clock in whole seconds. */
  get elapsedSeconds(): number {
    return Math.floor(this.elapsedMs / 1000);
  }

  /** Units belonging to the local player, for select-all and idle cycling. */
  myUnits(): EntityId[] {
    const st = this.session.state;
    const myIndex = st.players.findIndex((p) => p.id === this.me);
    const out: EntityId[] = [];
    for (let s = 0; s < st.entities.count; s++) {
      if (st.entities.dead[s]) continue;
      if (st.entities.kind[s] !== 0) continue;
      if (st.entities.ownerIndex[s] !== myIndex) continue;
      out.push(st.entities.id[s]!);
    }
    return out;
  }
}

/**
 * A deliberately minimal opponent so a match is playable before Phase 5.
 *
 * It does exactly two things: train the cheapest unit it can afford, and attack-move everything it owns
 * at the enemy. That is enough to make the match real without pretending to be the Phase 5 AI — which
 * is where threat maps, staging and economy planning land.
 */
function simpleBot(st: GameState, pid: PlayerId): Command[] {
  const out: Command[] = [];
  const idx = st.players.findIndex((p) => p.id === pid);
  if (idx < 0) return out;
  const me = st.players[idx]!;

  // 1. Train from any completed producer that has room in its queue.
  for (let s = 0; s < st.entities.count; s++) {
    if (st.entities.dead[s] || st.entities.kind[s] !== 1) continue;
    if (st.entities.ownerIndex[s] !== idx) continue;
    const defId = st.entities.extras[s]!.defId;
    // The bot only uses troop producers; it never tries to build.
    if (!defId.includes('summoning') && !defId.includes('golem_forge') && !defId.includes('attunement')) continue;
    if (st.tick % 40 !== 0) continue;
    const unit = defId.includes('attunement') ? 'wisp' : 'imp_swarmling';
    out.push({ type: 'produce', playerId: pid, buildingId: st.entities.id[s]!, defId: unit });
  }

  // 2. Attack-move everything at the enemy every 2 seconds.
  if (st.tick % 40 === 0) {
    const mine: EntityId[] = [];
    let enemyX = 0;
    let enemyY = 0;
    let enemyN = 0;
    for (let s = 0; s < st.entities.count; s++) {
      if (st.entities.dead[s]) continue;
      const owner = st.entities.ownerIndex[s]!;
      if (owner === idx) {
        if (st.entities.kind[s] === 0) mine.push(st.entities.id[s]!);
      } else if (st.entities.ownerIndex[s] !== undefined) {
        enemyX += st.entities.posX[s]!;
        enemyY += st.entities.posY[s]!;
        enemyN++;
      }
    }
    if (mine.length && enemyN) {
      out.push({ type: 'attackMove', playerId: pid, entityIds: mine, x: enemyX / enemyN, y: enemyY / enemyN });
    }
  }
  void me;
  return out;
}
