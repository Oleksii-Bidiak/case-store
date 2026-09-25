/**
 * scripts/env-check.js against a miniature fixture repo (TASK-494).
 *
 * The real table describes ~110 variables, so the fixture brings its own
 * three-row table and drives `audit({ root, vars })` directly. The fixture is
 * copied into a temp dir per test so each case can mutate one source and show
 * that exactly that drift is reported.
 *
 * Fixture files are stored under neutral names — `dockerfile.txt`,
 * `env.production.example`, `workflows/` — so repo-wide scanners (Trivy config,
 * GitHub's workflow runner) never mistake them for real ones; COPY_AS maps them
 * back to the paths env-check reads.
 *
 * Run: node --test scripts/__tests__/
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const envCheck = require("../env-check.js");

const FIXTURE = path.join(__dirname, "fixtures", "env-check");
const COPY_AS = {
  "env.production.example": ".env.production.example",
  "apps/store-client/dockerfile.txt": "apps/store-client/Dockerfile",
  "apps/store-admin/dockerfile.txt": "apps/store-admin/Dockerfile",
  "workflows/deploy.yml": ".github/workflows/deploy.yml",
};
const WORKFLOW = ".github/workflows/deploy.yml";

const row = (over) => ({
  group: "frontend",
  need: "optional",
  compose: "default",
  services: [],
  buildArgs: [],
  example: true,
  validated: "absent",
  code: "either",
  effect: "fixture",
  howTo: "fixture",
  ...over,
});

const VARS = [
  row({
    name: "API_SECRET",
    group: "api",
    need: "required",
    compose: "required",
    services: ["store-api"],
    validated: "required",
  }),
  row({
    name: "NEXT_PUBLIC_API_URL",
    need: "required",
    compose: "required",
    buildArgs: ["store-client", "store-admin"],
  }),
  row({
    name: "SENTRY_AUTH_TOKEN",
    group: "sentry",
    buildArgs: ["store-client", "store-admin"],
  }),
];

function listFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory()
      ? listFiles(full, base)
      : [path.relative(base, full).replace(/\\/g, "/")];
  });
}

/** A fresh copy of the fixture repo, with an up-to-date docs matrix. */
function makeRepo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "env-check-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const rel of listFiles(FIXTURE)) {
    const dest = path.join(root, COPY_AS[rel] ?? rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    // LF regardless of the checkout's autocrlf, so the edits below match.
    const text = fs.readFileSync(path.join(FIXTURE, rel), "utf8");
    fs.writeFileSync(dest, text.replace(/\r\n/g, "\n"));
  }
  const doc = path.join(root, envCheck.DOC_PATH);
  fs.mkdirSync(path.dirname(doc), { recursive: true });
  fs.writeFileSync(
    doc,
    `# matrix\n\n${envCheck.DOC_MARKER_START}\n\n${envCheck.renderDocs(VARS)}\n\n${envCheck.DOC_MARKER_END}\n`,
  );
  return root;
}

function edit(root, rel, fn) {
  const file = path.join(root, rel);
  const before = fs.readFileSync(file, "utf8");
  const after = fn(before);
  assert.notEqual(after, before, `the edit to ${rel} changed nothing`);
  fs.writeFileSync(file, after);
}

const messages = (result, name) => result.drift.get(name) ?? [];

/** report() prints; keep the test output readable. */
function quietly(fn) {
  const { log, error } = console;
  console.log = console.error = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
    console.error = error;
  }
}

test("the intact fixture has no drift and the gate passes", (t) => {
  const root = makeRepo(t);
  const result = envCheck.audit({ root, vars: VARS, exceptions: {} });
  assert.deepEqual([...result.drift.keys()], []);
  assert.equal(result.stats.workflowSteps, 3);
  assert.equal(
    quietly(() => envCheck.report(result)),
    true,
  );
});

