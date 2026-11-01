// Chapter 3 — The Green Vault: story layer.
// Choice: what to do with Kessa Varn once she is beaten (major). It decides how she treats Ines in chapter 6.

import type { StoryLayer } from "../../story/Layer";

export const ch03Story: StoryLayer = {
  events: {
    "arenaClear:vault": [
      {
        type: "choice",
        id: "kessa_after",
        speaker: "Narrator",
        prompt: "Kessa Varn is down, winded, her shotgun out of reach. What do you do?",
        defaultOption: "walk",
        options: [
          { id: "spare", label: "Lower your gun and offer her a hand up.", hint: "She will not forget it.", effects: { rel: { kessa: 3 }, set: ["kessa.spared"] } },
          { id: "radio", label: "Take her radio and leave her bound.", hint: "You will be able to listen in on the Gilt Company.", effects: { rel: { kessa: 1 }, set: ["kessa.bound", "ines.has_radio"] } },
          { id: "walk", label: "Walk past. She is not worth another bullet.", hint: "Cold, but quick.", effects: { set: ["kessa.ignored"] } },
        ],
      },
    ],
    "kessa_after:spare": [
      { type: "journal", id: "catalina-mercy" },
      {
        type: "dialogue",
        lines: [
          { speaker: "Ines", text: "Up you get. You fight like someone who's been told to." },
          { speaker: "Kessa", text: "Don't expect a thank-you." },
          { speaker: "Ines", text: "I never do." },
          { speaker: "Kessa", text: "...Varek pays for results, not honour. Remember that when he hears about this." },
        ],
      },
    ],
    "kessa_after:radio": [
      { type: "journal", id: "catalina-mercy" },
      {
        type: "dialogue",
        lines: [
          { speaker: "Ines", text: "I'll borrow this." },
          { speaker: "Kessa", text: "It's tuned to Varek. Enjoy listening to him being right about everything." },
        ],
      },
    ],
    "kessa_after:walk": [
      { type: "journal", id: "catalina-mercy" },
      { type: "dialogue", lines: [{ speaker: "Kessa", text: "That's it? ...Fine. Keep walking." }] },
    ],
  },
  journal: [
    {
      id: "catalina-mercy",
      title: "Catalina and the Boarder",
      text: "A ship's log, 1573: 'A boarder came over my rail with a knife and a debt. I could have had her hanged. I gave her a loaf and a map to the next port. She kept my secret for forty years.' The next line is torn out.",
    },
  ],
  downtime: [
    {
      id: "ch03-bram",
      label: "Check in with Bram",
      lines: [
        { speaker: "Bram", text: "You went easy on Kessa." , if: { flag: "kessa.spared" } },
        { speaker: "Bram", text: "Risky. I like it. Don't tell Varek I said so.", if: { flag: "kessa.spared" } },
        { speaker: "Bram", text: "A radio from the Gilt Company. Careful. They'll know it's gone.", if: { flag: "kessa.bound" } },
        { speaker: "Bram", text: "You left her where she fell. Cold, maybe. But she'll live.", if: { flag: "kessa.ignored" } },
        { speaker: "Bram", text: "Two more keys. Three seas. At least this one wasn't a sea." },
      ],
    },
    {
      id: "ch03-key",
      label: "Study the first key",
      lines: [
        { speaker: "Ines", text: "Green stone, carved with the meridian line. It's warm, like it remembers being held." },
        { speaker: "Catalina", text: "Three keys for three seas. The first stays with the jungle. The last stays with the lamp." },
      ],
    },
  ],
};
