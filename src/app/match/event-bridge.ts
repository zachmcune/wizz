// Routes GameEvents to audio and visual effects (presentation only).
import type { SimServices } from '../../sim/context';
import type { GameEvent, GameState, PlayerId } from '../../sim/types';
import { isWorldPointVisible, shouldRevealAllForViewer } from '../../sim/views';
import type { AudioManager } from '../../audio/audio';
import type { EffectsLayer } from '../../render/effects';

export class EventBridge {
  constructor(
    private getState: () => GameState,
    private humanId: PlayerId,
    private getServices: () => SimServices,
    private deadSpectatorReveal: boolean,
    private audio: AudioManager,
    private effects: EffectsLayer,
  ) {}

  handle(ev: GameEvent): void {
    const visible = this.isVisible(ev);
    if (visible) this.audio.play(ev);
    switch (ev.type) {
      case 'attackFired':
        if (visible) this.effects.spawn('flash', ev.x, ev.y, 0xffe08a, 6);
        break;
      case 'damageDealt':
        if (visible) this.effects.spawn('flash', ev.x, ev.y, 0xffffff, 5);
        break;
      case 'entityDied':
        if (visible) this.effects.spawn('puff', ev.x, ev.y, 0x9a9a9a, 14);
        break;
      case 'buildingComplete': {
        const b = this.getState().entities.get(ev.id);
        const nav = this.getServices().nav;
        if (b && isWorldPointVisible(this.getState(), this.humanId, b.pos.x, b.pos.y, nav)) {
          this.effects.spawn('ring', b.pos.x, b.pos.y, 0x8b6cff, 30);
        }
        break;
      }
      case 'manaDeposited':
        if (visible) this.effects.spawn('spark', ev.x, ev.y, 0x7fe3ff, 4);
        break;
      case 'spellCast':
        if (visible) this.effects.spawn('ring', ev.x, ev.y, 0xffd166, 60);
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
      case 'damageDealt':
      case 'entityDied':
      case 'manaDeposited':
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
