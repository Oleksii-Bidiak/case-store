#!/usr/bin/env node
/**
 * Builds the RE-CHECK list after a live QA run.
 *
 * WHY: a full run of docs/qa-demo-server.md is 511 checks and takes days. After
 * the fix waves we only need to walk the checks that FAILED (❌) or were NOT
 * REACHED ([ ]) — plus know which task is supposed to have fixed each one. This
 * script derives exactly that list from the marked-up checklist, so nobody
 * re-types 226 items by hand and nothing gets lost between the two files.
 *
 *   node scripts/qa-recheck.js            # reads docs/qa-demo-server.md
 *   node scripts/qa-recheck.js <src> <dst>
 *
 * The output is a ONE-SHOT baseline: generate it once per live run, then edit
 * docs/qa-recheck.md BY HAND while tasks close (⬜ → 🔁 → ✅/❌). Re-running the
 * script overwrites those marks — do it only when a new baseline run happened.
 *
 * Marks in the generated file:
 *   [ ]   waiting for its task (or for staging)
 *   [🔁]  task merged into develop — NOT necessarily on the demo stand yet; the
 *         "Деплої" table in the header says which commit is live, re-check only after
 *   [✅]  re-checked, passes
 *   [❌ …] re-checked, still fails — write what you saw, open/reopen the task
 */

