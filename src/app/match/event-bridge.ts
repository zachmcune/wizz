// Routes GameEvents to audio and visual effects (presentation only).
import type { SimServices } from '../../sim/context';
import type { GameEvent, GameState, PlayerId } from '../../sim/types';
import { isWorldPointVisible, shouldRevealAllForViewer } from '../../sim/views';
import type { AudioManager } from '../../audio/audio';
import type { EffectsLayer } from '../../render/effects';
import { spawnCelestialScorch, spawnCelestialSkyStrike } from '../../render/celestial-cannon-vfx';
import { spawnStormSequence } from '../../render/storm-conductor-vfx';
import type { Camera } from '../../render/camera';

export class EventBridge {
  /** Suppresses generic damage flashes while a Storm Conductor chain resolves. */
  private pendingStormChain = false;

  constructor(
    private getState: () => GameState,
    private humanId: PlayerId,
    private getServices: () => SimServices,
    private deadSpectatorReveal: boolean,
    private audio: AudioManager,
    private effects: EffectsLayer,
    private onNotify?: (text: string) => void,
    private camera?: Camera,
  ) {}

  setHumanId(humanId: PlayerId): void {
    this.humanId = humanId;
  }

  handle(ev: GameEvent): void {
    const visible = this.isVisible(ev);
    const state = this.getState();

    switch (ev.type) {
      case 'attackFired': {
        if (!visible) break;
        const src = state.entities.get(ev.sourceId);
        if (src?.defId === 'celestial_cannon') {
          this.audio.playCelestialFire();
          this.effects.spawn('flash', ev.x, ev.y, 0xd9f3ff, 12);
        } else if (src?.defId === 'storm_conductor') {
          this.pendingStormChain = true;
        } else {
          this.audio.play(ev);
          this.effects.spawn('flash', ev.x, ev.y, 0xffe08a, 6);
        }
        break;
      }
      case 'beamStarted':
        if (visible) {
          this.audio.play(ev);
          this.effects.spawn('flash', ev.x, ev.y, 0xffa060, 8);
        }
        break;
      case 'beamStopped':
        break;
      case 'damageDealt':
        if (visible && !this.pendingStormChain) {
          this.effects.spawn('flash', ev.x, ev.y, 0xffffff, 5);
        }
        break;
      case 'healApplied':
        if (visible) this.effects.spawn('spark', ev.x, ev.y, 0x8fffd2, 5);
        break;
      case 'attackCharging': {
        if (!visible) break;
        const src = state.entities.get(ev.sourceId);
        if (src?.defId === 'celestial_cannon') {
          this.audio.playCelestialChargeStart();
        } else if (src?.defId === 'storm_conductor') {
          this.audio.playStormChargeStart();
        } else {
          this.audio.play(ev);
          this.effects.spawn('ring', ev.x, ev.y, 0xd9f3ff, 36);
        }
        break;
      }
      case 'chainLightningFired':
        if (visible) {
          this.pendingStormChain = false;
          this.audio.playStormPrimaryStrike();
          for (let i = 1; i < ev.hits.length; i++) {
            this.audio.playStormChainJump(i);
          }
          this.effects.spawn('flash', ev.hits[0]!.x, ev.hits[0]!.y, 0xffffff, 22);
          spawnStormSequence(ev.x, ev.y, ev.hits);
          this.camera?.triggerMicroShake(5);
        } else {
          this.pendingStormChain = false;
        }
        break;
      case 'artilleryImpact':
        if (visible) {
          this.audio.playCelestialImpact();
          this.effects.spawn('strike', ev.x, ev.y, 0xfff4d0, ev.radius);
          this.effects.spawn('flash', ev.x, ev.y, 0xffffff, ev.radius * 0.55);
          this.effects.spawn('shockwave', ev.x, ev.y, 0xd9f3ff, ev.radius);
          spawnCelestialScorch(ev.x, ev.y, ev.radius);
          spawnCelestialSkyStrike(ev.x, ev.y, ev.radius);
        }
        break;
      case 'entityDied':
        if (visible) {
          this.audio.play(ev);
          this.effects.spawn('puff', ev.x, ev.y, 0x9a9a9a, 14);
        }
        break;
      case 'buildingComplete': {
        const b = state.entities.get(ev.id);
        const nav = this.getServices().nav;
        if (b && isWorldPointVisible(state, this.humanId, b.pos.x, b.pos.y, nav)) {
          this.audio.play(ev);
          this.effects.spawn('ring', b.pos.x, b.pos.y, 0x8b6cff, 30);
        }
        break;
      }
      case 'manaDeposited':
        if (visible) {
          this.audio.play(ev);
          this.effects.spawn('spark', ev.x, ev.y, 0x7fe3ff, 4);
        }
        break;
      case 'manaConjured':
        if (visible) {
          this.audio.play(ev);
          this.effects.spawn('spark', ev.x, ev.y, 0xb58cff, 6);
        }
        break;
      case 'spellCast':
        if (visible) {
          this.audio.play(ev);
          this.effects.spawn('ring', ev.x, ev.y, 0xffd166, 60);
        }
        break;
      case 'superweaponLaunched': {
        const mine = ev.playerId === this.humanId;
        this.onNotify?.(mine ? 'Astral Lance launched!' : 'Warning: enemy Astral Lance detected!');
        if (visible) {
          this.audio.play(ev);
          this.effects.spawn('ring', ev.x, ev.y, 0xff5d5d, 60);
        }
        break;
      }
      case 'superweaponFired':
        if (visible) {
          this.audio.play(ev);
          this.effects.spawn('flash', ev.x, ev.y, 0x9fdcff, 40);
        }
        break;
      default:
        if (visible) this.audio.play(ev);
        break;
    }
  }

  private viewerRevealAll(): boolean {
    return shouldRevealAllForViewer(this.getState(), this.humanId, this.deadSpectatorReveal);
  }

  private isVisible(ev: GameEvent): boolean {
    if (this.viewerRevealAll()) return true;
    const nav = this.getServices().nav;
    switch (ev.type) {
      case 'attackFired':
      case 'beamStarted':
      case 'damageDealt':
      case 'healApplied':
      case 'attackCharging':
      case 'chainLightningFired':
      case 'artilleryImpact':
      case 'entityDied':
      case 'manaDeposited':
      case 'manaConjured':
      case 'spellCast':
        return isWorldPointVisible(this.getState(), this.humanId, ev.x, ev.y, nav);
      case 'buildingComplete': {
        const b = this.getState().entities.get(ev.id);
        return b ? isWorldPointVisible(this.getState(), this.humanId, b.pos.x, b.pos.y, nav) : false;
      }
      default:
        return true;
    }
  }
}
