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

// ── TASK-821: bare docs/….md tokens in code ──────────────────────────────────

const tokensIn = (t, line) => {
  const root = makeRepo(t, { "scripts/x.js": line + "\n" });
  return docsLinks.extractCode("scripts/x.js", root).map((r) => r.raw);
};

test("code tokens: a repo-root docs path in a comment or string is picked up", (t) => {
  assert.deepEqual(tokensIn(t, "// see docs/a/b-c.md for why"), ["docs/a/b-c.md"]);
  assert.deepEqual(tokensIn(t, 'const p = "docs/x.md";'), ["docs/x.md"]);
  assert.deepEqual(tokensIn(t, "// ./docs/x.md"), ["docs/x.md"]);
});

test("code tokens: trailing punctuation and anchors stay outside the token", (t) => {
  assert.deepEqual(
    tokensIn(t, "// (docs/a.md), docs/b.md. docs/c.md#sec docs/d.md:12 docs/e.md;"),
    ["docs/a.md", "docs/b.md", "docs/c.md", "docs/d.md", "docs/e.md"],
  );
});

test("code tokens: non-root and non-file look-alikes are not matched", (t) => {
  assert.deepEqual(tokensIn(t, "// scripts/docs/x.md"), []);
  assert.deepEqual(tokensIn(t, "// ../docs/x.md"), []);
  assert.deepEqual(tokensIn(t, "// mydocs/x.md my-docs/y.md"), []);
  assert.deepEqual(tokensIn(t, "// per docs/plans/156. and docs/deploy/"), []);
  assert.deepEqual(tokensIn(t, "// docs/x.mdx docs/y.md-old"), []);
  assert.deepEqual(tokensIn(t, "const p = `docs/${name}.md`; // docs/plans/NNN-*.md"), []);
});

test("the code scan reports dead docs refs in apps/*/src and scripts, and only there", (t) => {
  const root = makeRepo(t, {
    "docs/present.md": "# present\n",
    "apps/web/src/a.ts": [
      "// ok: docs/present.md.",
      "// dead: docs/missing-from-app.md",
      "// placeholder: docs/plans/NNN-name.md",
      "export const x = 1;",
    ].join("\n"),
    "apps/web/src/b.tsx": "{/* ./docs/missing-from-tsx.md */}\n",
    "apps/web/src/shared/api/generated/gen.ts": "// docs/missing-generated.md\n",
    "apps/web/next.config.mjs": "// docs/missing-outside-src.md\n",
    "apps/web/src/readme.md": "docs/missing-in-a-non-code-file.md\n",
    "scripts/tool.js": "// the old docs/old-example.md, and docs/missing-from-script.md\n",
    "scripts/__tests__/tool.test.js": "// docs/missing-in-a-test.md\n",
    "scripts/load/k6.mjs": "// docs/missing-from-load.md\n",
  });
  const result = docsLinks.run({
    root,
    allowed: { "scripts/tool.js": { "docs/old-example.md": "fixture: historical" } },
  });
  assert.deepEqual(brokenOf(result), [
    "apps/web/src/a.ts:2 docs/missing-from-app.md",
    "apps/web/src/b.tsx:1 docs/missing-from-tsx.md",
    "scripts/load/k6.mjs:1 docs/missing-from-load.md",
    "scripts/tool.js:1 docs/missing-from-script.md",
  ]);
});

test("the code scan covers the operator shell scripts and stylesheets too", (t) => {
  const root = makeRepo(t, {
    "docs/deploy/08-backup-restore.md": "# restore\n",
    "scripts/backup.sh": [
      "#!/usr/bin/env bash",
      'echo "Restore: see docs/deploy/08-backup-restore.md"',
      'echo "Then: docs/deploy/08-nonexistent-restore.md."',
      '# ${ROOT}/docs/not-a-root-ref.md and "$DIR/docs/also-not.md"',
    ].join("\n"),
    "scripts/disk-check.bash": "# docs/missing-from-bash.md\n",
    "scripts/win.ps1": "# docs/missing-from-ps1.md\n",
    "apps/web/src/app/globals.css": "/* tokens: docs/missing-design-system.md */\n",
    "scripts/notes.txt": "docs/missing-in-plain-text.md\n",
  });
  const result = docsLinks.run({ root, allowed: {} });
  assert.deepEqual(brokenOf(result), [
    "apps/web/src/app/globals.css:1 docs/missing-design-system.md",
    "scripts/backup.sh:3 docs/deploy/08-nonexistent-restore.md",
    "scripts/disk-check.bash:1 docs/missing-from-bash.md",
    "scripts/win.ps1:1 docs/missing-from-ps1.md",
  ]);
});

test("a per-file allowance does not excuse the same path in another file", (t) => {
  const root = makeRepo(t, {
    "scripts/tool.js": "// docs/old-example.md\n",
    "apps/web/src/a.ts": "// docs/old-example.md\n",
  });
  const result = docsLinks.run({
    root,
    allowed: { "scripts/tool.js": { "docs/old-example.md": "fixture" } },
  });
  assert.deepEqual(brokenOf(result), ["apps/web/src/a.ts:1 docs/old-example.md"]);
});

test("the real repo: its own header example is allowed only in check-docs-links.js", () => {
  const entry = docsLinks.ALLOWED_MISSING["scripts/check-docs-links.js"];
  assert.deepEqual(Object.keys(entry), ["docs/deploy.md"]);
});

test("requiring the module does not run the CLI", () => {
  assert.equal(typeof docsLinks.main, "function");
  assert.equal(process.exitCode ?? 0, 0);
});
