# Characters

All characters are fictional. Voices are written so a line can be told apart even with the name covered.

## How the story keeps score
| Value | Measures | Range | Words shown in the journal |
|---|---|---|---|
| Bram's **trust** | How much Bram believes Ines will not walk away | 0 to 10, starts at 4 | Estranged, Wary, Steady, Trusting, Close, Family |
| Kessa's **respect** | Whether Kessa sees Ines as an equal | 0 to 10, starts at 0 | Enemy, Grudging, Respectful rival, Almost an ally, Ally, Sworn ally |
| Ines's **stance** | Keeper (negative) to Seeker (positive) | -5 to 5, starts at 2 | not shown; it drives the ending |

Players only see words, never numbers. The code lives in `src/sim/story/Characters.ts` (words) and `State.ts` (numbers).

## Ines Calder
- **Voice:** quick, funny, stubborn. Jokes when scared.
- **Wants (start):** proof that Catalina was real.
- **Wants (end):** to protect what Catalina protected, or to share it. The player decides.
- **Moves her stance:** taking vs leaving relics, loud vs gentle choices, how she treats people on the way.

## Bram Okafor
- **Voice:** gruff, dry, short sentences. Calls her "kid" when he cares.
- **Secret:** he once worked for Varek and owes a debt (hinted in chapters 4, 6 and 7; the dog tag in chapter 7).
- **Trust goes up:** Ines shares finds, helps strangers, asks him straight.
- **Trust goes down:** she hides things from him or says nothing when she is suspicious.
- **Pays off:** Act II chapter 12 betrayal is *reluctant* (he leaves a warning) with high trust or after being confronted in chapter 7, and *cold* otherwise. Chapter 15 reunion. The Open Water ending needs trust of 7 or more.

## Kessa Varn
- **Voice:** blunt, impatient, no wasted words. Respects strength and honesty.
- **Wants:** to stop taking orders from a man who does not care who gets hurt.
- **Respect goes up:** Ines spares her (chapter 3), accepts her stand-down (chapter 6).
- **Pays off:** chapter 6 truce (needs respect 3 or more), chapter 16 defection (7 or more), chapter 18 last stand (dies, walks away, or joins), Open Water ending (5 or more).

## Varek Sorne
- **Voice:** charming, polite, always faintly amused. Never raises his voice.
- **Wants:** Meridia's navigation secret, and to drain the sea around it.
- **Remembers:** how Ines answered his offer in chapter 1, what she did with Catalina's letter, whether she spared Kessa, and how she plays (ghost or brawler).

## Catalina de Ordaz
- **Voice:** warm, exact, a little sad. Appears only in journal pages and letters.
- **Role:** mirrors each major choice. After the player chooses, a journal page shows how Catalina faced the same dilemma, without judging either path.

## Minor voices
- **Vendor** (chapter 2) and **Caravaneer** (chapter 4) give the world a face. They are remembered by flags, not by numbers.
