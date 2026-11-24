/**
 * cover-answers.mjs — the cover letter answers, kept with the run that used them.
 *
 * The report page asks modes/cover.md's four Step 6 questions before a cover run
 * (cover-brief.mjs checks the answers at the route). They used to live only in the
 * form's component state and in the request body, so a run that failed left them
 * nowhere: not on the run page, and not in the form when it was opened again after
 * visiting the run log (#7441). The job now keeps them, and these helpers read them
 * back for the run page, the form and the copy a user pastes into an agent CLI.
 *
 * Plain .mjs with no Node imports: both readers are client components, and
 * cover-brief.mjs imports node:path.
 */
import { COVER_TONES } from "./cover-tones.mjs";

/**
 * Fork: Greta's letter questions (2026-11-24), one per part of her letter template
 * in modes/_custom.md. They replace cover.md Step 6's why / problem / approach.
 * A brand briefing run writes brand-specific versions of the same four questions;
 * the form shows those in place of these labels when there is one.
 */
export const COVER_QUESTIONS = Object.freeze([
  Object.freeze({ step: "A", name: "hook", label: "A memory with the brand", hint: "A moment with one of their products: who was there, where, which detail stuck." }),
  Object.freeze({ step: "B", name: "today", label: "The brand today", hint: "How you come across them now: something you use, an ad, packaging, a shop, how they look in another country." }),
  Object.freeze({ step: "C", name: "value", label: "Their values in your life", hint: "A moment in your life that matches what the brand stands for." }),
  Object.freeze({ step: "D", name: "wink", label: "Something small and funny about you", hint: "Optional. A light detail about you that fits the brand.", optional: true }),
]);

/**
 * The answers stored on a job, or null when it has none to show.
 *
 * Jobs are restored from localStorage, so the shape is checked rather than
 * trusted: a job saved before answers were kept has none, and a stored value
 * that is not a string reads as unanswered. A tone the form does not offer is
 * dropped rather than shown.
 *
 * @param {unknown} value
 * @returns {StoredCoverBrief | null}
 */
export function storedCoverBrief(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const record = /** @type {Record<string, unknown>} */ (value);
  const answer = (key) => (typeof record[key] === "string" ? record[key] : "");
  const tone = typeof record.tone === "string" && Object.hasOwn(COVER_TONES, record.tone)
    ? /** @type {keyof typeof COVER_TONES} */ (record.tone)
    : null;
  const brief = { hook: answer("hook"), today: answer("today"), value: answer("value"), wink: answer("wink"), tone };
  return COVER_QUESTIONS.some((q) => brief[q.name].trim()) ? brief : null;
}

/**
 * The answers as plain text, lettered as modes/cover.md Step 6 asks for them, so
 * they can be pasted into an agent CLI's cover mode when the web run did not draft
 * the letter.
 *
 * @param {StoredCoverBrief} brief
 * @returns {string}
 */
export function coverAnswersText(brief) {
  const blocks = COVER_QUESTIONS.map((q) => `${q.step}. ${q.label}\n${brief[q.name].trim() || "(no answer)"}`);
  return blocks.join("\n\n");
}
