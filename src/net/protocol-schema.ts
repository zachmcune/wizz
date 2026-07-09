// Zod schemas for the multiplayer wire protocol. Game content uses src/data/schemas.ts;
// network messages use this module for runtime validation on client and relay.
import { z } from 'zod';

const lobbySlotWireSchema = z.object({
  id: z.string(),
  kind: z.enum(['closed', 'human', 'ai', 'open']),
  team: z.string(),
  color: z.string(),
  startIndex: z.number().nullable(),
  factionId: z.string(),
  aiDifficulty: z.enum(['easy', 'normal', 'hard']).optional(),
  claimedBy: z.string().nullable().optional(),
  ready: z.boolean().optional(),
});

export const lobbyStateWireSchema = z.object({
  mapId: z.string(),
  factionId: z.string(),
  slots: z.array(lobbySlotWireSchema),
  deadSpectatorReveal: z.boolean().optional(),
  oneSuperweaponPerPlayer: z.boolean().optional(),
  economyPacing: z.enum(['standard', 'tight']).optional(),
  projectionMode: z.enum(['ortho', 'oblique']).optional(),
});

const playerIdSchema = z.string();
const entityIdSchema = z.number();
const stanceSchema = z.enum(['aggressive', 'hold', 'standground']);

const devCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('devSetMana'), playerId: playerIdSchema, amount: z.number(), mode: z.enum(['set', 'add', 'remove']) }),
  z.object({ type: z.literal('devSpawnUnit'), playerId: playerIdSchema, defId: z.string(), x: z.number(), y: z.number(), count: z.number().optional() }),
  z.object({ type: z.literal('devSpawnBuilding'), playerId: playerIdSchema, defId: z.string(), x: z.number(), y: z.number(), complete: z.boolean().optional() }),
  z.object({ type: z.literal('devDestroyEntity'), playerId: playerIdSchema, entityIds: z.array(entityIdSchema) }),
  z.object({ type: z.literal('devSetEntityHp'), playerId: playerIdSchema, entityId: entityIdSchema, hp: z.union([z.number(), z.enum(['max', 'kill'])]) }),
  z.object({ type: z.literal('devUnlockTech'), playerId: playerIdSchema, defId: z.union([z.string(), z.literal('all')]) }),
  z.object({ type: z.literal('devClearUnits'), playerId: playerIdSchema, targetPlayerId: playerIdSchema.optional() }),
  z.object({ type: z.literal('devCastSpell'), playerId: playerIdSchema, spellId: z.string(), x: z.number(), y: z.number(), entityIds: z.array(entityIdSchema).optional() }),
  z.object({ type: z.literal('devCompleteResearch'), playerId: playerIdSchema, defId: z.string().optional() }),
  z.object({
    type: z.literal('devAddPlayer'),
    playerId: playerIdSchema,
    newPlayerId: playerIdSchema,
    controller: z.enum(['human', 'ai']),
    team: z.number(),
    color: z.string(),
    startIndex: z.number(),
    aiDifficulty: z.enum(['easy', 'normal', 'hard']).optional(),
  }),
  z.object({ type: z.literal('devRemovePlayer'), playerId: playerIdSchema, targetPlayerId: playerIdSchema }),
  z.object({
    type: z.literal('devConfigurePlayer'),
    playerId: playerIdSchema,
    targetPlayerId: playerIdSchema,
    team: z.number().optional(),
    aiDifficulty: z.enum(['easy', 'normal', 'hard']).optional(),
    controller: z.enum(['human', 'ai']).optional(),
  }),
]);

