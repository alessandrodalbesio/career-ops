// Fork: run the core's cv-line-fit.mjs on a saved CV HTML and report the lines
// whose last line holds only a word or two. Advisory by itself: the pdf run
// (api/run) sends the result back to the model to rewrite before rendering.
import { spawn } from "node:child_process";
import path from "node:path";

/**
 * @param {string} coreRoot  career-ops checkout (holds cv-line-fit.mjs)
 * @param {string} htmlPath  the saved CV HTML
 * @returns {Promise<Array<{text: string, lines: number, lastLineFill: number, cut: number, add: number}>>}
 *   flagged lines; [] when the check finds none OR cannot run (never blocks a CV on its own failure)
 */
export function checkCvLines(coreRoot, htmlPath) {
  return new Promise((resolve) => {
    let out = "";
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const child = spawn(process.execPath, [path.join(coreRoot, "cv-line-fit.mjs"), htmlPath, "--json"], { cwd: coreRoot });
    const timer = setTimeout(() => { child.kill("SIGKILL"); finish([]); }, 60_000);
    child.stdout.on("data", (d) => { out += d; });
    child.on("error", () => { clearTimeout(timer); finish([]); });
    child.on("close", () => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(out);
        finish(Array.isArray(parsed?.flagged) ? parsed.flagged : []);
      } catch {
        finish([]);
      }
    });
  });
}

/** The message the model gets for a lines repair, and the one the user sees. */
export function describeShortLines(flagged) {
  return flagged
    .map((f) => `- "${f.text}" — ${f.lines} lines, the last one only ${f.lastLineFill}% full. Cut about ${f.cut} characters so it takes one line less, or (only with facts from cv.md) add about ${f.add} so the last line fills up.`)
    .join("\n");
}
