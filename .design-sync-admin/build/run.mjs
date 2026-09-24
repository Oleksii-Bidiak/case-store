// design-sync runner for the ADMIN design system.
//
// The converter (.ds-sync/*.mjs) resolves `.design-sync/` from the cwd —
// previews/, overrides/, .cache/, learnings/ are all hard-wired to that name —
// and the storefront already owns the repo-root `.design-sync/`. So the admin
// sync runs from its own gitignored home, `.ds-sync-admin/`, in which
// `.design-sync` is a junction to `.design-sync-admin/`. Everything the
// converter reads or writes under `.design-sync/` therefore lands in
// `.design-sync-admin/`, and the storefront config is never touched.
//
// Usage (from the repo root):
//   node .design-sync-admin/build/run.mjs build            # compile-css + package-build
//   node .design-sync-admin/build/run.mjs validate         # package-validate
//   node .design-sync-admin/build/run.mjs capture [A,B]    # package-capture (optionally scoped)
//   node .design-sync-admin/build/run.mjs rebuild A,B      # preview-rebuild for named components
//   node .design-sync-admin/build/run.mjs resync [--remote .design-sync/.cache/remote-sync.json]
//   node .design-sync-admin/build/run.mjs serve            # http-serve ds-bundle (.review.html)
// Output: .ds-sync-admin/ds-bundle/. Paths passed through as extra args are
// relative to .ds-sync-admin/ (so `.design-sync/...` means .design-sync-admin/).
import { existsSync, mkdirSync, symlinkSync, lstatSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url)); // .design-sync-admin/build
const repoRoot = resolve(here, "..", "..");
const cfgDir = resolve(repoRoot, ".design-sync-admin");
const home = resolve(repoRoot, ".ds-sync-admin");
const staged = resolve(repoRoot, ".ds-sync");

if (!existsSync(resolve(staged, "package-build.mjs"))) {
  console.error(
    "✗ .ds-sync/ has no staged converter — copy the design-sync scripts there first (see .design-sync-admin/NOTES.md)",
  );
  process.exit(1);
}

function junction(path, target) {
  try {
    lstatSync(path);
    return; // exists (link or dir) — leave it
  } catch {
    /* missing */
  }
  symlinkSync(target, path, "junction");
  console.error(`  linked ${path} -> ${target}`);
}

mkdirSync(home, { recursive: true });
junction(resolve(home, ".design-sync"), cfgDir);
// The dts fork imports bare `ts-morph`; node resolves it from the fork's
// real location, so .design-sync-admin/node_modules must reach the staged deps.
junction(resolve(cfgDir, "node_modules"), resolve(staged, "node_modules"));

const [cmd = "build", ...rest] = process.argv.slice(2);
const common = [
  "--config",
  ".design-sync/config.json",
  "--node-modules",
  "../node_modules",
  "--out",
  "./ds-bundle",
];

function run(script, args) {
  const r = spawnSync(process.execPath, [resolve(staged, script), ...args], {
    cwd: home,
    stdio: "inherit",
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function compileCss() {
  const r = spawnSync(process.execPath, [resolve(here, "compile-css.mjs")], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

switch (cmd) {
  case "build":
    compileCss();
    run("package-build.mjs", [...common, ...rest]);
    break;
  case "validate":
    run("package-validate.mjs", ["./ds-bundle", ...rest]);
    break;
  case "capture":
    run("package-capture.mjs", [
      "--out",
      "./ds-bundle",
      ...(rest[0] && !rest[0].startsWith("--")
        ? ["--components", rest.shift()]
        : []),
      ...rest,
    ]);
    break;
  case "rebuild":
    run("lib/preview-rebuild.mjs", [
      ...common,
      "--components",
      rest.shift(),
      ...rest,
    ]);
    break;
  case "resync":
    compileCss();
    run("resync.mjs", [...common, ...rest]);
    break;
  case "serve":
    run("storybook/http-serve.mjs", ["./ds-bundle", ...rest]);
    break;
  default:
    console.error(`unknown command: ${cmd}`);
    process.exit(1);
}
