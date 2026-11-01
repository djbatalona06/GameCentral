// The cast, in one place: what they want and how their feelings about Ines are described.
// The journal "People" page shows these words instead of raw numbers.

import type { CharacterId, StoryState } from "./State";

export interface CharacterInfo {
  id: CharacterId;
  name: string;
  /** What the number measures. */
  measures: string;
  /** Word for each band of the 0..10 score. Index = Math.floor(value / 2). */
  ladder: [string, string, string, string, string, string];
  /** One line shown in the journal. */
  blurb: string;
  /** The chapter where Ines first meets them (the journal does not list them before that). */
  firstChapter: number;
}

export const CHARACTERS: Record<CharacterId, CharacterInfo> = {
  bram: {
    id: "bram",
    name: "Bram Okafor",
    measures: "Trust",
    ladder: ["Estranged", "Wary", "Steady", "Trusting", "Close", "Family"],
    blurb: "Ines's mentor and boat captain. He owes a dangerous debt and has not told her.",
    firstChapter: 1,
  },
  kessa: {
    id: "kessa",
    name: "Kessa Varn",
    measures: "Respect",
    ladder: ["Enemy", "Grudging", "Respectful rival", "Almost an ally", "Ally", "Sworn ally"],
    blurb: "Varek's lieutenant. Blunt and fearless, and tired of taking orders.",
    firstChapter: 3,
  },
};

/** Words for the current feeling, e.g. "Wary". */
export function feeling(id: CharacterId, story: StoryState): string {
  const info = CHARACTERS[id];
  return info.ladder[Math.min(5, Math.floor(story.rel[id] / 2))];
}
