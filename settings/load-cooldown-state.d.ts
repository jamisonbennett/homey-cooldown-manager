export const SUSPENDED_USED_COUNT: -1;

export interface CooldownEntry {
  lastRunAt: number | null;
  blockCount: number;
  usedCount: number;
}

export type CooldownState = Record<string, CooldownEntry>;

export function loadCooldownState(raw: unknown): CooldownState;
