// Procedural audio via Web Audio (no binary assets to ship). Each GameEvent maps to a short
// synthesized blip. Unlocked on first user gesture (iOS requirement). Respects volume/mute.
import type { GameEvent } from '../sim/types';

interface Voice {
  freq: number;
  dur: number;
  type: OscillatorType;
  gain: number;
  freqEnd?: number;
}

// Map event categories to a distinct timbre so the game "reads" by ear.
function voiceFor(ev: GameEvent): Voice | null {
  switch (ev.type) {
    case 'orderIssued':
      return { freq: ev.kind === 'attack' ? 320 : 440, dur: 0.08, type: 'triangle', gain: 0.25 };
    case 'attackFired':
      return { freq: 620, dur: 0.05, type: 'square', gain: 0.12 };
    case 'beamStarted':
      return { freq: 280, dur: 0.12, type: 'sawtooth', gain: 0.1 };
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
    case 'attackCharging':
      return { freq: 110, dur: 0.35, type: 'sine', gain: 0.18 };
    case 'artilleryImpact':
      return null; // handled by playCelestialImpact
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

  private synthVoice(v: Voice, throttleKey: string, minGap = 0.04): void {
    if (!this.ctx || !this.master || this.muted) return;
    const now = this.ctx.currentTime;
    if (this.lastPlay[throttleKey] !== undefined && now - this.lastPlay[throttleKey]! < minGap) return;
    this.lastPlay[throttleKey] = now;

    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = v.type;
    osc.frequency.setValueAtTime(v.freq, now);
    if (v.freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, v.freqEnd), now + v.dur);
    }
    g.gain.setValueAtTime(v.gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + v.dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(now);
    osc.stop(now + v.dur);
  }

  play(ev: GameEvent): void {
    const v = voiceFor(ev);
    if (!v) return;
    this.synthVoice(v, ev.type);
  }

  /** Celestial Cannon charge start — rising harmonic drone. */
  playCelestialChargeStart(): void {
    this.synthVoice({ freq: 72, freqEnd: 140, dur: 0.55, type: 'sine', gain: 0.28 }, 'celestialCharge', 0.8);
    this.synthVoice({ freq: 144, freqEnd: 220, dur: 0.45, type: 'triangle', gain: 0.12 }, 'celestialChargeHi', 0.8);
  }

  /** Celestial Cannon sky connection as charge peaks. */
  playCelestialFire(): void {
    this.synthVoice({ freq: 280, freqEnd: 520, dur: 0.18, type: 'sine', gain: 0.16 }, 'celestialFire', 0.2);
  }

  /** Celestial Cannon impact — low boom + crystalline ring. */
  playCelestialImpact(): void {
    this.synthVoice({ freq: 55, freqEnd: 28, dur: 0.65, type: 'sine', gain: 0.45 }, 'celestialImpactBoom', 0.15);
    this.synthVoice({ freq: 880, freqEnd: 440, dur: 0.35, type: 'triangle', gain: 0.22 }, 'celestialImpactRing', 0.15);
  }

  /** Storm Conductor charge — rising electrical whine. */
  playStormChargeStart(): void {
    this.synthVoice({ freq: 90, freqEnd: 280, dur: 0.48, type: 'sawtooth', gain: 0.22 }, 'stormCharge', 0.75);
    this.synthVoice({ freq: 180, freqEnd: 420, dur: 0.42, type: 'sine', gain: 0.1 }, 'stormChargeHi', 0.75);
  }

  /** Storm Conductor primary strike — bass crack-boom + treble snap. */
  playStormPrimaryStrike(): void {
    this.synthVoice({ freq: 48, freqEnd: 22, dur: 0.55, type: 'sine', gain: 0.42 }, 'stormPrimaryBoom', 0.12);
    this.synthVoice({ freq: 1200, freqEnd: 600, dur: 0.08, type: 'square', gain: 0.18 }, 'stormPrimarySnap', 0.12);
  }

  /** Storm Conductor chain jump — descending crackle-zap. */
  playStormChainJump(index: number): void {
    const base = 680 - index * 85;
    const gain = Math.max(0.04, 0.14 - index * 0.02);
    this.synthVoice(
      { freq: base, freqEnd: base * 0.6, dur: 0.06 + index * 0.008, type: 'square', gain },
      `stormChain${index}`,
      0.02,
    );
  }

  /** Storm Conductor idle — occasional soft arc tick. */
  playStormIdleTick(): void {
    this.synthVoice({ freq: 420, freqEnd: 280, dur: 0.04, type: 'triangle', gain: 0.06 }, 'stormIdleTick', 1.2);
  }

  private sanctuaryIdleOsc: OscillatorNode | null = null;
  private sanctuaryIdleGain: GainNode | null = null;
  private lastSanctuaryIdlePulse = 0;

  /** Very quiet sustained warm pad while a Sanctuary Spire is on screen. */
  tickSanctuaryIdle(): void {
    if (!this.ctx || !this.master || this.muted) return;
    const now = this.ctx.currentTime;
    if (!this.sanctuaryIdleOsc) {
      this.sanctuaryIdleOsc = this.ctx.createOscillator();
      this.sanctuaryIdleGain = this.ctx.createGain();
      this.sanctuaryIdleOsc.type = 'sine';
      this.sanctuaryIdleOsc.frequency.value = 110;
      this.sanctuaryIdleGain.gain.value = 0.0001;
      this.sanctuaryIdleOsc.connect(this.sanctuaryIdleGain);
      this.sanctuaryIdleGain.connect(this.master);
      this.sanctuaryIdleOsc.start(now);
      this.sanctuaryIdleOsc.frequency.setTargetAtTime(132, now, 0.8);
      this.sanctuaryIdleGain.gain.setTargetAtTime(0.018, now, 0.6);
    }
    if (now - this.lastSanctuaryIdlePulse > 5.5) {
      this.lastSanctuaryIdlePulse = now;
      this.synthVoice({ freq: 264, freqEnd: 330, dur: 1.8, type: 'triangle', gain: 0.04 }, 'sanctuaryShimmer', 5);
    }
  }

  stopSanctuaryIdle(): void {
    if (!this.ctx || !this.sanctuaryIdleOsc || !this.sanctuaryIdleGain) return;
    const now = this.ctx.currentTime;
    this.sanctuaryIdleGain.gain.setTargetAtTime(0.0001, now, 0.4);
    this.sanctuaryIdleOsc.stop(now + 0.5);
    this.sanctuaryIdleOsc.disconnect();
    this.sanctuaryIdleGain.disconnect();
    this.sanctuaryIdleOsc = null;
    this.sanctuaryIdleGain = null;
  }

  /** Rising bowed-glass tone during pulse anticipation (~1s ramp). */
  playSanctuaryAnticipation(progress: number): void {
    const base = 220 + progress * 180;
    this.synthVoice(
      { freq: base, freqEnd: base * 1.08, dur: 0.14, type: 'sine', gain: 0.06 + progress * 0.08 },
      `sanctuaryAnticipation${Math.floor(progress * 8)}`,
      0.1,
    );
  }

  /** Warm singing-bowl swell on pulse bloom. */
  playSanctuaryPulse(): void {
    this.synthVoice({ freq: 196, freqEnd: 392, dur: 0.55, type: 'sine', gain: 0.22 }, 'sanctuaryPulse', 0.35);
    this.synthVoice({ freq: 392, freqEnd: 294, dur: 0.42, type: 'triangle', gain: 0.1 }, 'sanctuaryPulseHi', 0.35);
  }

  /** Unique two-note harp flourish for first-entry blessing. */
  playSanctuaryBlessing(): void {
    if (!this.ctx || !this.master || this.muted) return;
    const now = this.ctx.currentTime;
    if (this.lastPlay.sanctuaryBlessA !== undefined && now - this.lastPlay.sanctuaryBlessA < 0.25) return;
    this.lastPlay.sanctuaryBlessA = now;

    const playNote = (freq: number, start: number, dur: number, type: OscillatorType, gain: number): void => {
      const osc = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(gain, start);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      osc.connect(g);
      g.connect(this.master!);
      osc.start(start);
      osc.stop(start + dur);
    };

    playNote(523, now, 0.18, 'sine', 0.14);
    playNote(659, now + 0.14, 0.22, 'triangle', 0.12);
  }

  /** Subtle shimmer under empowered unit attacks (not a repeating cue). */
  playSanctuaryBuffShimmer(): void {
    this.synthVoice({ freq: 880, freqEnd: 660, dur: 0.05, type: 'sine', gain: 0.05 }, 'sanctuaryBuffShimmer', 0.06);
  }

  private sentryIdleOsc: OscillatorNode | null = null;
  private sentryIdleGain: GainNode | null = null;
  private sentryCombatGain = 0;

  /** Quiet magical resonance hum while Arcane Sentries are on screen. */
  tickSentryIdle(combat: boolean): void {
    if (!this.ctx || !this.master || this.muted) return;
    const now = this.ctx.currentTime;
    const targetCombat = combat ? 1 : 0;
    this.sentryCombatGain += (targetCombat - this.sentryCombatGain) * 0.12;

    if (!this.sentryIdleOsc) {
      this.sentryIdleOsc = this.ctx.createOscillator();
      this.sentryIdleGain = this.ctx.createGain();
      this.sentryIdleOsc.type = 'sine';
      this.sentryIdleOsc.frequency.value = 176;
      this.sentryIdleGain.gain.value = 0.0001;
      this.sentryIdleOsc.connect(this.sentryIdleGain);
      this.sentryIdleGain.connect(this.master);
      this.sentryIdleOsc.start(now);
    }

    const idleLevel = 0.012 + this.sentryCombatGain * 0.014;
    this.sentryIdleGain!.gain.setTargetAtTime(idleLevel, now, combat ? 0.08 : 0.3);
    this.sentryIdleOsc.frequency.setTargetAtTime(176 + this.sentryCombatGain * 44, now, 0.15);
  }

  stopSentryIdle(): void {
    if (!this.ctx || !this.sentryIdleOsc || !this.sentryIdleGain) return;
    const now = this.ctx.currentTime;
    this.sentryIdleGain.gain.setTargetAtTime(0.0001, now, 0.3);
    this.sentryCombatGain = 0;
    this.sentryIdleOsc.stop(now + 0.35);
    this.sentryIdleOsc.disconnect();
    this.sentryIdleGain.disconnect();
    this.sentryIdleOsc = null;
    this.sentryIdleGain = null;
  }

  /** Brief rising tick when the sentry acquires a target. */
  playSentryAcquire(): void {
    this.synthVoice({ freq: 440, freqEnd: 660, dur: 0.12, type: 'sine', gain: 0.08 }, 'sentryAcquire', 0.2);
  }

  /** Soft zip/fizzle for each bolt — three pitches cycle in round-robin order. */
  playSentryBolt(crystalIndex: number): void {
    const pitches = [880, 1046, 1318];
    const freq = pitches[crystalIndex % 3]!;
    const jitter = (crystalIndex * 17 % 5) * 0.001;
    this.synthVoice(
      { freq, freqEnd: freq * 0.82, dur: 0.035 + jitter, type: 'triangle', gain: 0.045 },
      `sentryBolt${crystalIndex % 3}`,
      0.03,
    );
  }

  /** Tiny sparkle tink on bolt impact. */
  playSentryImpact(): void {
    this.synthVoice({ freq: 2200, freqEnd: 1400, dur: 0.04, type: 'sine', gain: 0.03 }, 'sentryImpact', 0.025);
  }
}
