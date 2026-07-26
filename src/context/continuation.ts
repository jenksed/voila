// Explicit continuation intent. Pure, deterministic, and deliberately small.
//
// This is NOT a natural-language intent engine. It recognizes a short, closed set of phrases whose
// only plausible meaning is "recover the active thread and keep working". Anything longer carries its
// own instruction and is left alone: a message that merely contains the word "continue" ("continue
// the migration to v5 and explain the tradeoffs", "should we continue with NF-2?") is not a
// continuation command, and treating it as one would override what the developer actually asked for.

/** Verbs that, alone, mean "keep working on the accepted plan". */
const BARE = [
  "continue",
  "continue on",
  "keep going",
  "keep on going",
  "resume",
  "carry on",
  "proceed",
  "go ahead",
  "pick up where you left off",
];

/** `<verb> [with|on] [the] [current] <noun>` — the only permitted expansion. */
const QUALIFIED =
  /^(continue|resume|proceed|carry on|keep going)( with| on)?( the)?( current)? (work|plan|slice|task|packet)$/;

/**
 * Normalize a prompt for intent matching: collapse whitespace, drop case, drop trailing sentence
 * punctuation, and drop a leading or trailing "please".
 */
function normalize(prompt: string): string {
  let text = prompt.replace(/\s+/g, " ").trim().toLowerCase();
  text = text.replace(/[.!…]+$/, "").trim();
  text = text.replace(/^please\b/, "").trim();
  text = text.replace(/\bplease$/, "").trim();
  return text.replace(/[.!…]+$/, "").trim();
}

/** True when the prompt is an explicit request to continue the accepted work. */
export function isContinuationRequest(prompt: string | undefined | null): boolean {
  if (typeof prompt !== "string") return false;
  const text = normalize(prompt);
  if (text.length === 0) return false;
  return BARE.includes(text) || QUALIFIED.test(text);
}
