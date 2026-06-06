export interface CooldownEntry {
  lastRunAt: number | null;
  blockCount: number;
}

export type CooldownState = Record<string, CooldownEntry>;

export function loadCooldownState(raw: unknown): CooldownState;
