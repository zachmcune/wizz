// Procedural audio via Web Audio (no binary assets to ship). Each GameEvent maps to a short
// synthesized blip. Unlocked on first user gesture (iOS requirement). Respects volume/mute.
import type { GameEvent } from '../sim/types';

interface Voice {
  freq: number;
  dur: number;
  type: OscillatorType;
  gain: number;
}

// Map event categories to a distinct timbre so the game "reads" by ear.
function voiceFor(ev: GameEvent): Voice | null {
  switch (ev.type) {
    case 'orderIssued':
      return { freq: ev.kind === 'attack' ? 320 : 440, dur: 0.08, type: 'triangle', gain: 0.25 };
    case 'attackFired':
      return { freq: 620, dur: 0.05, type: 'square', gain: 0.12 };
    case 'damageDealt':
      return null; // too frequent; handled via death/underAttack
    case 'entityDied':
      return { freq: 140, dur: 0.16, type: 'sawtooth', gain: 0.3 };
    case 'buildingComplete':
      return { freq: 520, dur: 0.22, type: 'triangle', gain: 0.35 };
    case 'buildingPlaced':
      return { freq: 300, dur: 0.1, type: 'sine', gain: 0.3 };
    case 'manaDeposited':
      return { freq: 780, dur: 0.06, type: 'sine', gain: 0.14 };
    case 'spellCast':
      return { freq: 220, dur: 0.4, type: 'sawtooth', gain: 0.4 };
    case 'superweaponLaunched':
      return { freq: 180, dur: 0.7, type: 'square', gain: 0.5 };
    case 'superweaponFired':
      return { freq: 90, dur: 0.5, type: 'sawtooth', gain: 0.5 };
    case 'underAttack':
      return { freq: 200, dur: 0.12, type: 'square', gain: 0.18 };
    case 'commandRejected':
      return { freq: 120, dur: 0.09, type: 'square', gain: 0.2 };
    case 'playerDefeated':
      return { freq: 90, dur: 0.6, type: 'sawtooth', gain: 0.5 };
    case 'matchEnded':
      return { freq: 660, dur: 0.5, type: 'triangle', gain: 0.5 };
    default:
      return null;
  }
}

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;
  volume = 0.6;
  private lastPlay: Record<string, number> = {};

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = this.muted ? 0 : v;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }

  play(ev: GameEvent): void {
    if (!this.ctx || !this.master || this.muted) return;
    const v = voiceFor(ev);
    if (!v) return;
    // throttle identical event types to avoid a wall of sound in big fights
    const now = this.ctx.currentTime;
    const key = ev.type;
    if (this.lastPlay[key] !== undefined && now - this.lastPlay[key]! < 0.04) return;
    this.lastPlay[key] = now;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = v.type;
    osc.frequency.value = v.freq;
    g.gain.setValueAtTime(v.gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + v.dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + v.dur);
  }
}
