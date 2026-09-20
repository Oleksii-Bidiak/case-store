#!/usr/bin/env node
/**
 * check-docs-links — fail when the living documentation points at repo paths that
 * do not exist (TASK-453).
 *
 * WHY
 * ---
 * Files get moved (manual-qa-master.md → docs/archive/), renamed (docs/deploy.md →
 * the numbered docs/deploy/ sequence) or were only ever planned (a MonoPay adapter
 * that was described as if it existed). Nobody re-reads every doc after a move, so
 * a reader — often an operator following a runbook at 2 a.m. — lands on a path that
 * is not there. This gate turns "the doc says `scripts/foo.sh`" into a checked fact.
 *
 * WHAT IS SCANNED
 * ---------------
 * - docs/**\/*.md, EXCEPT the two historical trees below;
 * - the root rule files README.md, AGENTS.md, CLAUDE.md, requirements.md — they are
 *   the entry points every agent and developer reads first, so a dead path there
 *   costs the most. Cheap: four files.
 *
 * WHAT IS DELIBERATELY NOT SCANNED
 * --------------------------------
 * - docs/plans/**   — implementation plans are HISTORICAL RECORDS. A plan written in
 *                     July names the files as they were in July (and the files it
 *                     was about to create); rewriting it to today's tree would
 *                     falsify the record. Their header in docs/README.md says so.
 * - docs/archive/** — superseded documents kept verbatim on purpose; same reason.
 * - BACKLOG.md      — one row per task, each row describing the tree at the moment
 *                     the task was done (renamed/deleted files included). It is a
 *                     log, not a map; its narratives live in the plans anyway.
 *
 * WHAT COUNTS AS A PATH
 * ---------------------
 * 1. Inside `inline code` / fenced-free backtick spans: every token that starts with
 *    one of the top-level repo dirs  scripts/ apps/ docs/ packages/ e2e/  (optionally
 *    prefixed with ./). These are resolved against the REPO ROOT — that is how the
 *    docs write them.
 * 2. Markdown link targets  [text](target)  and reference definitions  [id]: target .
 *    Resolved against the DIRECTORY OF THE DOC (that is how Markdown renders them).
 *    http(s)/mailto/tel links and pure #anchors are ignored, and so are root-absolute
 *    targets like (/categories): in these docs they are storefront ROUTES. Links are
 *    looked for outside code spans only.
 * Fenced code blocks (``` … ```) are skipped entirely: they hold shell sessions and
 * examples whose paths are often run-time or remote (a server's /opt/...).
 *
 * NORMALISATION / HEURISTICS (skip rather than false-positive)
 * ------------------------------------------------------------
 * - Suffixes stripped: #anchor, ?query, :line, :line-line, :line,line, :Lnn, and
 *   trailing sentence punctuation (. , ; : !) and a trailing slash.
 * - Placeholders → SKIPPED: anything containing < > { } $ … or "...", or the
 *   template tokens NNN / XXX / YYYY / xx (e.g. docs/plans/NNN-name.md,
 *   docs/reviews/2026-xx-xx-staging-run.md). They name a pattern, not a file.
 * - Globs: a path with * or ? is checked only up to the last segment before the
 *   first wildcard (apps/store-api/src/**  → apps/store-api/src must exist).
 * - Next.js route segments like [slug] and (shop) are real directory names and are
 *   checked literally.
 * - Existence is checked with EXACT CASE, segment by segment, even on Windows/macOS:
 *   CI runs on case-sensitive Linux, so `Docs/README.md` is broken there.
 * - A missing path that git would IGNORE (Orval output, .next/, uploads/, dist/) is
 *   skipped: it is a build/run-time artefact, legitimately absent from a fresh
 *   checkout. Decided by `git check-ignore`; without git the path is just reported.
 *
 * ALLOWLIST
 * ---------
 * ALLOWED_MISSING below — exact paths, scoped to one doc, each with a reason. Prefer
 * rephrasing the doc ("буде створено в TASK-NNN") over adding an entry.
 *
 * Usage:  node scripts/check-docs-links.js       (npm run docs:links)
 * Exit:   0 — every reference resolves; 1 — list of  file:line → missing path.
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

/** Historical trees — see the header for why they are excluded. */
const EXCLUDED_DIRS = ["docs/plans", "docs/archive"];
const ROOT_FILES = ["README.md", "AGENTS.md", "CLAUDE.md", "requirements.md"];

