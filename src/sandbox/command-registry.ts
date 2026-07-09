import type { SandboxController } from './sandbox-controller';

export type CommandCategory =
  | 'economy'
  | 'buildings'
  | 'units'
  | 'ai'
  | 'map'
  | 'gameplay'
  | 'research'
  | 'spells'
  | 'combat'
  | 'sandbox';

export interface ParamDef {
  name: string;
  type: 'string' | 'number' | 'boolean';
  optional?: boolean;
  description?: string;
  autocomplete?: (ctx: SandboxContext, partial: string) => string[];
}

export interface SandboxContext {
  controller: SandboxController;
  registry: import('../data/registry').Registry;
  humanId: string;
}

export interface PaletteCommand {
  id: string;
  category: CommandCategory;
  aliases: string[];
  description: string;
  params: ParamDef[];
  help: string;
  execute(ctx: SandboxContext, args: Record<string, string | number | boolean>): string | null;
}

export interface ParsedCommand {
  command: PaletteCommand;
  args: Record<string, string | number | boolean>;
}

const registry: PaletteCommand[] = [];

export function registerCommand(cmd: PaletteCommand): void {
  registry.push(cmd);
}

export function getCommands(): readonly PaletteCommand[] {
  return registry;
}

export function getFavorites(): string[] {
  try {
    return JSON.parse(localStorage.getItem('arcane:sandbox-favorites') ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function toggleFavorite(id: string): void {
  const favs = getFavorites();
  const idx = favs.indexOf(id);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.push(id);
  localStorage.setItem('arcane:sandbox-favorites', JSON.stringify(favs));
}

export function getHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem('arcane:sandbox-cmd-history') ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function pushHistory(line: string): void {
  const hist = getHistory().filter((h) => h !== line);
  hist.unshift(line);
  localStorage.setItem('arcane:sandbox-cmd-history', JSON.stringify(hist.slice(0, 50)));
}

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  for (const ch of input.trim()) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (cur) tokens.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur) tokens.push(cur);
  return tokens;
}

function matchCommand(tokens: string[]): { cmd: PaletteCommand; offset: number } | null {
  if (!tokens.length) return null;
  const two = tokens.length >= 2 ? `${tokens[0]} ${tokens[1]}`.toLowerCase() : '';
  const one = tokens[0]!.toLowerCase();
  for (const cmd of registry) {
    if (cmd.id === two || cmd.aliases.some((a) => a.toLowerCase() === two)) return { cmd, offset: 2 };
  }
  for (const cmd of registry) {
    if (cmd.id === one || cmd.aliases.some((a) => a.toLowerCase() === one)) return { cmd, offset: 1 };
  }
  for (const cmd of registry) {
    if (cmd.id.startsWith(one) || cmd.aliases.some((a) => a.toLowerCase().startsWith(one))) return { cmd, offset: 1 };
  }
  return null;
}

export function parseCommandLine(input: string): { ok: true; parsed: ParsedCommand } | { ok: false; error: string } {
  const tokens = tokenize(input);
  if (!tokens.length) return { ok: false, error: 'Enter a command' };
  const matched = matchCommand(tokens);
  if (!matched) return { ok: false, error: `Unknown command: ${tokens[0]}` };
  const { cmd, offset } = matched;

  const args: Record<string, string | number | boolean> = {};
  let ti = offset;
  for (const param of cmd.params) {
    if (ti >= tokens.length) {
      if (!param.optional) return { ok: false, error: `Missing parameter: ${param.name}` };
      break;
    }
    const raw = tokens[ti]!;
    if (param.type === 'number') {
      const n = Number(raw);
      if (Number.isNaN(n)) return { ok: false, error: `${param.name} must be a number` };
      args[param.name] = n;
    } else if (param.type === 'boolean') {
      args[param.name] = raw === 'on' || raw === 'true' || raw === '1';
    } else {
      args[param.name] = raw;
    }
    ti++;
  }
  return { ok: true, parsed: { command: cmd, args } };
}

export function searchCommands(query: string): PaletteCommand[] {
  const q = query.toLowerCase().trim();
  if (!q) return [...registry];
  return registry.filter(
    (c) =>
      c.id.includes(q) ||
      c.aliases.some((a) => a.includes(q)) ||
      c.description.toLowerCase().includes(q) ||
      c.category.includes(q),
  );
}

export function executeCommandLine(
  ctx: SandboxContext,
  input: string,
): { ok: true } | { ok: false; error: string } {
  const parsed = parseCommandLine(input);
  if (!parsed.ok) return parsed;
  pushHistory(input.trim());
  const err = parsed.parsed.command.execute(ctx, parsed.parsed.args);
  if (err) return { ok: false, error: err };
  return { ok: true };
}
