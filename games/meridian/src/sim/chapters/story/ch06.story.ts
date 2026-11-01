// Chapter 6 — Night Train to Varanask: story layer.
// If Ines spared Kessa in chapter 3, Kessa offers a truce at the end of the chapter (major choice).

import type { StoryLayer } from "../../story/Layer";

export const ch06Story: StoryLayer = {
  onStart: [
    {
      type: "dialogue",
      lines: [
        { speaker: "Gilt Radio", text: "Lieutenant Varn has the chart case. Nobody bothers her. Nobody asks why.", if: { flag: "ines.has_radio" } },
      ],
    },
  ],
  events: {
    stopped: [
      {
        type: "branch",
        if: { rel: "kessa", min: 3 },
        then: [
          { type: "dialogue", lines: [{ speaker: "Kessa", text: "Brakes held. Huh. You could have let it run." }] },
          {
            type: "choice",
            id: "kessa_truce",
            speaker: "Kessa",
            prompt: "\"Varek told me to burn this train. I'm done taking orders from a man who doesn't care who's aboard. Let me walk, Calder.\"",
            defaultOption: "accept",
            options: [
              { id: "accept", label: "Let her go. She has earned that.", hint: "Respect has to start somewhere.", effects: { rel: { kessa: 2 }, set: ["kessa.truce"] } },
              { id: "refuse", label: "No. Not after everything.", hint: "You cannot trust her yet.", effects: { rel: { kessa: -1 }, stance: 1, set: ["kessa.rebuffed"] } },
            ],
          },
        ],
        otherwise: [{ type: "dialogue", lines: [{ speaker: "Kessa", text: "This isn't over, Calder." }] }],
      },
    ],
    "kessa_truce:accept": [
      {
        type: "dialogue",
        lines: [
          { speaker: "Kessa", text: "You're a fool." },
          { speaker: "Kessa", text: "...A useful one. If you ever need a door kicked in, find me." },
        ],
      },
    ],
    "kessa_truce:refuse": [{ type: "dialogue", lines: [{ speaker: "Kessa", text: "Then I'll see you when I see you. And I won't hold back." }] }],
  },
  downtime: [
    {
      id: "ch06-bram",
      label: "Sit with Bram in the empty car",
      lines: [
        { speaker: "Bram", text: "You gave Kessa a way out. Not many people would.", if: { flag: "kessa.truce" } },
        { speaker: "Bram", text: "You kept your guard up with Kessa. Smart, probably.", if: { flag: "kessa.rebuffed" } },
        { speaker: "Bram", text: "Ironwood Docks. Funny, I used to work near there." },
        { speaker: "Ines", text: "Did you?" },
        { speaker: "Bram", text: "A long time ago. Doesn't matter now." },
      ],
    },
    {
      id: "ch06-case",
      label: "Read the shipping orders",
      lines: [
        { speaker: "Ines", text: "Tomorrow night. Ironwood Docks. A ship called the Gilded Tide." },
        { speaker: "Catalina", text: "Beware the one who comes with maps already drawn. He has not come to learn the sea; he has come to own it." },
      ],
    },
  ],
};
