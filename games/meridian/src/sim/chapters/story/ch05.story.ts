// Chapter 5 — Bell of Saint Aurel: story layer.
// The caravan crew you freed in chapter 4 leave supplies and let you muffle the bells.

import type { StoryLayer } from "../../story/Layer";

export const ch05Story: StoryLayer = {
  onStart: [
    {
      type: "branch",
      if: { flag: "caravan.saved" },
      then: [
        { type: "give", grenades: 1, bottles: 1 },
        {
          type: "dialogue",
          lines: [
            { speaker: "Bram", text: "Look at that. The caravan crew left a pack on the trail. Felt, rope and a few grenades." },
            { speaker: "Ines", text: "Good people tend to leave good things behind." },
          ],
        },
      ],
      otherwise: [{ type: "set", flag: "bells.loud" }],
    },
  ],
  events: {
    note: [
      {
        type: "branch",
        if: { flag: "caravan.saved" },
        then: [
          {
            type: "choice",
            id: "bell_plan",
            speaker: "Bram",
            prompt: "\"Those bells carry for miles. We have the caravan's felt. Wrap the clappers, or ring them loud and run?\"",
            defaultOption: "loud",
            options: [
              { id: "loud", label: "Ring them loud. Speed matters.", hint: "Fast. The mountain will hear.", effects: { stance: 1, set: ["bells.loud"] } },
              { id: "muffle", label: "Wrap the clappers in felt first.", hint: "Gentler on the mountain.", effects: { stance: -1, set: ["bells.muffled"] } },
            ],
          },
        ],
      },
    ],
    "bell_plan:loud": [{ type: "dialogue", lines: [{ speaker: "Ines", text: "Fast and loud. The mountain can complain later." }] }],
    "bell_plan:muffle": [
      { type: "journal", id: "catalina-bell" },
      { type: "dialogue", lines: [{ speaker: "Ines", text: "Felt on the clappers. Let's see if a mountain can keep a secret." }, { speaker: "Bram", text: "Catalina would approve." }] },
    ],
  },
  journal: [
    {
      id: "catalina-bell",
      title: "Catalina and the Bell",
      text: "Scratched into the belfry wall, in Spanish: 'I rang this bell once and the mountain answered. I never rang it again.'",
    },
  ],
  downtime: [
    {
      id: "ch05-bram",
      label: "Warm up with Bram",
      lines: [
        { speaker: "Bram", text: "You wrapped those bells. Slower, but the snow only half-buried us.", if: { flag: "bells.muffled" } },
        { speaker: "Bram", text: "That avalanche had your name on it. Your fault, but I forgive you.", if: { flag: "bells.loud" } },
        { speaker: "Ines", text: "You never talk about before the boat." },
        { speaker: "Bram", text: "That's because the boat is the good part." },
      ],
    },
    {
      id: "ch05-chart",
      label: "Read the whole chart",
      lines: [
        { speaker: "Ines", text: "A circle of open water. 'Meridia, que el mar guarda.' Which the sea keeps." },
        { speaker: "Catalina", text: "The sea is a better keeper than any king. It asks nothing, and gives back only what it chooses." },
      ],
    },
  ],
};
