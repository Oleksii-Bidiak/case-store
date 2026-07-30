#!/usr/bin/env node
/**
 * Derives the demo-server QA checklist from the canonical one.
 *
 * WHY A GENERATOR AND NOT A SECOND CHECKLIST: docs/qa-manual-full.md is 536
 * checks that change whenever the product does. A hand-made copy for the demo
 * would drift from it within a wave, and a stale QA checklist is worse than no
 * checklist -- it reports green for a screen that no longer exists. So the demo
 * variant is generated: run this after editing the source and the two can never
 * disagree.
 *
 *   node scripts/qa-demo-checklist.js 203.0.113.10
 *
 * What it changes, and nothing else:
 *   1. localhost URLs -> the demo's nip.io hostnames;
 *   2. the intro and "Крок 0" -> a demo-stand version (the original assumes a
 *      local stand with docker compose and db:seed, neither of which applies);
 *   3. checks in EXCEPTIONS get a verdict: ⛔ impossible here, or 🔧 same check,
 *      different action.
 *
 * The bias in EXCEPTIONS is deliberate and one-directional: when unsure whether
 * a check survives the demo, leave it runnable. A false ⛔ hides a real defect
 * behind "not applicable"; a check that turns out to be unrunnable costs the
 * operator ten seconds and gets reported. Absence from this table is therefore
 * not a claim that a check works -- only that nothing about the demo's
 * configuration is known to stop it.
 */

const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const REPO = join(__dirname, "..");
const SOURCE = join(REPO, "docs", "qa-manual-full.md");
const TARGET = join(REPO, "docs", "qa-demo-server.md");

// ─── Exceptions ─────────────────────────────────────────────────────────────
// verdict: "blocked" -> cannot run here at all; "adapt" -> runs, but do it
// differently. Reasons are shown to the operator verbatim, so they say WHY,
// not just THAT.

const MAIL_OFF =
  "пошта вимкнена на демо (`MAIL_ENABLED=false`, `03b` крок 5) — листа не буде";
const PAY_OFF =
  "LiqPay на демо не налаштований (`03b` не задає жодної `LIQPAY_*`), у чекауті буде лише «При отриманні»";
const LOCAL_ONLY = "перевірка про локальний стенд, на сервері не відтворюється";

const EXCEPTIONS = {
  // ── Оплата ──
  "SF-PAY-02": ["blocked", PAY_OFF],
  "SF-PAY-03": ["blocked", PAY_OFF],
  "SF-PAY-04": ["blocked", PAY_OFF],
  "SF-PAY-05": ["blocked", PAY_OFF],
  "SF-PAY-06": ["blocked", PAY_OFF],
  "SF-PAY-07": ["blocked", PAY_OFF],
  "SF-PAY-08": ["blocked", PAY_OFF],
  "SF-PAY-09": ["blocked", PAY_OFF],
  "SF-PAY-10": ["blocked", PAY_OFF],
  "SF-PAY-11": ["blocked", PAY_OFF],
  "SF-PAY-12": [
    "adapt",
    "частина про післяплату працює й без LiqPay, але треба дочекатись TTL; змінити його можна лише через `.env.production` на сервері + рестарт",
  ],
  "SF-PAY-13": ["blocked", PAY_OFF],
  "SF-PAY-14": ["blocked", PAY_OFF],
  "SF-PAY-15": ["blocked", PAY_OFF],
  "SF-PAY-16": ["blocked", "стосується бойового стенда, не демо"],

  // ── Пошта ──
  "SF-AUTH-05": ["blocked", MAIL_OFF],
  "SF-AUTH-14": [
    "adapt",
    `перевір лише відповідь входу («Invalid credentials»); ${MAIL_OFF}`,
  ],
  "SF-AUTH-15": [
    "blocked",
    `${MAIL_OFF}; перевірка «другого листа немає» пройшла б із хибної причини`,
  ],
  "SF-AUTH-16": [
    "blocked",
    `${MAIL_OFF}; перевірка «жодного листа» пройшла б із хибної причини`,
  ],
  "SF-AUTH-21": ["blocked", MAIL_OFF],
  "SF-AUTH-23": [
    "blocked",
    `${MAIL_OFF}; токен скидання можна дістати з БД по SSH, але для прогону це не варте заходу`,
  ],
  "SF-ACC-07": ["adapt", `повідомлення в інтерфейсі перевіряється; ${MAIL_OFF}`],
  "SF-CHK-19": ["blocked", MAIL_OFF],
  "AD-AUTH-05": [
    "adapt",
    `блокування входу перевіряється; листа власнику — ні (${MAIL_OFF})`,
  ],
  "AD-ORD-19": [
    "adapt",
    `статус і ТТН у замовленні перевіряються; ${MAIL_OFF}`,
  ],

  // ── SYS: інфраструктура ──
  "SYS-01": [
    "adapt",
    "на сервері: `docker compose -f docker-compose.prod.yml --env-file .env.production ps` — контейнерів більше трьох, усі `healthy`",
  ],
  "SYS-02": ["adapt", "через `$COMPOSE exec postgres psql -U store -d store`"],
  "SYS-03": [
    "adapt",
    "зупиняй контейнер на сервері: `$COMPOSE stop redis`, потім `$COMPOSE start redis`",
  ],
  "SYS-04": [
    "blocked",
    "порт 7700 назовні не опублікований; що пошук живий — доводить зона SF-SRCH",
  ],
  "SYS-05": ["blocked", LOCAL_ONLY + " (міграції на демо накотились на кроці 6.3)"],
  "SYS-06": [
    "adapt",
    "`$COMPOSE exec -T store-api npx prisma migrate status --config prisma.config.ts`",
  ],
  "SYS-07": [
    "adapt",
    "сід уже виконано на кроці 7 ранбука; повторно не запускай — див. `03b` §10 пункт 5",
  ],
  "SYS-08": [
    "adapt",
    "звір `PUBLIC_BASE_URL` і `NEXT_PUBLIC_API_URL` у `.env.production` — на демо вони мають бути символ у символ однакові",
  ],
  "SYS-09": ["blocked", "повторний сів на демо навмисно не робимо (`03b` §10)"],
  "SYS-10": ["adapt", "через `$COMPOSE exec postgres psql`"],
  "SYS-11": ["adapt", "через `$COMPOSE exec postgres psql`"],
  "SYS-13": ["adapt", "через `$COMPOSE exec postgres psql`"],
  "SYS-14": ["adapt", "через `$COMPOSE exec postgres psql`"],
  "SYS-15": ["blocked", LOCAL_ONLY],
  "SYS-16": [
    "blocked",
    "демо працює в прод-режимі, тож Swagger тут і має бути закритий — це перевіряє SYS-17",
  ],
  "SYS-25": [
    "adapt",
    "Sentry на демо швидше за все не налаштований — тоді просто зафіксуй, що моніторингу немає",
  ],
  "SYS-26": [
    "adapt",
    "на сервері `$COMPOSE down` (**без** `-v`!) і `$COMPOSE up -d`; з `-v` втратиш базу й усі картинки",
  ],
  "SYS-27": [
    "blocked",
    "бекапи на демо не налаштовані — `AGE_PUBLIC_KEY` там навмисно порожній (`03b` крок 5)",
  ],
  "SYS-28": ["blocked", "немає бекапа, який можна було б відновити (див. SYS-27)"],
  "SYS-29": [
    "adapt",
    "на демо образи вже зібрані локально на кроці 6 — якщо стек піднявся, перевірка пройдена",
  ],
  "SYS-30": [
    "blocked",
    "відкат спирається на теги образів у реєстрі; демо збирає образи локально, тегів немає",
  ],
};

