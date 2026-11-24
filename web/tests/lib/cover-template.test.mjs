// Fork: the Cover letter page reads and rewrites only its own section of _custom.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readCoverTemplate, writeCoverTemplate } from "../../src/lib/cover-template.ts";

const FILE = `# Custom

## House Rules

- keep me

## Cover letter template

<!-- note -->

Old template.

### Voice

- Warm.

## Rules from the Profile page

### CVs

- rule
`;

test("readCoverTemplate: the section body, without comments, subheadings kept", () => {
  assert.equal(readCoverTemplate(FILE), "Old template.\n\n### Voice\n\n- Warm.");
});

test("writeCoverTemplate: replaces only the template section", () => {
  const next = writeCoverTemplate(FILE, "New template.");
  assert.equal(readCoverTemplate(next), "New template.");
  assert.match(next, /## House Rules\n\n- keep me/);
  assert.match(next, /## Rules from the Profile page\n\n### CVs\n\n- rule/);
});

test("writeCoverTemplate: adds the section before the Rules page's section when missing", () => {
  const next = writeCoverTemplate("# Custom\n\n## Rules from the Profile page\n\n- r\n", "T");
  assert.ok(next.indexOf("## Cover letter template") < next.indexOf("## Rules from the Profile page"));
  assert.equal(readCoverTemplate(next), "T");
});
