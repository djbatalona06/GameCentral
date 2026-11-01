// Chapter 2 — Qasr Amal: story layer.
// Choices: the stall owner (small) and what to do with Catalina's letter (major).

import type { StoryLayer } from "../../story/Layer";

export const ch02Story: StoryLayer = {
  events: {
    vendor: [
      { type: "dialogue", lines: [{ speaker: "Vendor", text: "Gilt men took half my stock and my licence. Please, if they ask, you never saw me." }] },
      {
        type: "choice",
        id: "vendor_talk",
        speaker: "Vendor",
        prompt: "The stall owner is shaking, but he seems to want to help.",
        defaultOption: "leave",
        options: [
          { id: "help", label: "Help him hide his crates.", hint: "Bram would approve.", effects: { rel: { bram: 1 }, set: ["qasr.helped_vendor"] } },
          { id: "intel", label: "Ask what he knows about the rooftops.", hint: "A tip could save your skin.", effects: { set: ["qasr.intel"] } },
          { id: "leave", label: "Leave. There is no time.", effects: { stance: 1 } },
        ],
      },
    ],
    "vendor_talk:help": [{ type: "dialogue", lines: [{ speaker: "Vendor", text: "Bless you. Cinnamon-sellers never forget a kindness." }, { speaker: "Ines", text: "I'll settle for you not getting caught." }] }],
    "vendor_talk:intel": [{ type: "dialogue", lines: [{ speaker: "Vendor", text: "A sniper on the tall tower over the old town. Hide behind stone, never wood. Wood does not stop what he shoots." }] }],
    "vendor_talk:leave": [{ type: "dialogue", lines: [{ speaker: "Ines", text: "Sorry. I'm on a clock." }] }],
    chase_start: [
      { type: "dialogue", lines: [{ speaker: "Ines", text: "The cinnamon seller said stone, not wood. Stone it is.", if: { flag: "qasr.intel" } }] },
    ],
    archive: [
      {
        type: "choice",
        id: "archive_letter",
        speaker: "Ines",
        prompt: "Catalina's letter is brittle and sealed in wax. Copy it and leave it where she put it, or take the original with you?",
        defaultOption: "copy",
        options: [
          { id: "copy", label: "Copy it and leave the letter.", hint: "Slower, but it stays where Catalina left it.", effects: { stance: -1, set: ["archive.left_letter"] } },
          { id: "take", label: "Take the letter with you.", hint: "Safer in your pocket than in Varek's hands.", effects: { stance: 1, set: ["archive.took_letter"] } },
        ],
      },
    ],
    "archive_letter:copy": [
      { type: "journal", id: "catalina-copy" },
      { type: "dialogue", lines: [{ speaker: "Ines", text: "Every word, copied. The original stays with the sea, where she wanted it." }] },
    ],
    "archive_letter:take": [
      { type: "journal", id: "catalina-copy" },
      { type: "dialogue", lines: [{ speaker: "Ines", text: "Sorry, Catalina. I'd rather you were with me than with them." }] },
    ],
  },
  journal: [
    {
      id: "catalina-copy",
      title: "Catalina Wrote It Twice",
      text: "At the end of the letter, in a smaller hand: 'I wrote this twice. One I carry, one I leave in the archive, so that the sea always keeps a copy.' Catalina never said which one she trusted more.",
    },
  ],
  downtime: [
    {
      id: "ch02-bram",
      label: "Talk to Bram about the market",
      lines: [
        { speaker: "Bram", text: "You helped that stall owner.", if: { flag: "qasr.helped_vendor" } },
        { speaker: "Bram", text: "That's the kind of thing I'd hoped I taught you.", if: { flag: "qasr.helped_vendor" } },
        { speaker: "Bram", text: "You walked past that stall owner. I'm not judging. Just noticing.", if: { not: { flag: "qasr.helped_vendor" } } },
        { speaker: "Ines", text: "The jungle next. Pray for me." },
        { speaker: "Bram", text: "I always do. It never works." },
      ],
    },
    {
      id: "ch02-letter",
      label: "Read the letter again",
      lines: [
        { speaker: "Catalina", text: "There is a place the sea keeps for those who keep faith with it." },
        { speaker: "Catalina", text: "I will not tell you where. If you are the right person, you will not need me to." },
      ],
    },
  ],
};
