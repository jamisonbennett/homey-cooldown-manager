export interface CooldownEntry {
  lastRunAt: number | null;
}

export type CooldownState = Record<string, CooldownEntry>;

export function loadCooldownState(raw: unknown): CooldownState;
