# Choices and consequences (Act I)

Every choice converges: the next chapter is the same level no matter what you answered. What changes is who helps you, what people say, what you carry and which ending you can reach.

## The choices
| Ch | Id | Moment | Options | Effects and callbacks |
|---|---|---|---|---|
| 1 | `varek_offer` | Varek arrives at the wreck | Refuse / Stall / Bluff | Flags `varek.refused`, `varek.stalled`, `varek.bluffed`. Varek's line in chapter 2; the bluff is mocked in chapter 7. Journal: *Catalina and the King's Men* |
| 1 | `rubbing` | Back on the boat | Show Bram / Keep it back | Bram +1 or -1; keeping it back leans Seeker. Bram's reply differs |
| 2 | `vendor_talk` | Frightened stall owner (optional) | Help / Ask for a tip / Leave | Help: Bram +1, `qasr.helped_vendor`. Tip: `qasr.intel` (a line in the sniper fight) |
| 2 | `archive_letter` | Catalina's sealed letter | Copy it / Take it | `archive.left_letter` or `archive.took_letter` (Varek comments in chapter 3); Keeper or Seeker. Journal: *Catalina Wrote It Twice* |
| 3 | `kessa_after` | Kessa is beaten | Help her up / Take her radio / Walk away | Help: Kessa +3, `kessa.spared`. Radio: Kessa +1, `ines.has_radio` (Gilt chatter in chapters 4, 6 and 7). Journal: *Catalina and the Boarder* |
| 4 | `captives` | Caged caravan crew (optional) | Free them / Leave | Free: Bram +1, Keeper, `caravan.saved`. In chapter 5: supplies, and the felt for the bells |
| 5 | `bell_plan` | Before ringing the bells (only if the crew were freed) | Ring loud / Muffle with felt | `bells.loud` or `bells.muffled` (Bram's and Kessa's lines about the avalanche change). Journal: *Catalina and the Bell* |
| 6 | `kessa_truce` | Train stopped (only if Kessa respect is 3 or more) | Let her go / Refuse | Accept: Kessa +2, `kessa.truce`. Refuse: Kessa -1, Seeker, `kessa.rebuffed` |
| 7 | `dog_tag` | After Varek's manifest (only if Ines found the dog tag) | Ask Bram / Keep it to herself | Ask: Bram +1, `bram.confronted`. Wait: Bram -1, `bram.suspected`. Both feed chapter 12 |

Seven chapters, nine choices; the optional ones reward exploring.

## Playstyle reactions
Characters notice how a chapter was played (`styleOf` in `State.ts`): **ghost** (never spotted), **brawler** (five or more gun kills) or **mixed**. Examples: Bram's remark when Ines reaches the boat in chapter 1, Varek's remark in chapter 7.

## Quiet moments
After each chapter's results the player may pick one short talk (two or three per chapter; skipping is allowed). A talk's effects count once, even if the chapter is replayed.

## How to add a choice (the five-minute recipe)
1. Open the chapter's story file, for example `src/sim/chapters/story/ch02.story.ts`.
2. Add a `choice` action inside an event. Give it an `id`, a `prompt`, 2 to 4 `options` and a `defaultOption` that is always available (no `requires`):
   ```ts
   { type: "choice", id: "my_choice", prompt: "...", defaultOption: "yes",
     options: [
       { id: "yes", label: "Say yes", effects: { rel: { bram: 1 } } },
       { id: "no",  label: "Say no",  effects: { set: ["said_no"] } },
     ] }
   ```
3. Add a reply event for **every** option, named `my_choice:yes` and `my_choice:no`. It can say a line, give an item or run any other action.
4. Use the answer later with a rule on a line: `{ speaker: "Bram", text: "...", if: { chose: "my_choice", option: "no" } }` or `if: { flag: "said_no" }`.
5. Run `npm test`. The Act I story tests play every option of every choice and check the reply exists, the chapter still finishes, and every flag you read is set somewhere.

Things the tests will catch for you: a missing reply, a default that needs a rule, a rule that reads a flag nobody sets, a chapter that cannot finish after an answer.