// ─── Derivation ─────────────────────────────────────────────────────────────

function hosts(ip) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    throw new Error(`Очікувалась IPv4-адреса сервера, отримано: ${ip}`);
  }
  const base = `${ip.replace(/\./g, "-")}.nip.io`;
  return { shop: `https://${base}`, admin: `https://admin.${base}`, api: `https://api.${base}` };
}

function header(ip, h, stats) {
  // 203.0.113.0/24 is RFC 5737 documentation space -- if it survived into a
  // generated file, nobody passed a real address, and every URL below is dead.
  const placeholder = /^203\.0\.113\./.test(ip)
    ? `\n> 🚨 **Адреси нижче — приклад, а не ваш сервер.** \`${ip}\` належить діапазону, який\n> стандарт (RFC 5737) відвів під документацію: реальних машин там не буває. Перегенеруй\n> файл зі своєю IP, інакше перший же пункт відкриє неіснуючий сайт.\n`
    : "";

  return `# Ручний прогін на демо-сервері — похідний чекліст
${placeholder}

> ⚙️ **Цей файл згенерований. Руками не редагуй** — правки затре наступний запуск.
> Джерело: [\`qa-manual-full.md\`](qa-manual-full.md). Перегенерувати:
> \`node scripts/qa-demo-checklist.js ${ip}\`
>
> **Що це.** Той самий вичерпний чекліст, але під тимчасове демо на \`nip.io\`
> (\`deploy/03b-test-deploy-no-domain.md\`): адреси підставлені, а перевірки, яких на демо
> не зробити, помічені й **не мають чекбокса**, щоб не роздували підсумок.
>
> **Ідентифікатори \`ЗОНА-nn\` збережені** — можеш посилатись на них у BACKLOG нарівні з
> основним чеклістом.

## Стенд

| Роль    | Адреса          |
| ------- | --------------- |
| Вітрина | ${h.shop}   |
| Адмінка | ${h.admin} |
| API     | ${h.api}   |

Команди на сервері всюди скорочені до \`$COMPOSE\`. Задай його один раз на сесію:

\`\`\`bash
cd /opt/case-store
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"
\`\`\`

## Як читати позначки

| Позначка | Значення                                                              |
| -------- | --------------------------------------------------------------------- |
| \`- [ ]\`  | звичайна перевірка — проходь як є                                     |
| 🔧       | та сама перевірка, але **інша дія** на сервері — читай примітку       |
| ⛔       | на демо **не робиться**; причина вказана. Чекбокса немає навмисно     |
| ⚠️       | пункт **очікувано червоний** — відомий розрив, підтвердження, не відкриття |

**Про ⛔ чесно.** Список складений за конфігурацією демо (пошта вимкнена, LiqPay не
налаштований, бекапів немає), а не за здогадами. Де було неясно — пункт **лишений
робочим**: хибне ⛔ ховає справжній дефект за словами «тут і не мало працювати», а зайва
перевірка коштує десять секунд. Тож відсутність позначки не означає «точно працює».

## Підсумок цього прогону

| | Кількість |
| --- | --- |
| Усього перевірок у джерелі | ${stats.total} |
| Проходяться на демо | **${stats.runnable}** |
| З них зі зміненою дією 🔧 | ${stats.adapt} |
| Не робляться тут ⛔ | ${stats.blocked} |

Найбільша діра — оплата: зона \`SF-PAY\` майже вся ⛔, бо LiqPay на демо не підключений.
Якщо треба перевірити саме гроші — це окрема задача на staging із sandbox-ключами, а не
на цьому стенді.

---

## Крок 0. Підготовка (демо вже підняте)

Локального стенда тут немає: ні \`docker compose up\`, ні \`npm run db:seed\` — усе це вже
зробили кроки 6–7 ранбука \`03b\`. Перед прогоном переконайся лише в чотирьох речах.

1. **Стек живий:** \`$COMPOSE ps\` → усі контейнери \`Up\`/\`healthy\`.
2. **API відповідає:** \`curl -sI ${h.api}/health\` → \`200\`.
3. **Каталог на місці:** відкрий ${h.shop} → товари, каруселі, банери.
4. **Фото видно, а не заглушки.** Якщо замість фото сірі плитки — далі йти немає сенсу,
   половина зон дасть ❌ через дані. Причини й лікування — \`03b\` крок 7.6.

**Акаунти.** Адмін — той, що ти задав у \`ADMIN_SEED_EMAIL\`/\`ADMIN_SEED_PASSWORD\` на
кроці 7.4. Покупець — \`customer@store.com\` / \`Customer123!\` (пароль опублікований у
\`seed-guide.md\`, і на демо це прийнятно рівно тому, що демо викидне).

> ⚠️ **Демо публічне і без пароля.** Усе, що ти тут наробиш, видно будь-кому, хто знає
> адресу. Не заводь реальних персональних даних — ні своїх, ні замовника.

`;
}