/**
 * Per-doc exceptions: { 'doc.md': { 'missing/path': 'reason' } }. Scoped to ONE doc on
 * purpose — the same dead path in any other doc still fails. Keep it tiny; every entry
 * needs a reason.
 */
const ALLOWED_MISSING = {
  // A dated audit cites the evidence as it stood on 2026-07-24. The stub it points at
  // was deleted by the very task the audit asked for (TASK-331, a162b604); rewriting
  // the evidence column would falsify the record. The cell says so next to the path.
  "docs/reviews/2026-07-24-launch-readiness-audit.md": {
    "apps/store-client/src/widgets/cart/ui/cart-delivery-payment.tsx":
      "deleted by TASK-331 after the audit",
  },
};

function isAllowed(file, rel) {
  return Boolean(ALLOWED_MISSING[file] && ALLOWED_MISSING[file][rel]);
}

const REPO_DIRS = "(?:scripts|apps|docs|packages|e2e)";
// A path token inside a backtick span. Allowed chars cover Next.js [slug]/(group)
// segments, dots, dashes, @scope, globs and placeholders (the latter are filtered
// afterwards, so they must be captured whole rather than cut in half).
const CODE_PATH_RE = new RegExp(
  `(?:^|[\\s"'=(:,])(?:\\./)?(${REPO_DIRS}/[^\\s\`"',()]*(?:\\([^\\s\`"'()]*\\)[^\\s\`"',()]*)*)`,
  "g",
);
// [text](target) — target may contain one level of balanced parens: (shop), (auth).
const MD_LINK_RE =
  /\]\(\s*<?((?:[^()\s<>]|\([^()\s]*\))+)>?(?:\s+"[^"]*")?\s*\)/g;
const ROOT_ABS_REPO_RE = new RegExp(`^/${REPO_DIRS}/`);
const MD_REF_RE = /^\s{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s+.*)?$/;

const PLACEHOLDER_RE =
  /[<>{}$…]|\.\.\.|NNN|XXX|YYYY|(?:^|[-/_.])xx(?:$|[-/_.])/;

function toPosix(p) {
  return p.split(path.sep).join("/");
}

function listDocs() {
  const out = [];
  const walk = (dirRel) => {
    if (EXCLUDED_DIRS.includes(dirRel)) return;
    for (const entry of fs.readdirSync(path.join(ROOT, dirRel), {
      withFileTypes: true,
    })) {
      const rel = `${dirRel}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (entry.isFile() && entry.name.endsWith(".md")) out.push(rel);
    }
  };
  walk("docs");
  for (const f of ROOT_FILES)
    if (fs.existsSync(path.join(ROOT, f))) out.push(f);
  return out.sort();
}

/** Strip anchors, queries, :line suffixes and trailing punctuation. */
function normalise(raw) {
  let p = raw.trim();
  p = p.replace(/[#?].*$/, "");
  p = p.replace(/[.,;:!]+$/, "");
  p = p.replace(/:(?:L?\d+(?:[-–,]\s*L?\d+)*)$/, "");
  p = p.replace(/[.,;:!]+$/, "");
  p = p.replace(/\/+$/, "");
  return p;
}

/** Drop everything from the first wildcard segment on; '' if nothing is left. */
function globPrefix(p) {
  const segs = p.split("/");
  const i = segs.findIndex((s) => /[*?]/.test(s));
  return i === -1 ? p : segs.slice(0, i).join("/");
}

const dirCache = new Map();
function readDirNames(absDir) {
  if (!dirCache.has(absDir)) {
    let names = null;
    try {
      names = new Set(fs.readdirSync(absDir));
    } catch {
      names = null;
    }
    dirCache.set(absDir, names);
  }
  return dirCache.get(absDir);
}

/** Case-exact existence check, segment by segment from the repo root. */
function existsExact(relPosix) {
  let abs = ROOT;
  for (const seg of relPosix.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      abs = path.dirname(abs);
      continue;
    }
    const names = readDirNames(abs);
    if (!names || !names.has(seg)) return false;
    abs = path.join(abs, seg);
  }
  return true;
}

function gitIgnored(paths) {
  if (paths.length === 0) return new Set();
  try {
    const out = execFileSync("git", ["check-ignore", "--no-index", "--stdin"], {
      cwd: ROOT,
      input: paths.join("\n"),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    return new Set(out.split(/\r?\n/).filter(Boolean));
  } catch (err) {
    // Exit 1 = "none of them is ignored"; anything else = git unavailable.
    if (err.status === 1) return new Set();
    return new Set();
  }
}

function extract(fileRel) {
  const text = fs.readFileSync(path.join(ROOT, fileRel), "utf8");
  const fileDir = path.posix.dirname(fileRel);
  const refs = [];
  let inFence = false;
  text.split(/\r?\n/).forEach((line, idx) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const lineNo = idx + 1;

    // 1. Backtick spans → repo-root-relative paths.
    for (const span of line.matchAll(/`([^`]+)`/g)) {
      for (const m of span[1].matchAll(CODE_PATH_RE)) {
        refs.push({ lineNo, raw: m[1], rel: m[1] });
      }
    }

    // 2. Markdown links / reference definitions → doc-relative paths. Code spans are
    //    blanked first: a `[x](y)` inside backticks is shown literally, not linked.
    const prose = line.replace(/`[^`]*`/g, "");
    const targets = [...prose.matchAll(MD_LINK_RE)].map((m) => m[1]);
    const ref = prose.match(MD_REF_RE);
    if (ref) targets.push(ref[1]);
    for (const t of targets) {
      if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(t)) continue; // URL, anchor
      let decoded = t;
      try {
        decoded = decodeURIComponent(t);
      } catch {
        /* keep raw */
      }
      // A leading slash is almost always a SITE route in these docs ([Категорії](/categories)),
      // not a repo path — unless it names one of the top-level repo dirs.
      if (decoded.startsWith("/") && !ROOT_ABS_REPO_RE.test(decoded)) continue;
      const base = decoded.startsWith("/")
        ? decoded.slice(1)
        : path.posix.join(fileDir, decoded);
      refs.push({ lineNo, raw: t, rel: path.posix.normalize(base) });
    }
  });
  return refs;
}

function main() {
  const files = listDocs();
  const missing = [];
  let checked = 0;
  let skipped = 0;

  for (const file of files) {
    for (const ref of extract(file)) {
      if (PLACEHOLDER_RE.test(ref.raw)) {
        skipped++;
        continue;
      }
      const rel = globPrefix(normalise(ref.rel));
      if (!rel || rel === "." || rel.startsWith("../")) {
        skipped++;
        continue;
      }
      checked++;
      if (existsExact(rel) || isAllowed(file, rel)) continue;
      missing.push({ file, lineNo: ref.lineNo, raw: ref.raw, rel });
    }
  }

  const ignored = gitIgnored([...new Set(missing.map((m) => m.rel))]);
  const broken = missing.filter((m) => !ignored.has(m.rel));

  if (broken.length === 0) {
    console.log(
      `docs:links — ${files.length} files, ${checked} path references resolve ` +
        `(${skipped} placeholders skipped, ${missing.length - broken.length} git-ignored artefacts).`,
    );
    process.exit(0);
  }

  console.error(
    `docs:links — ${broken.length} reference(s) to paths that do not exist:\n`,
  );
  for (const b of broken) {
    const shown = b.raw === b.rel ? b.rel : `${b.raw}  (→ ${b.rel})`;
    console.error(`  ${toPosix(b.file)}:${b.lineNo} → ${shown}`);
  }
  console.error(
    "\nFix the path, rephrase a not-yet-existing file as a plan, or (last resort) add a " +
      "commented entry to ALLOWED_MISSING in scripts/check-docs-links.js.",
  );
  process.exit(1);
}

main();