const commandSchema: z.ZodType<unknown> = z.union([
  z.object({ type: z.literal('move'), playerId: playerIdSchema, entityIds: z.array(entityIdSchema), x: z.number(), y: z.number() }),
  z.object({ type: z.literal('attack'), playerId: playerIdSchema, entityIds: z.array(entityIdSchema), targetId: entityIdSchema }),
  z.object({ type: z.literal('attackMove'), playerId: playerIdSchema, entityIds: z.array(entityIdSchema), x: z.number(), y: z.number() }),
  z.object({ type: z.literal('moveInOrder'), playerId: playerIdSchema, entityIds: z.array(entityIdSchema), x: z.number(), y: z.number() }),
  z.object({ type: z.literal('harvest'), playerId: playerIdSchema, entityIds: z.array(entityIdSchema), nodeId: entityIdSchema }),
  z.object({ type: z.literal('stop'), playerId: playerIdSchema, entityIds: z.array(entityIdSchema) }),
  z.object({ type: z.literal('setStance'), playerId: playerIdSchema, entityIds: z.array(entityIdSchema), stance: stanceSchema }),
  z.object({ type: z.literal('build'), playerId: playerIdSchema, defId: z.string(), x: z.number(), y: z.number() }),
  z.object({ type: z.literal('deploy'), playerId: playerIdSchema, entityId: entityIdSchema, x: z.number(), y: z.number() }),
  z.object({ type: z.literal('pack'), playerId: playerIdSchema, buildingId: entityIdSchema }),
  z.object({ type: z.literal('produce'), playerId: playerIdSchema, buildingId: entityIdSchema, defId: z.string() }),
  z.object({ type: z.literal('cancelProduce'), playerId: playerIdSchema, buildingId: entityIdSchema, index: z.number() }),
  z.object({ type: z.literal('research'), playerId: playerIdSchema, buildingId: entityIdSchema, defId: z.string() }),
  z.object({ type: z.literal('cancelResearch'), playerId: playerIdSchema, buildingId: entityIdSchema, index: z.number() }),
  z.object({ type: z.literal('setRally'), playerId: playerIdSchema, buildingId: entityIdSchema, x: z.number(), y: z.number() }),
  z.object({ type: z.literal('sellBuilding'), playerId: playerIdSchema, buildingId: entityIdSchema }),
  z.object({ type: z.literal('setRepair'), playerId: playerIdSchema, buildingId: entityIdSchema, enabled: z.boolean() }),
  z.object({ type: z.literal('garrison'), playerId: playerIdSchema, unitIds: z.array(entityIdSchema), buildingId: entityIdSchema }),
  z.object({ type: z.literal('unloadGarrison'), playerId: playerIdSchema, buildingId: entityIdSchema, unitIds: z.array(entityIdSchema).optional() }),
  z.object({ type: z.literal('channel'), playerId: playerIdSchema, entityIds: z.array(entityIdSchema), enabled: z.boolean() }),
  z.object({ type: z.literal('castSpell'), playerId: playerIdSchema, spellId: z.string(), x: z.number(), y: z.number(), entityIds: z.array(entityIdSchema).optional() }),
  z.object({ type: z.literal('steerSuperweapon'), playerId: playerIdSchema, x: z.number(), y: z.number() }),
  z.object({ type: z.literal('surrender'), playerId: playerIdSchema }),
  devCommandSchema,
]);

export const clientMessageSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('join'), room: z.string().max(64), lobbyState: lobbyStateWireSchema.optional() }),
  z.object({ t: z.literal('rejoin'), room: z.string().max(64), connId: z.string().max(64) }),
  z.object({ t: z.literal('lobbyUpdate'), state: lobbyStateWireSchema }),
  z.object({
    t: z.literal('claimSlot'),
    slotId: z.string(),
    team: z.string(),
    color: z.string(),
    startIndex: z.number().nullable(),
    factionId: z.string(),
  }),
  z.object({ t: z.literal('slotReady'), slotId: z.string(), ready: z.boolean() }),
  z.object({ t: z.literal('startMatch') }),
  z.object({ t: z.literal('commands'), forTick: z.number().int().nonnegative(), cmds: z.array(commandSchema).max(256) }),
  z.object({ t: z.literal('checksum'), tick: z.number().int().nonnegative(), hash: z.string().max(16) }),
  z.object({ t: z.literal('ack'), tick: z.number().int().nonnegative() }),
  z.object({ t: z.literal('snapshotRequest') }),
  z.object({ t: z.literal('snapshot'), tick: z.number().int().nonnegative(), state: z.unknown() }),
]);

export const serverMessageSchema = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('joined'),
    connId: z.string(),
    playerId: z.string(),
    seed: z.number(),
    startTick: z.number(),
    isHost: z.boolean(),
    lobbyState: lobbyStateWireSchema,
    waiting: z.boolean(),
  }),
  z.object({ t: z.literal('lobbyState'), state: lobbyStateWireSchema }),
  z.object({ t: z.literal('waiting'), playerCount: z.number(), maxPlayers: z.number() }),
  z.object({ t: z.literal('peerJoined'), playerId: z.string() }),
  z.object({ t: z.literal('peerLeft'), playerId: z.string() }),
  z.object({ t: z.literal('peerDisconnected'), playerId: z.string() }),
  z.object({ t: z.literal('matchStart'), startTick: z.number(), seed: z.number(), state: lobbyStateWireSchema }),
  z.object({ t: z.literal('tick'), tick: z.number(), cmds: z.array(commandSchema) }),
  z.object({ t: z.literal('peerChecksum'), playerId: z.string(), tick: z.number(), hash: z.string() }),
  z.object({ t: z.literal('snapshotRequest'), forConnId: z.string() }),
  z.object({ t: z.literal('snapshot'), fromTick: z.number(), state: z.unknown() }),
  z.object({ t: z.literal('error'), message: z.string() }),
]);

export type ParsedClientMessage = z.infer<typeof clientMessageSchema>;
export type ParsedServerMessage = z.infer<typeof serverMessageSchema>;

export function parseClientMessage(raw: unknown): ParsedClientMessage | null {
  const result = clientMessageSchema.safeParse(raw);
  return result.success ? result.data : null;
}

export function parseServerMessage(raw: unknown): ParsedServerMessage | null {
  const result = serverMessageSchema.safeParse(raw);
  return result.success ? result.data : null;
}
