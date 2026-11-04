// Breaks long dialogue lines into short captions (at most about two lines on screen each), so a
// subtitle never turns into a wall of text that covers the game.

/** Longest caption chunk, in characters. Roughly two lines of subtitle text. */
export const CAPTION_MAX = 84;

/** Seconds a caption stays up: a reading-speed estimate with a floor, as before. */
export const readingTime = (text: string): number => Math.max(2.2, text.split(/\s+/).filter(Boolean).length * 0.32 + 0.8);

/**
 * Splits text into chunks of at most `max` characters, cutting at the most natural place first:
 * sentence ends, then commas / dashes / semicolons, then spaces. Words are never cut in half
 * (unless a single word is longer than `max`). Joining the chunks with spaces gives the original
 * text back (apart from extra whitespace).
 */
export function splitCaption(text: string, max = CAPTION_MAX): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean ? [clean] : [];

  // Sentences first ("Wait. What's that?" -> two pieces), keeping punctuation with its sentence.
  const sentences = clean.match(/[^.!?…]+(?:[.!?…]+["'’”)]*|$)\s*/g)?.map((s) => s.trim()).filter(Boolean) ?? [clean];
  const out: string[] = [];
  let cur = "";
  const flush = () => {
    if (cur) out.push(cur);
    cur = "";
  };
  for (const s of sentences) {
    if (s.length > max) {
      flush();
      out.push(...splitClauses(s, max));
      continue;
    }
    const joined = cur ? `${cur} ${s}` : s;
    if (joined.length <= max) cur = joined;
    else {
      flush();
      cur = s;
    }
  }
  flush();
  return out;
}

/** Splits one long sentence at commas / dashes / semicolons, falling back to spaces. */
function splitClauses(sentence: string, max: number): string[] {
  const parts = sentence.split(/(?<=[,;:—–])\s+|\s+(?=[—–-]\s)/).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    if (p.length > max) {
      if (cur) out.push(cur);
      cur = "";
      out.push(...splitWords(p, max));
      continue;
    }
    const joined = cur ? `${cur} ${p}` : p;
    if (joined.length <= max) cur = joined;
    else {
      if (cur) out.push(cur);
      cur = p;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Last resort: fill chunks word by word, balancing the final two so neither is tiny. */
function splitWords(text: string, max: number): string[] {
  const words = text.split(" ");
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const joined = cur ? `${cur} ${w}` : w;
    if (joined.length <= max || !cur) cur = joined;
    else {
      out.push(cur);
      cur = w;
    }
  }
  if (cur) out.push(cur);
  return out;
}
