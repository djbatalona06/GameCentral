# Branching map

Choices change the numbers and flags; the chapters stay in order. Only the last act and the epilogue truly split.

## Act I (built): choices feed three values
```mermaid
flowchart LR
  c1[Ch1 Breakwater\nVarek's offer, the rubbing] --> c2[Ch2 Qasr Amal\nstall owner, the letter]
  c2 --> c3[Ch3 Green Vault\nspare Kessa?]
  c3 --> c4[Ch4 Salt Road\nfree the crew?]
  c4 --> c5[Ch5 Saint Aurel\nmuffle the bells?]
  c5 --> c6[Ch6 Night Train\nKessa's truce?]
  c6 --> c7[Ch7 Ironwood Docks\nthe dog tag]
  c3 -. Kessa respect .-> K((Kessa))
  c6 -. Kessa respect .-> K
  c1 -. Bram trust .-> B((Bram))
  c2 -. Bram trust .-> B
  c4 -. Bram trust .-> B
  c7 -. Bram trust .-> B
  c2 -. stance .-> S((Keeper to Seeker))
  c4 -. stance .-> S
  c5 -. stance .-> S
```

## Acts II and III (planned): one decision beat per chapter, all converging
```mermaid
flowchart TD
  A7[End of Act I] --> c8[Ch8 Ice Archive\nradio quality from Bram's trust]
  c8 --> c9[Ch9 Cartographer's House\nsocial, stealth or loud]
  c9 --> c10[Ch10 Monsoon City\ncaravan crew ferry you if freed]
  c10 --> c11[Ch11 Sunken Cathedral\nshare your air?]
  c11 --> c12{Ch12 Halvard Rock\nBram's betrayal}
  c12 -- trust 6+ or confronted --> r[Reluctant: he leaves a warning]
  c12 -- otherwise --> cold[Cold: extra Gilt fight]
  r --> c13[Ch13 Ashfall Pass]
  cold --> c13
  c13 --> c14[Ch14 Glass Desert\ndocument or take a relic]
  c14 --> c15[Ch15 Bram's Debt]
  c15 --> c16{Ch16 Storm Passage}
  c16 -- Kessa respect 7+ --> d[Kessa fights beside you]
  c16 -- otherwise --> rv[Kessa commands a rival ship]
  d --> c17[Ch17 Isle of Lanterns]
  rv --> c17
  c17 --> c18{Ch18 Lighthouse\nKessa's last stand}
  c18 --> c19[Ch19 Undertow\nwhom to save first]
  c19 --> c20[Ch20 Meridia\nstance opens districts]
  c20 --> c21{Ch21 Heart of the Codex\nkeep or share}
  c21 --> c22{Ch22 True North}
  c22 --> e1[The Keeper]
  c22 --> e2[Open Water]
  c22 --> e3[The Lantern]
```

## Ending rules (`src/sim/story/Endings.ts`)
| Ending | When |
|---|---|
| **The Lantern** | stance is 3 or more (Seeker) and the player did not choose to keep Meridia hidden |
| **Open Water** | the player chose to share (`final:share`), Bram's trust is 7 or more and Kessa's respect is 5 or more |
| **The Keeper** | everything else, including every player who chose to keep Meridia hidden |

Each chapter's branch notes are in `src/sim/chapters/story/beats.ts`.