const { readFileSync, writeFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const REPO = join(__dirname, "..");
const SOURCE = process.argv[2] ? resolve(process.argv[2]) : join(REPO, "docs", "qa-demo-server.md");
const TARGET = process.argv[3] ? resolve(process.argv[3]) : join(REPO, "docs", "qa-recheck.md");

// ─── Check → task map (from docs/reviews/2026-08-27-demo-run-triage.md §3) ────
// Value: the task(s) that must land before the check is worth repeating, or a
// verdict when there is nothing to fix. Zone-level defaults cover the zones the
// run never reached.
const STAGING = "⛔ staging — TASK-457";
const MAP = {
  "SF-HOME-12": "TASK-410", "SF-HOME-15": "✔️ за задумом (стрічка керується з адмінки)", "SF-HOME-16": "TASK-412",
  "SF-CAT-11": "TASK-414 (+ B-10 TASK-458)", "SF-CAT-13": "TASK-414", "SF-CAT-14": "TASK-414",
  "SF-PDP-02": "TASK-416", "SF-PDP-03": "TASK-409", "SF-PDP-05": "TASK-409",
  "SF-PDP-14": "TASK-397", "SF-PDP-15": "TASK-397", "SF-PDP-29": "TASK-397", "SF-PDP-20": "TASK-446",
  "SF-SRCH-03": "TASK-417", "SF-SRCH-06": "TASK-411", "SF-SRCH-07": "TASK-411", "SF-SRCH-08": "TASK-417",
  "SF-SRCH-09": "TASK-417", "SF-SRCH-10": STAGING,
  "SF-CART-06": "TASK-418", "SF-CART-08": "TASK-402", "SF-CART-09": "TASK-402", "SF-CART-10": "TASK-402",
  "SF-CART-11": "TASK-402", "SF-CART-13": "TASK-402", "SF-CART-18": "TASK-403",
  "SF-CHK-03": "TASK-407", "SF-CHK-04": `TASK-402 + ${STAGING}`, "SF-CHK-05": STAGING, "SF-CHK-06": `TASK-402 + ${STAGING}`,
  "SF-CHK-08": "TASK-407", "SF-CHK-11": STAGING, "SF-CHK-13": STAGING, "SF-CHK-15": "✔️ за задумом", "SF-CHK-16": "✔️ за задумом",
  "SF-CHK-21": "TASK-397 (це адмінський тост)",
  "SF-ACC-04": "⚠️ TASK-372 навмисно; далі TASK-396", "SF-ACC-05": "⚠️ TASK-396", "SF-ACC-06": STAGING, "SF-ACC-07": STAGING,
  "SF-ACC-09": STAGING, "SF-ACC-11": "⚠️ TASK-175 🅿️", "SF-ACC-15": "TASK-408 (записати три числа)", "SF-ACC-19": STAGING,
  "SF-ACC-20": STAGING, "SF-ACC-21": STAGING, "SF-ACC-22": "⚠️ TASK-338", "SF-ACC-23": STAGING, "SF-ACC-24": "⚠️ TASK-373",
  "SF-AUTH-06": STAGING, "SF-AUTH-07": STAGING, "SF-AUTH-14": `TASK-406 (бейдж) + ${STAGING}`, "SF-AUTH-18": "🔧 скрипт у TASK-457",
  "SF-AUTH-19": STAGING, "SF-AUTH-20": STAGING, "SF-AUTH-22": "🔧 скрипт у TASK-457",
  "SF-CNT-04": "TASK-417", "SF-CNT-05": "TASK-436", "SF-CNT-08": "✔️ санітайзер працює", "SF-CNT-14": "✔️ проходить за побудовою",
  "SF-CNT-15": "⛔ TASK-283 (наповнення), staging", "SF-CNT-19": "TASK-401", "SF-CNT-20": "TASK-407", "SF-CNT-26": "TASK-435",
  "SF-SEO-09": "TASK-432 + curl у TASK-457", "SF-SEO-11": STAGING, "SF-SEO-12": "🔧 curl у TASK-457", "SF-SEO-13": "🔧 curl у TASK-457",
  "SF-SEO-14": "TASK-432 + curl у TASK-457", "SF-SEO-15": "🔧 curl у TASK-457", "SF-SEO-16": "🔧 curl у TASK-457",
  "SF-UX-01": "TASK-412", "SF-UX-02": "TASK-410", "SF-UX-07": "TASK-409 + TASK-416", "SF-UX-09": STAGING, "SF-UX-11": STAGING,
  "SF-UX-13": "TASK-419", "SF-UX-16": "TASK-422",
  "AD-AUTH-05": STAGING, "AD-DASH-01": "TASK-430", "AD-DASH-09": "TASK-430", "AD-DASH-10": STAGING, "AD-DASH-12": "🔧 TASK-457",
  "AD-DASH-13": "TASK-406", "AD-DASH-14": "⚠️ TASK-370",
  "AD-PROD-02": "TASK-398", "AD-PROD-08": "TASK-406", "AD-PROD-16": "TASK-409", "AD-PROD-25": "TASK-404",
  "AD-PROD-26": "🧭 за задумом; WYSIWYG — TASK-451", "AD-PROD-28": "TASK-427", "AD-PROD-33": "TASK-423",
  "AD-CAT-01": "TASK-408", "AD-CAT-07": "✔️ свідомо (E-11)", "AD-CAT-08": "TASK-408", "AD-CAT-09": "TASK-424",
  "AD-CAT-11": "TASK-408 (бейдж) + TASK-444", "AD-CAT-12": "TASK-398", "AD-CAT-13": "TASK-424", "AD-CAT-20": "TASK-425",
  "AD-DEV-04": "TASK-423", "AD-DEV-09": "🔧 TASK-457", "AD-DEV-10": "TASK-406",
  "AD-ORD-07": "TASK-425", "AD-ORD-08": "TASK-425", "AD-ORD-11": STAGING, "AD-ORD-12": STAGING, "AD-ORD-13": "TASK-425",
  "AD-ORD-15": "🔧 TASK-457", "AD-ORD-17": "TASK-443 → TASK-431", "AD-ORD-18": `TASK-426 + ${STAGING}`, "AD-ORD-19": STAGING,
  "AD-ORD-20": STAGING, "AD-ORD-24": STAGING, "AD-ORD-27": "TASK-426", "AD-ORD-29": "✔️ форма адреси є (TASK-425 підіймає блок)",
  "AD-CNT-04": "✔️ санітайзер працює", "AD-CNT-10": "TASK-434 + TASK-399", "AD-CNT-20": "TASK-424", "AD-CNT-21": "TASK-424 + TASK-429",
  "AD-CNT-25": "TASK-429", "AD-CNT-26": "TASK-429",
  "AD-MKT-08": "TASK-453 (admin-guide)", "AD-MKT-09": "TASK-425", "AD-MKT-12": "TASK-406",
  "AD-CRM-04": "TASK-430", "AD-CRM-10": "TASK-406", "AD-CRM-18": "TASK-446 (повторити зі «Схвалені»)", "AD-CRM-20": "TASK-406 + TASK-445",
};
const ZONE_DEFAULT = {
  "SF-PAY": "⛔ LiqPay sandbox — LG-3 у manual-qa-pending.md (TASK-457)",
  "AD-RET": "⚠️ TASK-370 + TASK-373; джерело істини — TASK-443",
  "AD-RBAC": "не дійшли — після TASK-406 (створення менеджера)",
  "AD-SET": "не дійшли — після хвилі 173",
  "AD-PUB": "не дійшли — після хвилі 173",
  "SYS": "не дійшли — після хвилі 173",
  "AD-IMP": "не дійшли — після хвилі 173",
};

function zoneOf(id) {
  const m = id.match(/^([A-Z]+(?:-[A-Z]+)?)-\d+$/);
  return m ? m[1] : id;
}
function taskFor(id) {
  return MAP[id] ?? ZONE_DEFAULT[zoneOf(id)] ?? "— (не дійшли; без задачі)";
}

const src = readFileSync(SOURCE, "utf8").split("\n");
const ITEM = /^- \[([^\]]*)\]\s+(\*\*([A-Z]+(?:-[A-Z]+)?-\d+)[^*]*\*\*.*)$/;

