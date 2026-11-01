// Chapter 7 — Ironwood Docks: story layer.
// If Ines found Bram's dog tag by exploring, she can confront him now or wait (major choice).
// That answer shapes how Bram's betrayal plays out in Act II.

import type { StoryLayer } from "../../story/Layer";

export const ch07Story: StoryLayer = {
  onStart: [
    {
      type: "dialogue",
      lines: [
        { speaker: "Gilt Radio", text: "Yard lights rotate on the hour. East tower reports first.", if: { flag: "ines.has_radio" } },
        { speaker: "Ines", text: "Thank you, Gilt Company.", if: { flag: "ines.has_radio" } },
      ],
    },
  ],
  events: {
    manifest: [
      { type: "journal", id: "catalina-debt" },
      {
        type: "branch",
        if: { treasure: "ch07-tag" },
        then: [
          {
            type: "choice",
            id: "dog_tag",
            speaker: "Narrator",
            prompt: "In your pocket: a brass dog tag stamped B. OKAFOR, MV SALT HARE. Bram never mentioned working these docks. Ask him now, or wait?",
            defaultOption: "hold",
            options: [
              { id: "ask", label: "Show Bram the tag and ask him straight.", hint: "Honesty first. It might sting.", effects: { rel: { bram: 1 }, set: ["bram.confronted"] } },
              { id: "hold", label: "Keep it to yourself for now.", hint: "Watch him. Wait for the right moment.", effects: { rel: { bram: -1 }, set: ["bram.suspected"] } },
            ],
          },
        ],
        otherwise: [{ type: "set", flag: "bram.unaware" }],
      },
    ],
    "dog_tag:ask": [
      {
        type: "dialogue",
        lines: [
          { speaker: "Ines", text: "Bram. Salt Hare. This tag was lying in the dock office." },
          { speaker: "Bram", text: "...Eight years ago. I worked for Varek. I owe him, Ines. More than money." },
          { speaker: "Ines", text: "And the rest?" },
          { speaker: "Bram", text: "When it won't get you killed." },
        ],
      },
    ],
    "dog_tag:hold": [
      {
        type: "dialogue",
        lines: [
          { speaker: "Bram", text: "Something wrong?" },
          { speaker: "Ines", text: "Just the cold. Let's get out of here." },
        ],
      },
    ],
  },
  journal: [
    {
      id: "catalina-debt",
      title: "Catalina's Pilot",
      text: "From the Santa Brigida's log: 'I owe my pilot more than I can pay. I told him so. He said: you owe me nothing, you owe the sea. I think of that whenever I want to be rid of a debt.'",
    },
  ],
  downtime: [
    {
      id: "ch07-bram",
      label: "Find Bram on deck",
      lines: [
        { speaker: "Ines", text: "Bram. Whatever it is, I'd rather hear it from you." , if: { flag: "bram.suspected" } },
        { speaker: "Bram", text: "Not yet, kid. But soon. I promise.", if: { flag: "bram.suspected" } },
        { speaker: "Bram", text: "I told you the truth as far as I could. That's all I've got.", if: { flag: "bram.confronted" } },
        { speaker: "Bram", text: "End of the first act, as Catalina would say. Sleep. Tomorrow we go to sea." },
      ],
    },
    {
      id: "ch07-letter",
      label: "Read Catalina's last page of Act One",
      lines: [
        { speaker: "Catalina", text: "I owe my pilot more than I can pay. He says I owe the sea." },
        { speaker: "Catalina", text: "I begin to think the two debts are the same one." },
      ],
      effects: { set: ["read.pilot_page"] },
    },
  ],
};
