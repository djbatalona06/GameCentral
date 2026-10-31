# Story Outline: MERIDIAN: The Drowned Route

An original story. All characters, places and events are fictional.

## Premise
In 1574, navigator **Catalina de Ordaz** sailed away from Qasr Amal with "cargo: none declared" and vanished. She had found the **Drowned City of Meridia**, which surfaces only at certain tides, and hid three keys so no one could plunder it. Four centuries later, salvage diver **Ines Calder** finds her wreck.

## Cast
| Character | Role | Arc |
|---|---|---|
| **Ines Calder** | Salvage diver turned relic hunter. Quick, funny, stubborn. | Starts out wanting to prove Catalina was real. Ends up choosing to protect what Catalina protected. |
| **Bram Okafor** | Ines's mentor, boat captain, reluctant fixer. | Owes Varek a dangerous debt. He betrays Ines in Act II, then redeems himself. |
| **Varek Sorne** | Charming leader of the Gilt Company mercenaries. | Wants Meridia's "true north", a navigation secret worth an empire. |
| **Kessa Varn** | Varek's lieutenant. Blunt and fearless. | A boss in Act I. Recurring rival who finally walks away from Varek. |
| **Catalina de Ordaz** | 16th-century navigator, told through journals and letters. | Her voice guides the player through the whole story. |

## Structure: 3 acts, 22 chapters, ~25 hours (main path)
Playtime estimates are for a first playthrough with some exploration. Collectibles (5 treasures per chapter), medals, harder difficulties and New Game+ add replay time beyond 25 hours.

### Act I — The Drowned Route (Chapters 1–7, ~3.2 h) ✅ fully playable
| # | Chapter | Setting | Gameplay focus | Est. |
|---|---|---|---|---|
| 1 | **Breakwater** ✅ playable | Reef wreck and sea cliffs | Movement, swimming, climbing, rope, beam, first stealth and combat, zipline | 22 min |
| 2 | **Qasr Amal** ✅ playable | Harbour market city | Stealth with distractions, crate puzzle, rooftop jumps, sniper, awning collapse, market shootout, lever puzzle | 25 min |
| 3 | **The Green Vault** ✅ playable | Jungle temple | Grass stealth, wall jumps, free climb, pillar puzzle, collapsing bridge, grapple, boss (Kessa), plates puzzle | 28 min |
| 4 | **Salt Road** ✅ playable | Caravan route | Camp stealth in scrub, jeep chase (drive, then gunner), sandstorm ambush, tower climb, sun-lever puzzle | 30 min |
| 5 | **Bell of Saint Aurel** ✅ playable | Mountain monastery | Snow stealth, 18 m cliff climb, courtyard fight, captioned bell puzzle, zipline, avalanche escape | 30 min |
| 6 | **Night Train to Varanask** ✅ playable | Mountain railway | Car-to-car traversal, crouch under tunnels, flatcar fights, Kessa rematch, stop-the-engine puzzle | 28 min |
| 7 | **Ironwood Docks** ✅ playable | Shipyard | Searchlight stealth, power-panel sabotage, fuse puzzle, swinging crane containers, ship-deck fight, Varek's plan revealed | 30 min |

### Act II — The Meridian (Chapters 8–15, ~11.5 h)
| # | Chapter | Setting | Focus | Est. |
|---|---|---|---|---|
| 8 | The Ice Archive | Arctic station | Survival, ice climbing, blizzard | 96 min |
| 9 | The Cartographer's House | Hill city mansion | Heist, social stealth | 81 min |
| 10 | Monsoon City | Flooded metropolis | Boat traversal, rooftop gardens | 86 min |
| 11 | The Sunken Cathedral | Underwater ruins | Diving, air management, second key | 96 min |
| 12 | Halvard Rock | Island prison | Bram's betrayal, prison escape | 81 min |
| 13 | Ashfall Pass | Volcano | Solo traversal under lava rain | 86 min |
| 14 | The Glass Desert | Glass dunes | Open area, proof of Meridia | 81 min |
| 15 | Bram's Debt | Smuggler's haven | Reunion, team-up firefight | 81 min |

### Act III — The Drowned City (Chapters 16–22, ~10.3 h)
| # | Chapter | Setting | Focus | Est. |
|---|---|---|---|---|
| 16 | Storm Passage | Open sea | Ship battle in a storm | 86 min |
| 17 | Isle of Lanterns | Hidden island | Exploration, Catalina's crew | 96 min |
| 18 | The Ordaz Lighthouse | Cliff lighthouse | Third key; Kessa's last stand | 81 min |
| 19 | Undertow | Sea caves | Flooding escape set piece | 76 min |
| 20 | Meridia | The Drowned City | Puzzle city at low tide | 121 min |
| 21 | Heart of the Codex | Inner sanctum | Final confrontation with Varek | 111 min |
| 22 | True North | Breakwater, a year later | Epilogue and choice | 48 min |

**Total main story: ~1,500 minutes (25 hours).** The registry test (`tests/unit/chapters.test.ts`) checks this.

Act I came out shorter than first planned once it was built (Ch4–7 play in about 30 minutes each, not 65–75), so those minutes moved to the Act II and III targets. The 25-hour total is still a target for the full release: right now about 3.2 hours of story are playable.

## Themes
- What do we owe the people who hid things for a reason?
- Found family: Ines and Bram's trust is broken and rebuilt.
- Maps as stories: every chapter adds a page to Catalina's chart in the journal.

## Collectibles
5 treasures per chapter (110 in total), each with a short description that hints at Catalina's life. Journal entries unlock at story moments and include simple sketches.
