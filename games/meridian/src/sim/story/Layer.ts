// Story written on top of a chapter. A chapter file describes the level and its beats; its "story
// layer" adds the questions, relationships, reactions and quiet talks. Keeping them apart means a
// writer can change the story without touching level geometry, and the other way round.

import type { Action, ChapterScript, DowntimeTalk, JournalEntry } from "./types";

export interface StoryLayer {
  /** Extra actions run after the chapter's own start script. */
  onStart?: Action[];
  /** Extra actions for an event: added after the chapter's own actions, or a brand new event (such as a choice's answer). */
  events?: Record<string, Action[]>;
  journal?: JournalEntry[];
  downtime?: DowntimeTalk[];
}

export function withStory(base: ChapterScript, layer: StoryLayer): ChapterScript {
  const events: Record<string, Action[]> = { ...base.events };
  for (const [name, actions] of Object.entries(layer.events ?? {})) events[name] = [...(base.events[name] ?? []), ...actions];
  return {
    ...base,
    onStart: [...base.onStart, ...(layer.onStart ?? [])],
    events,
    journal: [...base.journal, ...(layer.journal ?? [])],
    downtime: [...(base.downtime ?? []), ...(layer.downtime ?? [])],
  };
}
