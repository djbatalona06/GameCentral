// All 22 chapters of the story. Chapters 1-7 (Act I) are playable in this build; the rest are outlined
// here (and in docs/story/outline.md) so the menu, saves and progression already know about them.

import type { ChapterDef } from "../story/types";
import { buildCh01, ch01Script } from "./ch01";
import { buildCh02, ch02Script } from "./ch02";
import { buildCh03, ch03Script } from "./ch03";
import { buildCh04, ch04Script } from "./ch04";
import { buildCh05, ch05Script } from "./ch05";
import { buildCh06, ch06Script } from "./ch06";
import { buildCh07, ch07Script } from "./ch07";

const locked = (number: number, title: string, location: string, estMinutes: number, synopsis: string): ChapterDef => ({
  id: `ch${String(number).padStart(2, "0")}`,
  number,
  title,
  location,
  estMinutes,
  synopsis,
  playable: false,
});

export const CHAPTERS: ChapterDef[] = [
  {
    id: "ch01", number: 1, title: "Breakwater", location: "Santa Brigida reef, Atlantic coast", estMinutes: 22, playable: true,
    synopsis: "Ines dives the wreck of Catalina de Ordaz's ship and finds an astrolabe marked with a secret meridian, just as the Gilt Company arrives.",
    build: buildCh01, script: ch01Script,
  },
  {
    id: "ch02", number: 2, title: "Qasr Amal", location: "The old port of Qasr Amal", estMinutes: 25, playable: true,
    synopsis: "Following the meridian east, Ines sneaks through a harbour market held by the Gilt Company, escapes across the rooftops and opens Catalina's sealed archive.",
    build: buildCh02, script: ch02Script,
  },
  {
    id: "ch03", number: 3, title: "The Green Vault", location: "Jungle ruins of the Serra Verde", estMinutes: 28, playable: true,
    synopsis: "The archive leads to a jungle temple. Ines solves its pillar lock, survives a collapsing bridge and faces Varek's lieutenant, Kessa Varn, at the vault door.",
    build: buildCh03, script: ch03Script,
  },
  {
    id: "ch04", number: 4, title: "Salt Road", location: "Caravan route, Saharan fringe", estMinutes: 30, playable: true,
    synopsis: "Ines sneaks through a captured caravan camp, races the Gilt Company across the salt flats in Bram's jeep, survives a sandstorm ambush and finds half of Catalina's star chart.",
    build: buildCh04, script: ch04Script,
  },
  {
    id: "ch05", number: 5, title: "Bell of Saint Aurel", location: "Mountain monastery", estMinutes: 30, playable: true,
    synopsis: "A snowbound climb to an abandoned monastery, a bell-ringing riddle at the top of its tower, and a race downhill ahead of the avalanche the bells set off.",
    build: buildCh05, script: ch05Script,
  },
  {
    id: "ch06", number: 6, title: "Night Train to Varanask", location: "Mountain railway", estMinutes: 28, playable: true,
    synopsis: "A running fight along a speeding night train, ducking tunnels on the roofs, ending in a rematch with Kessa Varn and a race to stop the runaway engine.",
    build: buildCh06, script: ch06Script,
  },
  {
    id: "ch07", number: 7, title: "Ironwood Docks", location: "Shipyard city", estMinutes: 30, playable: true,
    synopsis: "Ines slips past the searchlights of the Gilt Company's shipyard, crosses the harbour on swinging crane containers and learns that Varek plans to drain the sea over Meridia.",
    build: buildCh07, script: ch07Script,
  },
  locked(8, "The Ice Archive", "Arctic research station", 96, "A frozen station holds the logbook of Catalina's navigator. A blizzard cuts every way out."),
  locked(9, "The Cartographer's House", "Lisbon-style hill city", 81, "A heist in a crowded mansion party to steal Catalina's lost map case."),
  locked(10, "Monsoon City", "Flooded river metropolis", 86, "Flooded streets, boat chases and rooftop gardens as the monsoon breaks."),
  locked(11, "The Sunken Cathedral", "Underwater ruins", 96, "Diving through a drowned cathedral to recover the codex's middle section."),
  locked(12, "Halvard Rock", "Island prison", 81, "Bram's past catches up with them. A betrayal splits the team."),
  locked(13, "Ashfall Pass", "Active volcano", 86, "Alone, Ines crosses a volcanic pass to reach a Gilt Company dig site."),
  locked(14, "The Glass Desert", "Lightning-fused dunes", 81, "Catalina's trail crosses a desert of glass. Ines finds proof the Drowned City was real."),
  locked(15, "Bram's Debt", "Smuggler's haven", 81, "Ines tracks Bram down and learns why he sold her out. They fight their way out together."),
  locked(16, "Storm Passage", "Open sea", 86, "A storm-tossed sea battle against Varek's flagship."),
  locked(17, "Isle of Lanterns", "Hidden island", 96, "An island where Catalina's crew lived out their days. Their lanterns still mark the way."),
  locked(18, "The Ordaz Lighthouse", "Cliffside lighthouse", 81, "The lighthouse lens is the final key. Kessa makes her last stand."),
  locked(19, "Undertow", "Sea caves", 76, "Escaping flooding sea caves as the tide turns."),
  locked(20, "Meridia", "The Drowned City", 121, "The lost city rises at low tide, every street a puzzle and a trap."),
  locked(21, "Heart of the Codex", "Meridia's inner sanctum", 111, "Ines confronts Varek over the codex as the city begins to sink again."),
  locked(22, "True North", "Breakwater, one year later", 48, "An epilogue: what Ines chose to keep, and what she gave back to the sea."),
];

export const chapterById = (id: string): ChapterDef | undefined => CHAPTERS.find((c) => c.id === id);

/** Total estimated main-story minutes (chapters 8-22 are targets for the full release). */
export const totalStoryMinutes = (): number => CHAPTERS.reduce((sum, c) => sum + c.estMinutes, 0);
