// Chapter 1 — Breakwater: story layer.
// Choices: how Ines answers Varek (major) and whether she shares the rubbing with Bram (small).

import type { StoryLayer } from "../../story/Layer";

export const ch01Story: StoryLayer = {
  events: {
    // Varek's offer comes right after the cutscene where he arrives.
    astrolabe: [
      {
        type: "choice",
        id: "varek_offer",
        speaker: "Varek",
        prompt: "\"Hand it over, Miss Calder, and you may swim home dry.\"",
        defaultOption: "stall",
        options: [
          { id: "refuse", label: "Not a chance, Varek.", hint: "Bold. He will remember it.", effects: { set: ["varek.refused"] } },
          { id: "stall", label: "What exactly are you offering?", hint: "Buy time and keep him talking.", effects: { set: ["varek.stalled"] } },
          { id: "bluff", label: "Too late. I sent the rubbing to a museum.", hint: "A lie he may check.", effects: { set: ["varek.bluffed"] } },
        ],
      },
    ],
    "varek_offer:refuse": [
      { type: "journal", id: "catalina-king" },
      { type: "dialogue", lines: [{ speaker: "Ines", text: "Not a chance." }, { speaker: "Varek", text: "Brave. Brave is expensive, Miss Calder." }] },
    ],
    "varek_offer:stall": [
      { type: "journal", id: "catalina-king" },
      { type: "dialogue", lines: [{ speaker: "Ines", text: "I'm listening. Roughly." }, { speaker: "Varek", text: "A negotiator. Keep talking. It will not help." }] },
    ],
    "varek_offer:bluff": [
      { type: "journal", id: "catalina-king" },
      { type: "dialogue", lines: [{ speaker: "Ines", text: "Already sent a rubbing to three museums. Good luck with that." }, { speaker: "Varek", text: "Then I shall have to acquire three museums." }] },
    ],
    reach_boat: [
      // Bram notices how she played the tower.
      {
        type: "dialogue",
        lines: [
          { speaker: "Bram", text: "I never saw you once on that tower. Remind me never to play cards with you.", if: { style: "ghost" } },
          { speaker: "Bram", text: "I heard that tower from the cove. Subtle, you are not.", if: { style: "brawler" } },
        ],
      },
      {
        type: "choice",
        id: "rubbing",
        speaker: "Bram",
        prompt: "\"Well? Let me see this rubbing, then.\"",
        defaultOption: "show",
        options: [
          { id: "show", label: "Hand him the rubbing.", hint: "Trust is built from small things.", effects: { rel: { bram: 1 }, set: ["ines.shared_rubbing"] } },
          { id: "keep", label: "\"Just scratches for now.\"", hint: "Keep it to yourself.", effects: { rel: { bram: -1 }, stance: 1, set: ["ines.kept_secret"] } },
        ],
      },
    ],
    "rubbing:show": [{ type: "dialogue", lines: [{ speaker: "Bram", text: "Good eyes. That line was cut by hand. Hers." }] }],
    "rubbing:keep": [{ type: "dialogue", lines: [{ speaker: "Bram", text: "Scratches. Sure. I'll pretend I believe that." }] }],
  },
  journal: [
    {
      id: "catalina-king",
      title: "Catalina and the King's Men",
      text: "From a letter to her brother, 1574: 'The king's men asked for my chart. I gave them a different sea. A true chart is a map to a grave; a false one is only a map to a story.' She does not say whether she was proud of it.",
    },
  ],
  downtime: [
    {
      id: "ch01-bram",
      label: "Sit with Bram on the boat",
      lines: [
        { speaker: "Bram", text: "Four hundred years she's been gone, and people still can't let her be." },
        { speaker: "Ines", text: "She isn't a ghost. She's a navigator who left a trail." },
        { speaker: "Bram", text: "Trails go two ways, kid. Remember that." },
      ],
      effects: { rel: { bram: 1 } },
    },
    {
      id: "ch01-letter",
      label: "Read Catalina's note aloud",
      lines: [
        { speaker: "Catalina", text: "To whoever finds this: I did not hide the sea out of fear." },
        { speaker: "Catalina", text: "I hid it because I loved it, and some things you love are safest unseen." },
      ],
    },
  ],
};