function derive(ip) {
  const h = hosts(ip);
  const src = readFileSync(SOURCE, "utf8");
  const lines = src.split(/\r?\n/);

  const cut = lines.findIndex((l) => l.startsWith("## Що робити з кожним ❌"));
  if (cut === -1) throw new Error("Не знайдено розділ «Що робити з кожним ❌» — джерело змінилось");

  const body = lines.slice(cut);
  const stats = { total: 0, runnable: 0, adapt: 0, blocked: 0 };
  const out = [];

  for (let i = 0; i < body.length; i++) {
    let line = body[i]
      .replace(/https?:\/\/localhost:3000/g, h.shop)
      .replace(/https?:\/\/localhost:3002/g, h.admin)
      .replace(/https?:\/\/localhost:3001/g, h.api)
      .replace(/`localhost:3000`/g, `\`${h.shop}\``)
      .replace(/`localhost:3002`/g, `\`${h.admin}\``)
      .replace(/`localhost:3001`/g, `\`${h.api}\``);

    const m = /^- \[ \] \*\*([A-Z]+(?:-[A-Z]+)*-\d+)/.exec(line);
    if (!m) {
      out.push(line);
      continue;
    }
    stats.total++;

    // A check is a block: its own line plus the indented continuations. The
    // verdict has to land after the LAST of them, or it splits a sentence.
    const block = [line];
    while (i + 1 < body.length && /^\s+\S/.test(body[i + 1])) {
      i++;
      block.push(
        body[i]
          .replace(/https?:\/\/localhost:3000/g, h.shop)
          .replace(/https?:\/\/localhost:3002/g, h.admin)
          .replace(/https?:\/\/localhost:3001/g, h.api),
      );
    }

    const rule = EXCEPTIONS[m[1]];
    if (!rule) {
      stats.runnable++;
      out.push(...block);
      continue;
    }
    const [verdict, reason] = rule;
    const indent = "      ";
    if (verdict === "blocked") {
      stats.blocked++;
      // Plain bullet, not a checkbox: nothing here is tickable.
      block[0] = block[0].replace(/^- \[ \] /, "- ⛔ ");
      block.push(`${indent}**Не на демо:** ${reason}.`);
    } else {
      stats.runnable++;
      stats.adapt++;
      block.push(`${indent}🔧 **На сервері:** ${reason}.`);
    }
    out.push(...block);
  }

  return header(ip, h, stats) + out.join("\n") + "\n";
}

const ip = process.argv[2];
if (!ip) {
  console.error("Вкажи IP демо-сервера: node scripts/qa-demo-checklist.js 203.0.113.10");
  process.exit(1);
}
writeFileSync(TARGET, derive(ip), "utf8");
console.log(`Готово: docs/qa-demo-server.md (демо на ${ip})`);
