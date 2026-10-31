// Room sound. Each space has a reverb made from decaying noise (an "impulse response") so a
// cave rings for seconds while a beach is almost dry. No recordings needed.

export type SpaceId = "open" | "street" | "courtyard" | "interior" | "cave" | "train" | "jungle";

export interface Space {
  /** Reverb length in seconds. */
  seconds: number;
  /** How quickly the tail fades (higher = faster). */
  decay: number;
  /** 0 = dark and muffled tail, 1 = bright. */
  brightness: number;
  /** How loud the reverb is in the mix. */
  wet: number;
}

export const SPACES: Record<SpaceId, Space> = {
  open: { seconds: 0.8, decay: 4, brightness: 0.4, wet: 0.08 },
  jungle: { seconds: 1.0, decay: 3.5, brightness: 0.3, wet: 0.14 },
  street: { seconds: 1.2, decay: 3, brightness: 0.6, wet: 0.2 },
  courtyard: { seconds: 1.8, decay: 2.6, brightness: 0.55, wet: 0.28 },
  interior: { seconds: 1.4, decay: 3, brightness: 0.5, wet: 0.3 },
  cave: { seconds: 3.2, decay: 1.8, brightness: 0.35, wet: 0.45 },
  train: { seconds: 0.5, decay: 5, brightness: 0.7, wet: 0.12 },
};

const cache = new Map<string, AudioBuffer>();

/** Stereo decaying noise, low-passed over time so the tail darkens like a real room. */
export function impulseResponse(ctx: BaseAudioContext, seconds: number, decay: number, brightness: number): AudioBuffer {
  const key = `${ctx.sampleRate}:${seconds}:${decay}:${brightness}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const n = Math.random() * 2 - 1;
      // A one-pole low-pass whose cutoff falls over time.
      const k = brightness * (1 - t) * 0.9 + 0.05;
      lp += (n - lp) * k;
      d[i] = lp * Math.pow(1 - t, decay);
    }
  }
  cache.set(key, buf);
  return buf;
}

/** Picks the space for where the player is standing. Pure, so it can be unit-tested. */
export function spaceAt(chapterId: string, pos: { x: number; y: number; z: number }, tunnelOverhead: boolean): SpaceId {
  if (tunnelOverhead) return "cave";
  switch (chapterId) {
    case "ch02":
      return "street";
    case "ch03":
      return pos.z > 186 ? "cave" : pos.z > 44 && pos.y > 6 ? "courtyard" : "jungle";
    case "ch05":
      return pos.z > 268 && pos.y < 10 ? "cave" : pos.y > 17 && pos.z < 180 ? "courtyard" : "open";
    case "ch06":
      return "train";
    case "ch07":
      return pos.z > 176 ? "interior" : "street";
    default:
      return "open";
  }
}
