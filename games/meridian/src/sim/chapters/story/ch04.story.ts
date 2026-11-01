// Chapter 4 — Salt Road: story layer.
// Choice: free the caged caravan crew, or not (optional, found by exploring). It pays off in chapter 5.

import type { StoryLayer } from "../../story/Layer";

export const ch04Story: StoryLayer = {
  onStart: [
    {
      type: "dialogue",
      lines: [
        { speaker: "Gilt Radio", text: "Camp sweep on the hour. West wagons first, then the scrub.", if: { flag: "ines.has_radio" } },
        { speaker: "Ines", text: "Kessa's radio is paying for itself already.", if: { flag: "ines.has_radio" } },
      ],
    },
  ],
  events: {
    captives: [
      { type: "dialogue", lines: [{ speaker: "Caravaneer", text: "Please. The Gilt men took our water and our camels. They'll sell us in Varanask." }] },
      {
        type: "choice",
        id: "captives",
        speaker: "Narrator",
        prompt: "A cage wagon holds the caravan's crew, hands tied. Free them?",
        defaultOption: "leave",
        options: [
          { id: "free", label: "Cut them loose, quietly.", hint: "It costs a minute. They will remember.", effects: { rel: { bram: 1 }, stance: -1, set: ["caravan.saved"] } },
          { id: "leave", label: "Leave them. You cannot spare the time.", hint: "The guards will find them eventually.", effects: { stance: 1, set: ["caravan.left"] } },
        ],
      },
    ],
    "captives:free": [
      {
        type: "dialogue",
        lines: [
          { speaker: "Caravaneer", text: "Salt and sun on you, stranger. We'll leave a pack on the monastery trail." },
          { speaker: "Bram", text: "That's the Ines I trained." },
        ],
      },
    ],
    "captives:leave": [{ type: "dialogue", lines: [{ speaker: "Bram", text: "Hard call. Hard road." }] }],
  },
  downtime: [
    {
      id: "ch04-bram",
      label: "Share water with Bram",
      lines: [
        { speaker: "Bram", text: "I've driven this road before. Different decade. Different company.", },
        { speaker: "Ines", text: "Whose company?" },
        { speaker: "Bram", text: "The kind you don't put in a story, kid." },
      ],
      effects: { rel: { bram: 1 } },
    },
    {
      id: "ch04-radio",
      label: "Listen to Kessa's radio",
      requires: { flag: "ines.has_radio" },
      lines: [
        { speaker: "Gilt Radio", text: "Lieutenant Varn has not checked in since the jungle. Anyone have eyes on her?" },
        { speaker: "Varek", text: "Kessa is resting. She will return when she has remembered whose side she is on." },
      ],
      effects: { rel: { kessa: 1 } },
    },
    {
      id: "ch04-chart",
      label: "Study the star chart",
      lines: [
        { speaker: "Catalina", text: "I tore the chart in two. Not to be clever. To be sure that no single person would ever have all of it." },
      ],
    },
  ],
};
