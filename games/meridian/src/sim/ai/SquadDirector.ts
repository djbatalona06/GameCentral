// The squad director keeps fights fair and readable: only a few enemies may shoot at the same
// time ("attack tokens"), only one may flank at once, and an alert spreads through the squad.

import { TUNING } from "../../config/tuning";

export interface SquadMember {
  id: string;
  arena: string;
  alive: boolean;
  distanceToPlayer: number;
  wantsToShoot: boolean;
  lastShotAgo: number;
}

export class SquadDirector {
  private tokens = new Map<string, number>(); // member id -> seconds left holding the token
  private flankers = new Map<string, string>(); // arena -> member id
  maxShooters: number;

  constructor(difficulty: number) {
    this.maxShooters = TUNING.ai.maxShootersByDifficulty[Math.max(0, Math.min(3, difficulty))];
  }

  setDifficulty(difficulty: number): void {
    this.maxShooters = TUNING.ai.maxShootersByDifficulty[Math.max(0, Math.min(3, difficulty))];
  }

  holds(id: string): boolean {
    return this.tokens.has(id);
  }

  get activeTokens(): number {
    return this.tokens.size;
  }

  /**
   * Grants tokens to the most deserving requesters: closest to the player first, but members
   * that have waited longest get a bonus so everyone gets a turn.
   */
  update(dt: number, members: SquadMember[], burstSeconds = 1.6): void {
    for (const [id, t] of this.tokens) {
      const m = members.find((x) => x.id === id);
      const left = t - dt;
      if (left <= 0 || !m || !m.alive) this.tokens.delete(id);
      else this.tokens.set(id, left);
    }
    const free = this.maxShooters - this.tokens.size;
    if (free <= 0) return;
    const candidates = members
      .filter((m) => m.alive && m.wantsToShoot && !this.tokens.has(m.id))
      .sort((a, b) => a.distanceToPlayer - a.lastShotAgo * 3 - (b.distanceToPlayer - b.lastShotAgo * 3));
    for (const m of candidates.slice(0, free)) this.tokens.set(m.id, burstSeconds);
  }

  release(id: string): void {
    this.tokens.delete(id);
  }

  /** Only one flanker per arena at a time. */
  requestFlank(arena: string, id: string): boolean {
    const cur = this.flankers.get(arena);
    if (cur && cur !== id) return false;
    this.flankers.set(arena, id);
    return true;
  }

  releaseFlank(arena: string, id: string): void {
    if (this.flankers.get(arena) === id) this.flankers.delete(arena);
  }
}
