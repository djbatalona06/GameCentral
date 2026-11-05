// The shape of each chapter's story, and where the story can branch in chapters not yet built.
// Every chapter follows the same five beats, so a writer always knows where a character moment goes.

import type { ChapterBeats } from "../../story/types";

/** Act I (built). */
export const BEATS: Record<number, ChapterBeats> = {
  1: {
    hook: "Ines dives the wreck of Catalina's ship and finds an astrolabe with a secret meridian.",
    rising: "Bram talks her through the cliff and the watchtower; he trusts her skill more than she knows.",
    setPiece: "Stealth past the Gilt patrol, then a zipline escape to the cove.",
    choice: "How to answer Varek's offer (refuse, stall or bluff), and whether to share the rubbing with Bram.",
    fallout: "Varek's tone for the next six chapters; how much Bram is told.",
  },
  2: {
    hook: "The meridian points east to Qasr Amal and Catalina's sealed archive.",
    rising: "A frightened stall owner shows what the Gilt Company has done to the town.",
    setPiece: "Rooftop sniper, collapsing awning, market shootout.",
    choice: "Help the stall owner (or learn from him), and copy Catalina's letter or take it.",
    fallout: "A tip in the sniper fight; Varek's lines about the letter in chapter 3.",
  },
  3: {
    hook: "The archive leads to a jungle temple called the Green Vault.",
    rising: "Bram circles by boat, patchy on the radio; Ines is on her own in the grass.",
    setPiece: "Pillar lock, collapsing bridge, grapple swing, then the first fight with Kessa.",
    choice: "What to do with Kessa once she is beaten: help her up, take her radio, or walk away.",
    fallout: "Kessa's respect; a captured radio that lets Ines listen to the Gilt Company.",
  },
  4: {
    hook: "A captured caravan holds half of Catalina's star chart.",
    rising: "Bram has driven this road before, and will not say when.",
    setPiece: "Camp stealth, jeep chase (drive, then gun), sandstorm ambush, tower climb.",
    choice: "Free the caged caravan crew, or leave them (found only by exploring).",
    fallout: "The crew leave supplies on the monastery trail in chapter 5.",
  },
  5: {
    hook: "The second half of the chart is in a bell tower at Saint Aurel.",
    rising: "The monastery is silent and snowbound; Bram warns that sound carries.",
    setPiece: "Cliff climb, courtyard fight, bell puzzle, avalanche escape.",
    choice: "Ring the bells loud, or wrap them in the caravan's felt (only if the crew were freed).",
    fallout: "How Kessa describes the avalanche in chapter 6; a first nudge toward Keeper or Seeker.",
  },
  6: {
    hook: "The chart leads to the night train to Varanask, where Kessa carries the case.",
    rising: "Bram is in the car behind, and Kessa remembers how Ines treated her.",
    setPiece: "Roof-to-roof fights, tunnels, the rematch with Kessa, stopping the runaway engine.",
    choice: "If Kessa was spared, she offers a truce: let her walk, or refuse.",
    fallout: "Whether Kessa is an ally, a rival or an enemy for the rest of the story.",
  },
  7: {
    hook: "Varek's ship, the Gilded Tide, is loading at Ironwood Docks.",
    rising: "Bram knows these docks better than he admits; a brass dog tag is hidden in the office.",
    setPiece: "Searchlight stealth, fuse puzzle, swinging cranes, a fight across the ship's deck.",
    choice: "If Ines found the dog tag: ask Bram straight, or wait.",
    fallout: "How Bram's betrayal plays out in Act II: reluctant or cold.",
  },
};

/** Chapters 8 to 22 (not built yet): where the story can branch, so building them is content work. */
export const BRANCH_NOTES: Record<number, string> = {
  8: "Bram's radio is the only voice in the blizzard. High trust: he talks Ines through it. Low trust: the signal drops at the worst moment. Choice: burn Catalina's navigator's pages for warmth, or ration the fuel.",
  9: "Heist approach: talk your way through the party, sneak, or go loud. The party scene changes with the playstyle of chapter 7. Varek cameo in disguise.",
  10: "Flooded streets. If the caravan crew were freed in chapter 4, they ferry Ines; if not, she finds a boat the hard way. Rooftop gardens and a choice about whom to help first.",
  11: "Underwater second key. Choice: share your last air with an ally (spends air, earns trust) or press on alone.",
  12: "Bram's betrayal. If trust is 6 or higher, or he was confronted in chapter 7: reluctant, and he leaves a warning that gives Ines a tool. Otherwise: cold, with an extra Gilt fight.",
  13: "Ashfall Pass, alone. If Kessa's truce was accepted, she leaves a supply cache. If Ines has the radio, she hears the dig site's schedule.",
  14: "The Glass Desert. Proof that Meridia was real. Choice: document it and leave it, or take a relic (Keeper or Seeker).",
  15: "Bram's Debt. Confronted in chapter 7: he confesses everything. Suspected: he is hurt that she doubted him. Team-up firefight either way.",
  16: "Storm Passage. If Kessa's respect is 7 or higher she defects and fights beside Ines. Otherwise she commands a rival ship.",
  17: "Isle of Lanterns. Catalina's descendants. Callbacks to every kind act in Act I. A quiet choice about what to take home.",
  18: "The Ordaz Lighthouse, third key. Kessa's last stand: she dies, walks away, or joins you, decided by respect.",
  19: "Undertow. As the caves flood, Ines chooses whom to save first. The choice feeds the Lantern ending.",
  20: "Meridia at low tide. Stance decides which districts open: Keeper preserves, Seeker reaches the treasury.",
  21: "Heart of the Codex. Final confrontation with Varek, then the last choice: keep Meridia hidden (final:keep) or open it to the world (final:share, needs trust 7 and respect 5).",
  22: "True North. The epilogue is chosen by resolveEnding(): The Keeper, Open Water or The Lantern.",
};
