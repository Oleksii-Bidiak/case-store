/**
 * scripts/check-docs-links.js — fence tracking (TASK-768).
 *
 * Fixture trees are written into a temp dir per test rather than committed as
 * .md files: Prettier owns every committed markdown file (lint-staged) and is
 * free to rewrite fence markers, which is exactly what these cases depend on.
 *
 * Run: node --test "scripts/__tests__/*.test.js"
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const docsLinks = require("../check-docs-links.js");

/** Writes { 'rel/path': 'content' } into a fresh temp dir and returns it. */
function makeRepo(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "docs-links-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return root;
}

const brokenOf = (result) =>
  result.broken.map((b) => `${b.file}:${b.lineNo} ${b.rel}`).sort();

const fenced = (text) =>
  docsLinks.fencedLines(text.split("\n")).map((f) => (f ? 1 : 0)).join("");

test("fencedLines: a plain ``` block opens and closes", () => {
  assert.equal(fenced("a\n```\nb\n```\nc"), "01110");
});

test("fencedLines: ``` inside a ```` fence does not close it", () => {
  assert.equal(fenced("````md\n```bash\nx\n```\n````\nafter"), "111110");
});

test("fencedLines: ~~~ inside a ``` fence is content, and vice versa", () => {
  assert.equal(fenced("```\n~~~\n```\nafter"), "1110");
  assert.equal(fenced("~~~\n```\n~~~\nafter"), "1110");
});

test("fencedLines: a closer must be at least as long as the opener", () => {
  assert.equal(fenced("`````\n```\n````\n`````\nafter"), "11110");
});

test("fencedLines: a line with an info string never closes a fence", () => {
  assert.equal(fenced("```\n```js\nstill in\n```\nafter"), "11110");
});

test("fencedLines: backticks in a backtick info string make it not a fence", () => {
  // CommonMark: "``` foo ` bar" is inline code, not an opening fence.
  assert.equal(fenced("``` a ` b\nprose"), "00");
});

test("fencedLines: an unclosed fence runs to the end of the file", () => {
  assert.equal(fenced("before\n```js\nx\ny"), "0111");
});

test("fencedLines: indented fences (inside list items) still pair up", () => {
  assert.equal(fenced("1. step\n   ```bash\n   x\n   ```\n2. next"), "01110");
});

test("odd and nested markers do not invert the rest of the file", (t) => {
  const root = makeRepo(t, {
    "docs/present.md": "# present\n",
    "docs/fences.md": [
      "Before: [ok](present.md)",
      "",
      "````markdown",
      "```bash",
      "[in-4tick](inside-four-backtick-fence.md)",
      "```",
      "````",
      "",
      "~~~",
      "```",
      "`docs/inside-tilde-fence.md`",
      "~~~",
      "",
      "```js",
      "[in-js](inside-js-fence.md)",
      "```",
      "",
      "After every block: [dead](missing-after-fences.md) and `docs/present.md`",
      "",
    ].join("\n"),
  });
  const result = docsLinks.run({ root, allowed: {} });
  // The old single-boolean toggle flipped on every ``` / ~~~ line — nine flips
  // here — so it ended the file "inside a fence": it hid the dead link on the
  // last line and reported the fenced examples on lines 5, 11 and 15 instead
  // (verified by running the pre-TASK-768 script on this exact file).
  assert.deepEqual(brokenOf(result), [
    "docs/fences.md:18 docs/missing-after-fences.md",
  ]);
});

test("an unclosed fence hides nothing before it and everything after it", (t) => {
  const root = makeRepo(t, {
    "docs/unclosed.md": [
      "[dead-before](missing-before.md)",
      "```js",
      "[x](inside-unclosed.md)",
      "",
    ].join("\n"),
  });
  const result = docsLinks.run({ root, allowed: {} });
  assert.deepEqual(brokenOf(result), ["docs/unclosed.md:1 docs/missing-before.md"]);
});

test("requiring the module does not run the CLI", () => {
  assert.equal(typeof docsLinks.main, "function");
  assert.equal(process.exitCode ?? 0, 0);
});