let currentPart = "";
let currentZone = "";
const out = [];
const byTask = new Map();
let kept = 0, failed = 0, unreached = 0;
let cur = null;

function flush() {
  if (!cur) return;
  const mark = cur.mark.trim();
  const isFail = mark.startsWith("❌");
  const isUnreached = mark === "";
  if (isFail || isUnreached) {
    if (cur.zoneHeader && !out.includes(cur.zoneHeader)) out.push("", cur.zoneHeader, "");
    const note = isFail ? mark.replace(/^❌\s*-?\s*/, "").trim() : "";
    const task = taskFor(cur.id);
    out.push(`- [ ] ${cur.head}`);
    for (const c of cur.body) out.push(c);
    out.push(`      🎯 ${task}${note ? ` · 📝 було: ${note}` : " · 📝 не дійшли"}`);
    kept++;
    if (isFail) failed++; else unreached++;
    const key = (task.match(/TASK-\d+/g) ?? ["(без задачі)"]);
    for (const k of key) {
      if (!byTask.has(k)) byTask.set(k, []);
      byTask.get(k).push(cur.id);
    }
  }
  cur = null;
}

for (const line of src) {
  if (line.startsWith("## ")) { flush(); currentPart = line; currentZone = ""; continue; }
  if (line.startsWith("### ")) { flush(); currentZone = line; continue; }
  const m = line.match(ITEM);
  if (m) {
    flush();
    cur = { mark: m[1], head: m[2], id: m[3], body: [], zoneHeader: currentZone };
    continue;
  }
  if (cur && /^\s{4,}\S/.test(line)) { cur.body.push(line); continue; }
  if (cur && line.trim() === "") { flush(); continue; }
}
flush();

const today = new Date().toISOString().slice(0, 10);
const header = `# Перепровірка після живого прогону 2026-08-27

> **Згенеровано** ${today} скриптом \`node scripts/qa-recheck.js\` із
> [\`qa-demo-server.md\`](qa-demo-server.md) (галочки власника). Сюди потрапили **лише** чеки,
> які були ❌ або до яких не дійшли: ${kept} із 511 (❌ ${failed}, не дійшли ${unreached}).
> Повністю заново нічого не проходимо.
>
> **Це базовий зріз, далі файл правиться руками.** Повторний запуск скрипта зітре позначки —
> робити лише після нового повного прогону.
>
> **Локального стенда немає: перевіряємо лише на демо-хостингу.** Тому \`[🔁]\` означає
> «фікс змержено у develop», а не «вже на стенді». Позначки накопичуються по ходу хвиль і
> проходяться **після заливки** — усі разом або порціями після кожного деплою. Який коміт зараз
> на стенді — таблиця нижче; чек має сенс перевіряти, лише якщо його задача змержена **до** цього
> коміту.
>
> | Деплой на демо | Коміт develop | Що заливалось |
> | --- | --- | --- |
> | — | — | ще не заливали після прогону 2026-08-27 |
>
> **Як користуватись.**
> - \`🎯\` під чеком — задача, після якої чек варто повторювати (або вердикт: ✔️ за задумом,
>   ⛔ staging, 🔧 скрипт, ⚠️ вже є задача). \`📝 було\` — що бачив тестер 2026-08-27.
> - **Виконавець задачі**, мержачи її у develop, ставить \`[🔁]\` на всіх чеках зі свого рядка в
>   Додатку А. Сесія, що заливає на стенд, дописує рядок у таблицю «Деплої».
> - **Тестер** після заливки проходить \`[🔁]\`: \`[✅]\` або \`[❌ що бачив]\`. Нове ❌ — рядок у
>   [\`reviews/2026-08-27-demo-run.md\`](reviews/2026-08-27-demo-run.md) і задача.
> - Чеки з \`⛔ staging\` проходяться у TASK-457 на staging із реальними ключами.
>
> Розбір кожного ❌ і чому саме ця задача — [\`reviews/2026-08-27-demo-run-triage.md\`](reviews/2026-08-27-demo-run-triage.md) §3.
`;

const appendix = ["", "---", "", "## Додаток А — задача → чеки (що позначати 🔁 після мержу)", ""];
const keys = [...byTask.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
for (const k of keys) appendix.push(`- **${k}** — ${byTask.get(k).join(", ")}`);

writeFileSync(TARGET, [header, ...out, ...appendix, ""].join("\n"), "utf8");
console.log(`qa-recheck: ${kept} checks (❌ ${failed}, unreached ${unreached}) → ${TARGET}`);
