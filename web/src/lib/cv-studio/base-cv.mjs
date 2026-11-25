/**
 * The parts of cv.md the Studio compares a tailored CV against: the summary
 * paragraph, each experience entry's bullets, and each project's bullets.
 *
 * cv.md's shape knowledge lives in the core's lib/cv-markdown.mjs, which the
 * caller passes in. The web app cannot import core modules statically, and a
 * second copy of the Pandoc rules would drift from the checks that use them.
 *
 * @typedef {{company: string, bullets: string[]}} BaseEntry
 * @typedef {{summary: string|null, entries: BaseEntry[], projects: BaseEntry[]}} BaseCv
 * @typedef {typeof import("../../../../lib/cv-markdown.mjs")} CvMarkdown
 */

const SUMMARY_HEADING = /^(professional\s+)?(summary|profile|about( me)?)$/i;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const PROJECTS_HEADING = /^(selected\s+|personal\s+|key\s+)?projects?$/i;

/**
 * @param {string} md
 * @param {CvMarkdown} cvMarkdown
 * @returns {BaseCv}
 */
export function parseBaseCv(md, cvMarkdown) {
  const { findExperienceSections, parseCompanyHeading, headingText, normalizePandocLine, toPlainText } = cvMarkdown;
  /** @type {BaseEntry[]} */
  const entries = [];
  for (const lines of findExperienceSections(md)) {
    let current = null;
    for (const line of lines) {
      const heading = parseCompanyHeading(line) ?? (headingText(line, 3) !== null ? { company: toPlainText(headingText(line, 3)) } : null);
      if (heading) {
        current = { company: toPlainText(heading.company), bullets: [] };
        entries.push(current);
        continue;
      }
      const bullet = BULLET.exec(line);
      if (bullet && current) current.bullets.push(toPlainText(bullet[1]));
    }
  }
  return { summary: summaryOf(md, headingText, normalizePandocLine, toPlainText), entries, projects: projectsOf(md, headingText, normalizePandocLine, toPlainText) };
}

/**
 * Each `### title` entry under a `## Projects` heading, with its bullets. The
 * title drops cv.md's trailing `| 2026, project` note, which never prints.
 */
function projectsOf(md, headingText, normalizePandocLine, toPlainText) {
  /** @type {BaseEntry[]} */
  const projects = [];
  let inside = false;
  let current = null;
  for (const line of md.replace(/\r\n/g, "\n").split("\n").map(normalizePandocLine)) {
    const h2 = headingText(line, 2);
    if (h2 !== null) {
      inside = PROJECTS_HEADING.test(toPlainText(h2).trim());
      current = null;
      continue;
    }
    if (!inside) continue;
    const h3 = headingText(line, 3);
    if (h3 !== null) {
      current = { company: toPlainText(h3).replace(/\s*\|.*$/, "").trim(), bullets: [] };
      projects.push(current);
      continue;
    }
    const bullet = BULLET.exec(line);
    if (bullet && current) current.bullets.push(toPlainText(bullet[1]));
  }
  return projects;
}

function summaryOf(md, headingText, normalizePandocLine, toPlainText) {
  const lines = md.replace(/\r\n/g, "\n").split("\n").map(normalizePandocLine);
  const start = lines.findIndex((l) => {
    const h = headingText(l, 2);
    return h !== null && SUMMARY_HEADING.test(toPlainText(h).trim());
  });
  if (start < 0) return null;
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,2}\s/.test(line)) break;
    if (line.trim()) body.push(line.trim());
    else if (body.length) break;
  }
  return body.length ? toPlainText(body.join(" ")) : null;
}
