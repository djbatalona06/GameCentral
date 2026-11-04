// Chatter: short unscripted lines from Ines (thinking aloud) and Bram (on the radio) that make the
// world feel alive between story moments. They are shown as small "bark" captions, never cut into
// story dialogue, never repeat inside a chapter, and wait a while between each other.

import type { Line, Speaker } from "./types";

export type ChatterKind = "idle" | "treasure" | "closeCall";

/** Seconds standing still (no movement input, no fight, nothing being said) before an idle line. */
export const CHATTER_IDLE_AFTER = 25;
/** Shortest gap between two chatter lines. */
export const CHATTER_COOLDOWN = 45;

type Pool = Array<[Speaker, string]>;

const GENERAL: Record<ChatterKind, Pool> = {
  idle: [
    ["Bram", "Still with me, Ines? You've gone quiet."],
    ["Ines", "Catalina came this way. I can feel it."],
    ["Bram", "Take your time. Not too much time. But some time."],
    ["Ines", "Somewhere, a map is laughing at me."],
    ["Bram", "Radio check. Say something rude so I know it's you."],
    ["Ines", "Four hundred years, and still one step ahead of me."],
  ],
  treasure: [
    ["Ines", "Now that's worth the climb."],
    ["Ines", "Into the bag you go."],
    ["Bram", "Tell me that's gold. Please tell me that's gold."],
    ["Ines", "Catalina, you beautiful show-off."],
    ["Ines", "Someone hid this on purpose. I like them already."],
  ],
  closeCall: [
    ["Ines", "Too close. Way too close."],
    ["Bram", "You're bleeding on my radio, aren't you?"],
    ["Ines", "Okay. Breathe. Still in one piece."],
    ["Bram", "Next time, maybe duck a little earlier?"],
  ],
};

/** A few idle lines that only make sense in one place. */
const BY_CHAPTER: Record<string, Pool> = {
  ch01: [
    ["Ines", "Gulls everywhere. At least someone's enjoying the tide."],
    ["Bram", "Tide's turning. I can hear it from the boat."],
  ],
  ch02: [
    ["Ines", "This whole port smells of spice and old rope."],
    ["Bram", "Watch the rooftops. Qasr Amal loves its rooftops."],
  ],
  ch03: [
    ["Ines", "Everything in this jungle wants to bite me."],
    ["Bram", "If you see a snake, don't describe it to me."],
  ],
  ch04: [
    ["Ines", "Sand in my boots. Sand in my teeth. Sand everywhere."],
    ["Bram", "Drink some water. That's an order from your elders."],
  ],
  ch05: [
    ["Ines", "It's so quiet up here I can hear my own heartbeat."],
    ["Bram", "Monks, mountains and bells. Not my kind of holiday."],
  ],
  ch06: [
    ["Ines", "Look at those stars. Catalina sailed by these."],
    ["Bram", "Hold on to something. That train doesn't care about you."],
  ],
  ch07: [
    ["Ines", "Cranes, cargo and Gilt guards. Lovely."],
    ["Bram", "Varek's ship is somewhere in that forest of masts."],
  ],
};

/** The lines that can be said for this moment in this chapter. */
export function chatterPool(kind: ChatterKind, chapterId: string): Pool {
  return kind === "idle" ? [...GENERAL.idle, ...(BY_CHAPTER[chapterId] ?? [])] : GENERAL[kind];
}

/** Keeps track of what has been said, and picks the next line (or nothing). */
export class Chatter {
  private used = new Set<string>();
  /** Time of the last line, in sim seconds. Starts "a while ago" minus a grace period after loading. */
  private last = -CHATTER_COOLDOWN + 20;

  constructor(private chapterId: string) {}

  ready(now: number): boolean {
    return now - this.last >= CHATTER_COOLDOWN;
  }

  /** Picks an unused line for this moment, or null if on cooldown or everything was said. */
  pick(kind: ChatterKind, now: number, rand: () => number): Line | null {
    if (!this.ready(now)) return null;
    const options = chatterPool(kind, this.chapterId).filter(([, text]) => !this.used.has(text));
    if (!options.length) return null;
    const [speaker, text] = options[Math.floor(rand() * options.length) % options.length];
    this.used.add(text);
    this.last = now;
    return { speaker, text, bark: true };
  }
}
