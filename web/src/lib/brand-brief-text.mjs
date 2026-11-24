/**
 * Fork: splits a brand briefing run's answer (kind "brand-brief") into the briefing
 * itself and the four brand-specific letter questions, so the report page shows the
 * briefing and the cover letter form asks the questions. Plain .mjs: both readers
 * are client components.
 */

const QUESTIONS_HEADING = /^#{1,4}\s*Questions for your letter\s*$/im;

/** Which letter field a question belongs to, from its bold name. */
const FIELD_BY_NAME = [
  ["hook", /hook/i],
  ["today", /today|now/i],
  ["value", /value/i],
  ["wink", /wink|funny/i],
];

/** The briefing part, without the agent's preamble, its own title or the VERDICT line. */
export function briefingText(text) {
  const t = String(text ?? "");
  const start = t.search(/^#{1,4}\s*Brand briefing\s*$/im);
  const end = t.search(QUESTIONS_HEADING);
  return t.slice(start >= 0 ? start : 0, end > start ? end : undefined)
    .replace(/^#{1,4}\s*Brand briefing\s*$/im, "")
    .replace(/^VERDICT:.*$/gim, "")
    .replace(/^#{1,2}\s/gm, "### ")
    .trim();
}

/**
 * The four questions keyed by form field ({hook, today, value, wink}), each the
 * question text without its bold name. Fields the answer did not cover are absent.
 *
 * @returns {Partial<Record<"hook" | "today" | "value" | "wink", string>>}
 */
export function briefingQuestions(text) {
  const t = String(text ?? "");
  const at = t.search(QUESTIONS_HEADING);
  if (at < 0) return {};
  const out = {};
  for (const line of t.slice(at).split("\n")) {
    const m = line.match(/^\s*(?:\d+\.|-)\s+\*\*(.+?)\*\*:?\s*(.+)$/);
    if (!m) continue;
    const field = FIELD_BY_NAME.find(([, re]) => re.test(m[1]))?.[0];
    if (field && !out[field]) out[field] = m[2].replace(/^:\s*/, "").trim();
  }
  return out;
}

/**
 * One brand question split into the question itself and its memory-jogging
 * examples, for the form. Newer briefings separate the examples with " | ";
 * older ones run them on after "For example,".
 *
 * @param {string} text
 * @returns {{question: string, examples: string[]}}
 */
export function splitQuestion(text) {
  const t = String(text ?? "").trim();
  if (t.includes(" | ")) {
    const [question, ...examples] = t.split(" | ").map((s) => s.trim()).filter(Boolean);
    return { question, examples };
  }
  const m = t.match(/^(.*?[?.])\s*(?:For example|E\.g\.|Examples?)[,:]?\s*(.+)$/i);
  if (!m) return { question: t, examples: [] };
  // Split on commas and "or" between examples, but not inside their parentheses.
  const examples = [];
  let depth = 0, cur = "";
  const rest = m[2].replace(/[.]\s*$/, "");
  for (let i = 0; i < rest.length; i++) {
    const c = rest[i];
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (depth === 0 && c === "," ) { examples.push(cur); cur = ""; continue; }
    cur += c;
  }
  examples.push(cur);
  const clean = examples
    .map((e) => e.trim().replace(/^(?:or|and)\s+/i, ""))
    .filter(Boolean)
    .map((e) => e.charAt(0).toUpperCase() + e.slice(1));
  return { question: m[1].trim(), examples: clean.length > 1 ? clean : [m[2].trim()] };
}
