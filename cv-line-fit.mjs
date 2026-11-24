#!/usr/bin/env node
// Fork (Miao): flag CV lines that waste space — a bullet whose last line holds
// only a word or two. Measured at the real print width (paper size from the
// injected @page rule minus --page-margin), the same way generate-pdf.mjs
// measures spill.
//
//   node cv-line-fit.mjs <cv.html> [--json] [--min 40]
//
// A multi-line block whose last line is under --min percent full is flagged with
// how many characters to cut (to drop that line) or add (to fill it). Exit 0
// always: this advises, the caller decides.
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const json = args.includes('--json');
const minIdx = args.indexOf('--min');
const MIN = minIdx >= 0 ? Number(args[minIdx + 1]) : 40;
if (!file) {
  console.error('Usage: node cv-line-fit.mjs <cv.html> [--json] [--min 40]');
  process.exit(1);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(resolve(file)).href);
  const dims = await page.evaluate(() => {
    const setup = document.getElementById('career-ops-page-setup')?.textContent || '';
    const letter = /size:\s*Letter/i.test(setup);
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;width:var(--page-margin, 0.6in);height:0';
    document.body.appendChild(probe);
    const margin = probe.getBoundingClientRect().width;
    probe.style.width = letter ? '8.5in' : '210mm';
    const w = probe.getBoundingClientRect().width;
    probe.remove();
    return { w, margin };
  });
  await page.setViewportSize({ width: Math.round(dims.w - 2 * dims.margin), height: 1100 });
  await page.emulateMedia({ media: 'print' });

  const rows = await page.evaluate((min) => {
    const out = [];
    const els = document.querySelectorAll('li, .summary-text, .skill-item, .award-desc, .project-context, .job-context');
    for (const el of els) {
      if (el.offsetParent === null || el.querySelector('li')) continue;
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = [...range.getClientRects()].filter((r) => r.width > 1);
      if (!rects.length) continue;
      const lines = new Map();
      for (const r of rects) {
        const k = Math.round(r.top);
        const prev = lines.get(k);
        lines.set(k, { left: Math.min(prev?.left ?? Infinity, r.left), right: Math.max(prev?.right ?? 0, r.right) });
      }
      const tops = [...lines.keys()].sort((a, b) => a - b);
      if (tops.length < 2) continue;
      const left = Math.min(...[...lines.values()].map((l) => l.left));
      const full = el.getBoundingClientRect().right - left;
      const last = lines.get(tops.at(-1));
      const fill = Math.round(((last.right - left) / full) * 100);
      if (fill >= min) continue;
      const text = el.textContent.replace(/\s+/g, ' ').trim();
      const perLine = Math.round(text.length / (tops.length - 1 + fill / 100));
      out.push({
        text,
        lines: tops.length,
        lastLineFill: fill,
        cut: Math.ceil((perLine * fill) / 100) + 1,
        add: Math.max(1, Math.round((perLine * (60 - fill)) / 100)),
      });
    }
    return out;
  }, MIN);

  if (json) console.log(JSON.stringify({ min: MIN, flagged: rows }, null, 2));
  else if (!rows.length) console.log(`✅ No short last lines (every wrapped line is at least ${MIN}% full).`);
  else {
    console.log(`⚠️  ${rows.length} line(s) end with a short last line (under ${MIN}% full):\n`);
    for (const r of rows) {
      console.log(`- [${r.lines} lines, last ${r.lastLineFill}% full] …${r.text.slice(-70)}`);
      console.log(`    → cut ~${r.cut} characters to drop the last line, or add ~${r.add} to fill it`);
    }
  }
} finally {
  await browser.close();
}
