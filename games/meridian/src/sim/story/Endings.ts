// The three endings. Act I only starts the numbers moving; Act III makes the final call
// (the flags "final:keep" and "final:share" are set by the last choice in chapter 21).

import type { StoryState } from "./State";

export type EndingId = "keeper" | "sharer" | "lantern";

export interface EndingInfo {
  id: EndingId;
  title: string;
  summary: string;
}

export const ENDINGS: Record<EndingId, EndingInfo> = {
  keeper: { id: "keeper", title: "The Keeper", summary: "Ines hides Meridia again and lets the tide take it, the way Catalina meant it to be." },
  sharer: { id: "sharer", title: "Open Water", summary: "With Bram and Kessa beside her, Ines opens Meridia to the world, carefully and together." },
  lantern: { id: "lantern", title: "The Lantern", summary: "Ines chased the prize too long. A friend pays the price, and she carries a lantern for them." },
};

/** Needed for Open Water: both friends have to trust her enough to stand beside her. */
export const SHARER_GATE = { bram: 7, kessa: 5 };

export function resolveEnding(s: StoryState): EndingId {
  const keep = s.flags["final:keep"] === true;
  const share = s.flags["final:share"] === true;
  if (!keep && s.stance >= 3) return "lantern";
  if (share && s.rel.bram >= SHARER_GATE.bram && s.rel.kessa >= SHARER_GATE.kessa) return "sharer";
  return "keeper";
}
