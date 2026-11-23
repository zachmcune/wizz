// BOT CLIENT — a headless "human" that plays a real AI and sends its commands over the network.
//
// WHY THIS AND NOT A HAND-WRITTEN SCRIPT. Two things must be true of a headless multiplayer proof, and they
// pull in different directions:
//
//   • the commands must travel the real path (issue → input-delay scheduling → relay merge → broadcast →
//     applyCommands), or the test proves nothing about the network;
//   • the match must actually FINISH, or "peers agreed" is a statement about an idle world.
//
// A hand-written script is easy to write but does not terminate: the first version of this fixture built a
// spire and then stalled forever because its build-order conditions were incomplete, which is exactly the
// kind of half-player an AI already solves well. So each peer plays the SHIPPED AI BRAIN — the one whose
// termination and difficulty ordering Phase 5 measured — but issues the brain's commands through
// `LockstepSession.issue` instead of letting the sim apply them locally.
//
// WHAT THIS DOES AND DOES NOT PROVE. It proves the command channel: a command decided on peer A is executed
// with identical results on peers A, B, C and D, at exactly the scheduled tick. It does NOT prove that a
// human's mouse input works — that is what the Playwright browser run covers.
//
// DETERMINISM. `AiBrain` is a pure function of (GameState, tick, playerId) and uses no randomness, so all
// peers could recompute it. Deliberately, they do NOT: only the owning peer runs the brain, and its output
// arrives as ordinary commands. That is the honest model of a human player and it means the sync property is
// not being propped up by every client computing the same thing independently.

import { AiBrain } from '../ai/brain';
import type { Registry } from '../data/registry';
import type { SimServices } from '../sim/context';
import type { Command, GameState } from '../sim/types';

export interface BotClientOptions {
  playerId: string;
  difficulty: 'easy' | 'normal' | 'hard';
  registry: Registry;
  services: SimServices;
}

export class BotClient {
  private readonly brain: AiBrain;
  /** Total commands handed to the transport, so a test can assert the channel was used. */
  issued = 0;
  /** Decisions the brain actually made, distinct from ticks it merely observed. */
  decisions = 0;

  constructor(opts: BotClientOptions) {
    this.brain = new AiBrain(opts.playerId, opts.difficulty, opts.registry, opts.services);
  }

  /**
   * Run one decision pass and return the commands to send.
   *
   * The brain is called once per tick exactly as the sim's aiHook would call it, so its latency model
   * (`decisionInterval`, `reactionDelay`) behaves identically to a local AI. On ticks it does not decide, it
   * returns an empty list and nothing is sent.
   */
  decide(state: GameState): Command[] {
    if (state.ended) return [];
    const result = this.brain.tick(state);
    if (result.commands.length === 0) return [];
    this.decisions++;
    this.issued += result.commands.length;
    return result.commands;
  }
}