test("a compose build arg missing from a workflow build-args list fails the gate", (t) => {
  const root = makeRepo(t);
  // Drop SENTRY_AUTH_TOKEN from the store-admin step only (the `|-` block).
  edit(root, WORKFLOW, (s) =>
    s.replace(
      /(build-args: \|-\n(?:.*\n)*?)\s+SENTRY_AUTH_TOKEN=.*\n/,
      "$1",
    ),
  );

  const result = envCheck.audit({ root, vars: VARS, exceptions: {} });
  assert.deepEqual([...result.drift.keys()], ["SENTRY_AUTH_TOKEN"]);
  const [msg] = messages(result, "SENTRY_AUTH_TOKEN");
  assert.match(msg, /^\[workflow\]/);
  assert.match(msg, /store-admin/);
  assert.match(msg, /\.github\/workflows\/deploy\.yml:\d+ \(job `deploy`/);
  assert.equal(
    quietly(() => envCheck.report(result)),
    false,
  );
});

test("a comment line inside a build-args block is not read as a key", (t) => {
  const root = makeRepo(t);
  edit(root, WORKFLOW, (s) =>
    s.replace(
      "SENTRY_AUTH_TOKEN=${{ secrets.SENTRY_AUTH_TOKEN }}\n          tags: ghcr",
      "SENTRY_AUTH_TOKEN=${{ secrets.SENTRY_AUTH_TOKEN }}\n            # a comment line inside the block is not a key\n          tags: ghcr",
    ),
  );
  const result = envCheck.audit({ root, vars: VARS, exceptions: {} });
  assert.deepEqual([...result.drift.keys()], []);
});

test("a workflow build arg the table does not list is flagged", (t) => {
  const root = makeRepo(t);
  edit(root, WORKFLOW, (s) =>
    s.replace(
      "NEXT_PUBLIC_API_URL=https://api.${{ vars.DOMAIN }}\n\n",
      "NEXT_PUBLIC_API_URL=https://api.${{ vars.DOMAIN }}\n            NEXT_PUBLIC_STRAY=1\n\n",
    ),
  );
  const result = envCheck.audit({ root, vars: VARS, exceptions: {} });
  assert.deepEqual([...result.drift.keys()], ["NEXT_PUBLIC_STRAY"]);
  assert.match(
    messages(result, "NEXT_PUBLIC_STRAY")[0],
    /\[workflow\].*store-client/,
  );
});

test("a service no workflow step builds is drift, not a silent pass", (t) => {
  const root = makeRepo(t);
  edit(root, WORKFLOW, (s) =>
    s.replace('file: "apps/store-admin/Dockerfile"', "file: apps/other/Dockerfile"),
  );
  const result = envCheck.audit({ root, vars: VARS, exceptions: {} });
  assert.deepEqual([...result.drift.keys()], ["store-admin"]);
  assert.match(messages(result, "store-admin")[0], /no step in/);
});

test("a build-args list removed entirely reports every compose arg", (t) => {
  const root = makeRepo(t);
  edit(root, WORKFLOW, (s) =>
    s.replace(
      /(file: apps\/store-client\/Dockerfile\n\s+push: true\n)\s+build-args: \|\n(?:\s+.*\n|\n)*?(\s+tags:)/,
      "$1$2",
    ),
  );
  const result = envCheck.audit({ root, vars: VARS, exceptions: {} });
  assert.deepEqual(
    [...result.drift.keys()].sort(),
    ["NEXT_PUBLIC_API_URL", "SENTRY_AUTH_TOKEN"],
  );
});

test("an EXCEPTIONS entry keyed NAME@workflow suppresses the drift", (t) => {
  const root = makeRepo(t);
  edit(root, WORKFLOW, (s) =>
    s.replace(/(build-args: \|-\n(?:.*\n)*?)\s+SENTRY_AUTH_TOKEN=.*\n/, "$1"),
  );
  const result = envCheck.audit({
    root,
    vars: VARS,
    exceptions: {
      "SENTRY_AUTH_TOKEN@workflow": { reason: "fixture", task: "TASK-000" },
    },
  });
  assert.deepEqual([...result.drift.keys()], []);
  assert.equal(result.skipped.length, 1);
});

test("an EXCEPTIONS entry that suppresses nothing is itself drift", (t) => {
  const root = makeRepo(t);
  const result = envCheck.audit({
    root,
    vars: VARS,
    exceptions: { "GONE@code": { reason: "fixed long ago", task: "TASK-000" } },
  });
  assert.deepEqual([...result.drift.keys()], ["(exceptions)"]);
  assert.match(messages(result, "(exceptions)")[0], /GONE@code suppressed nothing/);
});

test("a code-only variable excused @code is still caught once compose wires it (TASK-526 shape)", (t) => {
  const root = makeRepo(t);
  const src = path.join(root, "apps/store-client/src/flag.ts");
  fs.mkdirSync(path.dirname(src), { recursive: true });
  fs.writeFileSync(
    src,
    'export const FLAG = process.env.NEXT_PUBLIC_FLAG === "true";\n',
  );
  const exceptions = {
    "NEXT_PUBLIC_FLAG@code": { reason: "code-only on purpose", task: "TASK-526" },
  };

  // Read by code, not in the table: excused, and only that.
  let result = envCheck.audit({ root, vars: VARS, exceptions });
  assert.deepEqual([...result.drift.keys()], []);
  assert.deepEqual(
    result.skipped.map((s) => s.key),
    ["NEXT_PUBLIC_FLAG@code"],
  );

  // Someone threads it through compose without re-adding the row: red again.
  edit(root, "docker-compose.prod.yml", (s) =>
    s.replace(
      "        SENTRY_AUTH_TOKEN: ${SENTRY_AUTH_TOKEN:-}\n\n",
      "        SENTRY_AUTH_TOKEN: ${SENTRY_AUTH_TOKEN:-}\n        NEXT_PUBLIC_FLAG: ${NEXT_PUBLIC_FLAG:-}\n\n",
    ),
  );
  result = envCheck.audit({ root, vars: VARS, exceptions });
  assert.ok(result.drift.has("NEXT_PUBLIC_FLAG"));
  assert.ok(
    messages(result, "NEXT_PUBLIC_FLAG").some((m) => m.startsWith("[table]")),
  );
});

test("the real repo: NEXT_PUBLIC_FEATURE_STUBS is excluded from VARS with a reason (TASK-526)", () => {
  assert.equal(
    envCheck.VARS.some((v) => v.name === "NEXT_PUBLIC_FEATURE_STUBS"),
    false,
  );
  const entry = envCheck.EXCEPTIONS["NEXT_PUBLIC_FEATURE_STUBS@code"];
  assert.ok(entry, "expected an @code exception");
  assert.equal(entry.task, "TASK-526");
  assert.match(entry.reason, /TASK-085\/TASK-178/);
});

test("parseWorkflowBuildSteps: step boundaries, block scalars, job names", () => {
  const text = fs
    .readFileSync(path.join(FIXTURE, "workflows/deploy.yml"), "utf8")
    .replace(/\r\n/g, "\n");
  const steps = envCheck.parseWorkflowBuildSteps(text);
  assert.deepEqual(
    steps.map((s) => [s.job, s.step, s.file, [...s.args]]),
    [
      ["deploy", "Build & push store-api", "apps/store-api/Dockerfile", []],
      [
        "deploy",
        "Build & push store-client",
        "apps/store-client/Dockerfile",
        ["NEXT_PUBLIC_API_URL", "SENTRY_AUTH_TOKEN"],
      ],
      [
        "deploy",
        "Build & push store-admin",
        "apps/store-admin/Dockerfile",
        ["NEXT_PUBLIC_API_URL", "SENTRY_AUTH_TOKEN"],
      ],
    ],
  );
  // `line` points at the `file:` line (1-based).
  const lines = text.split(/\r?\n/);
  for (const s of steps) assert.match(lines[s.line - 1], /^\s+file:/);
});

test("parseWorkflowBuildSteps: build-args on a later step never leak into an earlier one", () => {
  const text = [
    "jobs:",
    "  a:",
    "    steps:",
    "      - name: first",
    "        uses: docker/build-push-action@v6",
    "        with:",
    "          file: apps/store-client/Dockerfile",
    "      - name: second",
    "        with:",
    "          build-args: |",
    "            X=1",
    "  b:",
    "    steps:",
    "      - with:",
    "          file: apps/store-admin/Dockerfile",
    "          build-args: >",
    "            Y=2",
    "",
  ].join("\n");
  const steps = envCheck.parseWorkflowBuildSteps(text);
  assert.deepEqual(
    steps.map((s) => [s.job, s.step, s.file, [...s.args]]),
    [
      ["a", "first", "apps/store-client/Dockerfile", []],
      ["b", "(unnamed step)", "apps/store-admin/Dockerfile", ["Y"]],
    ],
  );
});

test("the CLI module does not run its main when required", () => {
  // Requiring it above did not exit the test process or print a report —
  // reaching this line is the assertion; the export is the contract.
  assert.equal(typeof envCheck.main, "function");
  assert.equal(process.exitCode ?? 0, 0);
});
