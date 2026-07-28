#!/usr/bin/env node
/**
 * env-check — one declarative table of every environment variable this stack
 * uses, and a gate that fails CI whenever the four real sources disagree with it.
 *
 * WHY THIS EXISTS
 * ---------------
 * The same variable is written down in five independent places:
 *
 *   1. docker-compose.prod.yml (+ .staging)  — what the containers actually get
 *   2. .env.production.example               — what the operator is told to fill in
 *   3. apps/store-api/src/config/env.validation.ts — what the API refuses to boot without
 *   4. the two frontend Dockerfiles          — which build args the image accepts
 *   5. the application source                — what the code actually reads
 *
 * Nothing kept them in sync, and they drifted — not theoretically. Three holes
 * were live in production at once (TASK-324):
 *
 *   - STORE_CLIENT_URL was read by auth with a `http://localhost:3000` DEFAULT and
 *     set by nobody, so the Google-OAuth callback and every password-reset link
 *     pointed at localhost;
 *   - REVALIDATE_SECRET / STOREFRONT_REVALIDATE_URL were in the code on both
 *     sides and in no compose file, so ISR revalidation was dead: `/api/revalidate`
 *     answered 503 and no admin edit ever reached the storefront;
 *   - GOOGLE_CLIENT_ID / _SECRET / _CALLBACK_URL were declared in env.validation.ts
 *     and passed by nothing, so Google sign-in was unconfigurable in production.
 *
 * Each of those is invisible until a customer hits it, because the app boots
 * perfectly happily in every one of these states. That is the failure mode this
 * gate exists to make impossible: a variable that has a default is a variable
 * that will silently keep its default in production.
 *
 * Source 4 was added by TASK-348, after the gate proved it could not see a whole
 * class of the very bug it was written for. A NEXT_PUBLIC_* var is baked in by
 * `next build`, so it has to survive TWO hops the other vars never take:
 * `--build-arg` → `ARG` → `ENV` → `process.env`. Both hops fail silently. A
 * build arg for a name the Dockerfile never declares is discarded by BuildKit
 * with a warning nobody reads in CI, and an `ARG` with no matching `ENV` never
 * reaches `process.env` at all. Three variables were sitting in exactly that
 * hole — compose passed them, the Dockerfile did not take them:
 *
 *   - NEXT_PUBLIC_IMAGE_HOSTS / NEXT_PUBLIC_UMAMI_DASHBOARD_URL degraded
 *     additively (no extra image hosts, no dashboard link), which is why nobody
 *     noticed for two waves;
 *   - NEXT_PUBLIC_PAYMENT_METHODS did NOT: it is the storefront's entire notion
 *     of which payment methods exist, so every container build offered cash on
 *     delivery only — real LiqPay keys in store-api and all. The feature the
 *     whole Stage-8 payments wave was built for could not have shipped.
 *
 * Hence check 3b below: for every variable the table says is a build arg, the
 * named Dockerfile must declare `ARG X` *and* re-export `ENV X=${X}`, and must
 * not declare build ARGs the table does not know about.
 *
 * HOW IT WORKS
 * ------------
 * `VARS` below is the ONE place a variable is described. Every entry declares
 * where it must appear; the gate parses the four sources and diffs both ways, so
 * a variable added to a compose file, to the example, to env.validation.ts, or to
 * the code — and not to this table — turns CI red. That is the point: the table
 * is not documentation that trails the code, it is the thing the code is checked
 * against.
 *
 * IT NEVER READS A REAL ENV FILE. Only committed, non-secret sources: the compose
 * files, `.env.production.example`, `env.validation.ts` and the app source. There
 * is deliberately no "check my server's .env" mode — that would mean a script
 * whose job is to open the file holding every production secret, and the payoff
 * (compose already fails fast on a missing `:?` var) does not come close to
 * justifying it.
 *
 * USAGE
 *   node scripts/env-check.js --audit   # CI gate: exit 1 on any drift
 *   node scripts/env-check.js --docs    # print the matrix as markdown
 *   node scripts/env-check.js --docs --write   # splice it into the deploy doc
 *
 * The `--audit` run also verifies the markdown block in DOC_PATH is current, so
 * the operator-facing matrix cannot rot away from the table above it.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const COMPOSE_FILES = ["docker-compose.prod.yml", "docker-compose.staging.yml"];
const EXAMPLE_FILE = ".env.production.example";
const VALIDATION_FILE = "apps/store-api/src/config/env.validation.ts";
const DOC_PATH = "docs/deploy/04a-env-matrix.md";
const DOC_MARKER_START = "<!-- env-matrix:start -->";
const DOC_MARKER_END = "<!-- env-matrix:end -->";

/** Compose services whose `environment:` keys are checked key-for-key. */
const APP_SERVICES = ["store-api", "store-client", "store-admin"];
/** Compose services whose `build.args` keys are checked key-for-key. */
const BUILD_SERVICES = ["store-client", "store-admin"];

/**
 * The Dockerfile that builds each of those services. Checked for the `ARG X` +
 * `ENV X=${X}` pair every build arg needs to survive as far as `next build`.
 */
const DOCKERFILES = {
  "store-client": "apps/store-client/Dockerfile",
  "store-admin": "apps/store-admin/Dockerfile",
};

/** Source roots scanned for `process.env.X` / `config.get('X')`. */
const CODE_ROOTS = [
  "apps/store-api/src",
  "apps/store-client/src",
  "apps/store-admin/src",
  "apps/store-api/prisma",
  "e2e",
];

/**
 * Known drift that is accepted for now. Keyed `VAR@check`, and every entry needs
 * a reason and a task — same discipline as scripts/audit-gate.js. Empty is the
 * correct steady state: an exception here means a source and this table disagree
 * on purpose, which should be rare and always temporary.
 */
const EXCEPTIONS = {
  // 'FOO@example': { reason: '…', task: 'TASK-000' },
};

/**
 * Groups, in the order they are printed in the docs table.
 */
const GROUPS = [
  ["proxy", "Домени, проксі, деплой"],
  ["db", "PostgreSQL"],
  ["redis", "Redis (кеш + rate limit)"],
  ["search", "Meilisearch"],
  ["api", "store-api — ядро"],
  ["publishing", "Публікація контенту та ISR-ревалідація"],
  ["oauth", "Вхід через Google"],
  ["mail", "Пошта (SMTP)"],
  ["delivery", "Доставка (Нова Пошта)"],
  ["payments", "Онлайн-оплата (LiqPay)"],
  ["sentry", "Sentry (помилки)"],
  ["analytics", "Umami (аналітика)"],
  ["frontend", "Вітрина й адмінка (публічні, build-time)"],
  ["backup", "Бекапи (scripts/backup.sh)"],
  ["ops", "Разові операції (сид, створення адміна)"],
  ["tuning", "Тюнінг — усе має робочий дефолт"],
];

/**
 * THE TABLE.
 *
 * name       — variable name
 * group      — see GROUPS
 * need       — 'required' | 'conditional' | 'optional' (operator-facing)
 * compose    — expected `${VAR}` interpolation across the compose files:
 *              'required' (`:?` — compose refuses to start without it),
 *              'default'  (`:-` or a bare pass-through), 'none'
 * services   — app services that must receive it as an `environment:` key
 * buildArgs  — app services that must receive it as a `build.args` key, AND
 *              whose Dockerfile must carry the matching `ARG` + `ENV` pair
 * example    — must be a key in .env.production.example
 * validated  — expected declaration in env.validation.ts:
 *              'required' | 'conditional' | 'optional' | 'absent'
 * code       — 'used' (app source must read it), 'unused' (must not), 'either'
 * effect     — what breaks if it is not set (docs column, and the reason a
 *              reviewer can judge whether 'optional' is honest)
 * howTo      — how to produce a value
 * gap        — { reason, task }: a declared, acknowledged hole. Printed, not fatal.
 */
const VARS = [
  // ─── Домени, проксі, деплой ───────────────────────────────────────────────
  {
    name: "DOMAIN",
    group: "proxy",
    need: "required",
    compose: "required",
    services: [],
    buildArgs: [],
    example: true,
    validated: "absent",
    code: "unused",
    effect:
      "Caddy не підніметься: не знає, для яких доменів просити сертифікат.",
    howTo:
      "Кореневий домен магазину, напр. `shop.example.com`. `admin.` / `api.` Caddy додає сам.",
  },
  {
    name: "STAGING_BASIC_AUTH",
    group: "proxy",
    need: "conditional",
    compose: "required",
    services: [],
    buildArgs: [],
    example: true,
    validated: "absent",
    code: "unused",
    effect:
      "Лише staging: без нього `docker-compose.staging.yml` не стартує. На проді не читається — Caddyfile прода не має basic_auth.",
    howTo:
      "`docker run --rm caddy caddy hash-password --plaintext '<пароль>'`, хеш `$2a$…` вставити як є.",
  },
  {
    name: "IMAGE_TAG",
    group: "proxy",
    need: "optional",
    compose: "default",
    services: [],
    buildArgs: [],
    example: false,
    validated: "absent",
    code: "unused",
    effect:
      "Лише staging/деплой: без нього тягнеться плаваючий `staging-latest`. Для відкату вказують конкретний `staging-<sha>`.",
    howTo:
      "Експортує пайплайн деплою; вручну — лише під час відкату (docs/deploy/07-rollback.md).",
  },

  // ─── PostgreSQL ───────────────────────────────────────────────────────────
  {
    name: "POSTGRES_USER",
    group: "db",
    need: "required",
    compose: "required",
    services: [],
    buildArgs: [],
    example: true,
    validated: "absent",
    code: "unused",
    effect: "Стек не стартує. Входить у `DATABASE_URL`, який збирає compose.",
    howTo: "Будь-яке ім’я, напр. `store`.",
  },
  {
    name: "POSTGRES_PASSWORD",
    group: "db",
    need: "required",
    compose: "required",
    services: [],
    buildArgs: [],
    example: true,
    validated: "absent",
    code: "unused",
    effect: "Стек не стартує. Втрата пароля = недоступні бекапи бази.",
    howTo:
      "`openssl rand -hex 32` (hex — щоб не довелося URL-екранувати всередині DATABASE_URL).",
  },
  {
    name: "POSTGRES_DB",
    group: "db",
    need: "required",
    compose: "required",
    services: [],
    buildArgs: [],
    example: true,
    validated: "absent",
    code: "unused",
    effect: "Стек не стартує.",
    howTo:
      "Ім’я бази, напр. `store`. База `umami` створюється окремо й автоматично.",
  },
  {
    name: "DATABASE_URL",
    group: "db",
    need: "required",
    compose: "none",
    services: ["store-api"],
    buildArgs: [],
    example: false,
    validated: "required",
    code: "used",
    effect:
      "API не стартує. **Не задавайте вручну** — compose збирає його з POSTGRES_USER/PASSWORD/DB.",
    howTo: "Не задається в env-файлі; збирається у docker-compose.prod.yml.",
  },
  {
    name: "PRISMA_CONNECTION_LIMIT",
    group: "tuning",
    need: "optional",
    compose: "default",
    services: [],
    buildArgs: [],
    example: false,
    validated: "absent",
    code: "unused",
    effect:
      "Дефолт 10 з’єднань у пулі Prisma. Піднімати лише якщо контейнерів API стане більше одного (ліміт Postgres — 100 на всіх, включно з Umami).",
    howTo: "Ціле число; за замовчуванням 10.",
  },

  // ─── Redis ────────────────────────────────────────────────────────────────
  {
    name: "REDIS_HOST",
    group: "redis",
    need: "required",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect:
      "Порожній → API мовчки переходить на кеш у пам’яті, а rate limit перестає бути спільним для всіх процесів. У проді має бути `redis`.",
    howTo: "Ім’я сервісу в compose-мережі: `redis`.",
  },
  {
    name: "REDIS_PORT",
    group: "redis",
    need: "optional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect: "Дефолт 6379.",
    howTo: "6379.",
  },
  {
    name: "REDIS_PASSWORD",
    group: "redis",
    need: "required",
    compose: "required",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect:
      "Стек не стартує (Redis у проді завжди з паролем, на відміну від dev).",
    howTo: "`openssl rand -hex 32`.",
  },
  {
    name: "REDIS_CACHE_TTL_SECONDS",
    group: "redis",
    need: "optional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect: "Дефолт 60 с. Час життя кешованих читань каталогу.",
    howTo: "Ціле число секунд.",
  },

  // ─── Meilisearch ──────────────────────────────────────────────────────────
  {
    name: "MEILI_MASTER_KEY",
    group: "search",
    need: "required",
    compose: "required",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect:
      "Стек не стартує. Ключ спільний для сервісу meilisearch і для API — розійдуться, і пошук мовчки впаде на повільний скан Postgres.",
    howTo: "`openssl rand -hex 32` (Meili вимагає ≥16 символів).",
  },
  {
    name: "MEILI_ENV",
    group: "search",
    need: "optional",
    compose: "default",
    services: [],
    buildArgs: [],
    example: true,
    validated: "absent",
    code: "unused",
    effect:
      "Дефолт `production`. У `development` Meili відкриває свій веб-інтерфейс без ключа.",
    howTo: "Залиште `production`.",
  },
  {
    name: "MEILI_HOST",
    group: "search",
    need: "optional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect:
      "Дефолт `http://meilisearch:7700`. Порожній → пошук через скан Postgres.",
    howTo: "Міняти лише якщо Meili винесено за межі compose.",
  },
  {
    name: "MEILI_SEARCH_KEY",
    group: "search",
    need: "optional",
    compose: "none",
    services: [],
    buildArgs: [],
    example: false,
    validated: "optional",
    code: "unused",
    effect:
      "Нічого. Оголошена в env.validation.ts «на майбутнє» (пошук із браузера) і сьогодні не читається жодним рядком коду.",
    howTo: "Не задавайте.",
    gap: {
      reason:
        "declared in env.validation.ts but read by nothing; kept as a reserved name rather than deleted (its doc comment marks it as reserved for future browser-side search)",
      task: "TASK-324",
    },
  },

  // ─── store-api — ядро ─────────────────────────────────────────────────────
  {
    name: "NODE_ENV",
    group: "api",
    need: "required",
    compose: "none",
    services: ["store-api", "store-client", "store-admin"],
    buildArgs: [],
    example: false,
    validated: "required",
    code: "used",
    effect:
      "Не задається в env-файлі — compose жорстко ставить `production` усім трьом сервісам. Саме воно вмикає прод-режим cookie, CSP і прод-вимоги env.validation.",
    howTo: "Не задається вручну.",
  },
  {
    name: "PORT",
    group: "api",
    need: "optional",
    compose: "default",
    services: ["store-api", "store-client", "store-admin"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect:
      "Порт API (дефолт 3001); той самий номер Caddy проксіює на `api.<DOMAIN>`. Порти вітрини (3000) і адмінки (3002) зафіксовані в compose і від цієї змінної не залежать.",
    howTo: "3001.",
  },
  {
    name: "HOSTNAME",
    group: "api",
    need: "optional",
    compose: "none",
    services: ["store-client", "store-admin"],
    buildArgs: [],
    example: false,
    validated: "absent",
    code: "unused",
    effect:
      "Не задається в env-файлі — compose ставить `0.0.0.0`, інакше Next слухав би лише localhost усередині контейнера й Caddy до нього не достукався б.",
    howTo: "Не задається вручну.",
  },
  {
    name: "JWT_SECRET",
    group: "api",
    need: "required",
    compose: "required",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "required",
    code: "used",
    effect:
      "Стек не стартує. Відомий ключ = можливість підробити будь-який токен.",
    howTo:
      "`openssl rand -hex 32`. Мінімум 32 символи, **мусить відрізнятися** від JWT_REFRESH_SECRET.",
  },
  {
    name: "JWT_REFRESH_SECRET",
    group: "api",
    need: "required",
    compose: "required",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "required",
    code: "used",
    effect:
      "Стек не стартує. Однаковий із JWT_SECRET → access-токен проходить як refresh; env.validation це окремо блокує.",
    howTo: "`openssl rand -hex 32` — інше значення, ніж JWT_SECRET.",
  },
  {
    name: "JWT_EXPIRATION",
    group: "api",
    need: "optional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect: "Дефолт `15m` — час життя access-токена.",
    howTo: "`15m`.",
  },
  {
    name: "JWT_REFRESH_EXPIRATION",
    group: "api",
    need: "optional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect: "Дефолт `7d` — скільки клієнт лишається залогіненим.",
    howTo: "`7d`.",
  },
  {
    name: "CORS_ORIGINS",
    group: "api",
    need: "required",
    compose: "required",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "conditional",
    code: "used",
    effect:
      "Стек не стартує; API теж відмовиться (обов’язковий у проді). Помилка в одному символі — і кожен запит з вітрини вмирає в браузері покупця з CORS-помилкою.",
    howTo:
      "Через кому, точні origin без слеша в кінці: `https://<DOMAIN>,https://admin.<DOMAIN>`.",
  },
  {
    name: "CSRF_SECRET",
    group: "api",
    need: "required",
    compose: "required",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "conditional",
    code: "used",
    effect:
      "Стек не стартує; API теж (обов’язковий у проді). Dev-фолбек лежить у репозиторії — з ним CSRF-токен підробить будь-хто.",
    howTo: "`openssl rand -hex 32`, мінімум 32 символи.",
  },
  {
    name: "PUBLIC_BASE_URL",
    group: "api",
    need: "required",
    compose: "required",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect:
      "Стек не стартує. Неправильне значення → усі посилання на завантажені картинки товарів ведуть на localhost.",
    howTo: "`https://api.<DOMAIN>` — публічний origin API, без слеша в кінці.",
  },
  {
    name: "STORE_CLIENT_URL",
    group: "api",
    need: "required",
    compose: "none",
    services: ["store-api"],
    buildArgs: [],
    example: false,
    validated: "conditional",
    code: "used",
    effect:
      "Origin вітрини, куди API повертає користувача: callback Google-входу і посилання «відновити пароль» у листі. Без нього обидва вели б на `http://localhost:3000` — у проді це мертві посилання, і жодна перевірка при старті цього не бачила. Тепер API не стартує в проді без нього.",
    howTo:
      "Не задається окремо: compose бере значення з `NEXT_PUBLIC_APP_URL`. Дві незалежні змінні для одного й того самого origin гарантовано розійшлися б.",
  },
  {
    name: "UPLOAD_DEST",
    group: "api",
    need: "optional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect:
      "Дефолт `./uploads`. Змінивши, не забудьте перенести й volume — інакше картинки товарів зникнуть після редеплою.",
    howTo: "`./uploads`.",
  },
  {
    name: "LOG_LEVEL",
    group: "api",
    need: "optional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect:
      "Дефолт `info` у проді. `debug` роздує логи, `warn` приховає звичайні події.",
    howTo: "`trace|debug|info|warn|error|fatal|silent`.",
  },

  // ─── Публікація й ISR ─────────────────────────────────────────────────────
  {
    name: "REVALIDATE_SECRET",
    group: "publishing",
    need: "required",
    compose: "required",
    services: ["store-api", "store-client"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect:
      "Спільний секрет між API та вітриною. Без нього вітрина віддає на `/api/revalidate` 503, а API мовчки нічого не надсилає — тобто **жодна правка контенту в адмінці не з’являється на сайті**, доки не переїде кеш ISR. Одне значення на обидва сервіси; розійдуться — буде 401.",
    howTo: "`openssl rand -hex 32`.",
  },
  {
    name: "STOREFRONT_REVALIDATE_URL",
    group: "publishing",
    need: "optional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect:
      "Куди API стукає по ревалідацію. Дефолт — внутрішня адреса `http://store-client:3000/api/revalidate` всередині compose-мережі: назовні через Caddy ходити нема потреби. Порожнє значення = ревалідація вимкнена.",
    howTo: "Не чіпайте, якщо вітрина працює в тому ж compose-стеку.",
  },
  {
    name: "INDEXNOW_KEY",
    group: "publishing",
    need: "optional",
    compose: "default",
    services: ["store-client"],
    buildArgs: [],
    example: true,
    validated: "absent",
    code: "used",
    effect:
      "Порожній → пінги IndexNow не надсилаються (Bing/Seznam дізнаються про нові товари не одразу, а зі своїм обходом; Google цей протокол не використовує взагалі). Нічого не ламає.",
    howTo:
      "`openssl rand -hex 16`; те саме значення має віддавати `/indexnow.txt` на вітрині.",
  },

  // ─── Google OAuth ─────────────────────────────────────────────────────────
  {
    name: "GOOGLE_CLIENT_ID",
    group: "oauth",
    need: "optional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect:
      "Порожній → кнопка «Увійти через Google» відповідає 503, решта входу працює. Це навмисна деградація, а не поломка.",
    howTo:
      "Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web).",
  },
  {
    name: "GOOGLE_CLIENT_SECRET",
    group: "oauth",
    need: "optional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect: "Те саме, що GOOGLE_CLIENT_ID — задаються лише разом.",
    howTo: "Там само, поруч із client ID.",
  },
  {
    name: "GOOGLE_CALLBACK_URL",
    group: "oauth",
    need: "optional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect:
      "Мусить збігатися **символ у символ** з «Authorized redirect URI» у Google Cloud Console, інакше Google відхиляє вхід із `redirect_uri_mismatch`.",
    howTo: "`https://api.<DOMAIN>/api/auth/google/callback`.",
  },

  // ─── Пошта ────────────────────────────────────────────────────────────────
  {
    name: "MAIL_ENABLED",
    group: "mail",
    need: "optional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect:
      "Не `true` → жоден лист не йде: ні підтвердження замовлення, ні відновлення пароля. Решта `SMTP_*` при цьому не читається.",
    howTo: "`true`, коли є реальні SMTP-дані.",
  },
  {
    name: "SMTP_HOST",
    group: "mail",
    need: "conditional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect:
      "Потрібен, коли MAIL_ENABLED=true. Інакше листи мовчки не відправляються.",
    howTo: "Хост поштового провайдера.",
  },
  {
    name: "SMTP_PORT",
    group: "mail",
    need: "optional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect: "Дефолт 587 (STARTTLS). 465 — неявний TLS, тоді SMTP_SECURE=true.",
    howTo: "587 або 465.",
  },
  {
    name: "SMTP_SECURE",
    group: "mail",
    need: "optional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect: "Дефолт `false`. Розбіжність із портом = таймаути при відправці.",
    howTo: "`true` для 465, `false` для 587.",
  },
  {
    name: "SMTP_USER",
    group: "mail",
    need: "conditional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect: "Потрібен, коли MAIL_ENABLED=true.",
    howTo: "Логін у поштового провайдера.",
  },
  {
    name: "SMTP_PASS",
    group: "mail",
    need: "conditional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect: "Потрібен, коли MAIL_ENABLED=true.",
    howTo: "Пароль або app-password провайдера.",
  },
  {
    name: "MAIL_FROM",
    group: "mail",
    need: "conditional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect:
      "Адреса відправника. Домен має збігатися з тим, для якого налаштовані SPF/DKIM, інакше листи підуть у спам.",
    howTo:
      "`Магазин <no-reply@mail.<DOMAIN>>` — див. docs/deploy/02-domain-dns.md.",
  },

  // ─── Доставка ─────────────────────────────────────────────────────────────
  {
    name: "NP_API_KEY",
    group: "delivery",
    need: "optional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect:
      "Порожній → ендпоінти доставки віддають 503, а чекаут переходить на введення адреси текстом. Замовлення все одно оформлюється.",
    howTo: "Кабінет Нової Пошти → API-ключ.",
  },
  {
    name: "NP_SENDER_CITY_REF",
    group: "delivery",
    need: "optional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect:
      "Порожній → місто відправлення для розрахунку вартості вважається Києвом.",
    howTo: "UUID міста з довідника НП; далі редагується в адмінці.",
  },
  {
    name: "NP_ALLOW_KEYLESS",
    group: "delivery",
    need: "optional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    // Reader landed with TASK-337: apps/store-api/src/delivery/nova-poshta.client.ts.
    code: "used",
    effect:
      "Лише dev/staging. `true` → клієнт НП ходить у справжнє API з порожнім ключем (перевірено 2026-07-28: усі методи, які викликає проєкт, так відповідають) — це дозволяє пройти живу перевірку LG-4 ще до видачі ключа замовником. У проді МУСИТЬ бути `false`: поведінка недокументована й анонімні запити лімітуються.",
    howTo: "Не задавайте у проді. На стенді — `true`.",
  },

  // ─── Онлайн-оплата ────────────────────────────────────────────────────────
  {
    name: "LIQPAY_PUBLIC_KEY",
    group: "payments",
    need: "conditional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    // Reader landed with TASK-330: payment/adapters/liqpay/liqpay.adapter.ts.
    code: "used",
    effect:
      "Порожній → онлайн-оплати немає взагалі, чекаут пропонує лише оплату при отриманні. Застосунок стартує.",
    howTo:
      "Кабінет мерчанта LiqPay (реєструє ВЛАСНИК на свій ФОП). Тестова пара має префікс `sandbox_`.",
  },
  {
    name: "LIQPAY_PRIVATE_KEY",
    group: "payments",
    need: "conditional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    // Reader landed with TASK-330: payment/adapters/liqpay/liqpay.adapter.ts.
    code: "used",
    effect:
      "Порожній → те саме, що й без публічного ключа. Ключ підпису: НІКОЛИ не потрапляє у фронт і не може бути build-arg.",
    howTo:
      "Той самий кабінет; зберігати в менеджері паролів разом із рештою секретів.",
  },
  {
    name: "LIQPAY_SANDBOX",
    group: "payments",
    need: "optional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    // Reader landed with TASK-330: payment/adapters/liqpay/liqpay.adapter.ts.
    code: "used",
    effect:
      "У проді МУСИТЬ бути `false`. У пісочниці LiqPay віддає статус `sandbox`, який адаптер трактує як успішну оплату — залишений увімкненим у проді, він дозволяє будь-кому, хто знає публічний ключ, позначати замовлення оплаченими.",
    howTo: "`true` лише на staging, разом із ключами `sandbox_*`.",
  },
  {
    name: "LIQPAY_PAYTYPES",
    group: "payments",
    need: "optional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    // Reader landed with TASK-330: payment/adapters/liqpay/liqpay.adapter.ts.
    code: "used",
    effect:
      "Порожній → дефолтний набір (картка, Apple/Google Pay, Privat24). `payparts`/`moment_part` (оплата частинами) потребують ОКРЕМОЇ угоди з ПриватБанком — без неї кнопка з'явиться і не спрацює.",
    howTo: "Через кому. Розстрочку додавати лише після підписання угоди.",
  },
  {
    name: "PAYMENT_RECONCILE_CRON",
    group: "payments",
    need: "optional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    // Reader landed with TASK-330: payment/payment-reconcile.worker.ts.
    code: "used",
    effect:
      "Порожній → щохвилини. Це страховка від callback-ів, які не дійшли: LiqPay не документує ретраї, тож без опитування покупець може заплатити, а замовлення лишиться неоплаченим назавжди.",
    howTo: "Cron-вираз. Змінюйте лише якщо є причина.",
  },
  {
    name: "ORDER_RESERVATION_TTL_MINUTES",
    group: "payments",
    need: "optional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    // Reader landed with TASK-330: order/order.service.ts sets the reservation
    // deadline from it. TASK-352 stays open as the OWNER's decision on the value,
    // not as a missing reader.
    code: "used",
    effect:
      "Порожній → 30 хвилин. Скільки неоплачене онлайн-замовлення тримає резерв складу, перш ніж авто-скасуватись. На післяплату не діє — там резерв безстроковий.",
    howTo:
      "Рішення власника; відкрите питання TASK-352. Тому змінна, а не константа.",
  },
  {
    name: "ORDER_AUTOCANCEL_UNPAID",
    group: "payments",
    need: "optional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    // Reader landed with TASK-330: payment/payment-reconcile.worker.ts (and
    // order/order.service.ts). TASK-352 stays open as the owner's policy call.
    code: "used",
    effect:
      "Порожній → `true`. `false` повністю вимикає авто-скасування: неоплачені замовлення тримають склад, доки не втрутиться оператор.",
    howTo: "Рішення власника (TASK-352).",
  },
  {
    name: "GUEST_ORDER_TOKEN_TTL_DAYS",
    group: "payments",
    need: "optional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    // Reader landed with TASK-338: order/order.service.ts.
    code: "used",
    effect:
      "Порожній → 60 днів. Скільки живе посилання зі статусом замовлення для гостя — єдиний спосіб побачити своє замовлення, коли cookie кошика вже немає.",
    howTo: "Дні. Коротший строк безпечніший, але дратує покупця.",
  },
  {
    name: "TOTP_ENCRYPTION_KEY",
    group: "payments",
    need: "conditional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "either",
    effect:
      "Потрібен лише коли ввімкнено 2FA адмінки. Шифрує TOTP-секрети (AES-256-GCM). ВТРАТА КЛЮЧА = кожен адмін із 2FA заблокований назавжди: секрети не відновлюються, лишаються тільки резервні коди.",
    howTo:
      "`openssl rand -base64 32`. Зберігати в менеджері паролів поруч із age-ключем бекапів.",
    // STILL `either` — the ONLY one of the ten Stage-8 "declared ahead of its
    // reader" variables that has not caught up. Re-verified 2026-07-28
    // (TASK-348): the only occurrences outside this table are the field in
    // env.validation.ts, the compose pass-through, and a doc comment on
    // User.totpSecret in schema.prisma. There is no auth/totp module, nothing
    // imports otplib, and nothing decrypts anything with this key. Do not flip
    // it to `used` until TASK-344 actually lands — an unread key that the
    // operator has been told to generate and back up is a lie the gate exists to
    // catch.
    gap: {
      reason:
        "declared ahead of its reader and STILL unread: TASK-344 (TOTP enrolment) was deliberately deferred out of the Stage-8 wave, so the encrypt/decrypt path does not exist yet — verified by grep 2026-07-28",
      task: "TASK-344",
    },
  },

  {
    name: "EMAIL_VERIFICATION_TOKEN_EXPIRATION",
    group: "api",
    need: "optional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect:
      "Порожній → дефолт сервісу. Скільки живе посилання з листа підтвердження адреси (TASK-342).",
    howTo: "Формат тривалості, як у JWT_EXPIRATION (напр. `24h`).",
  },
  {
    name: "RBAC_PERMISSION_CACHE_TTL_SECONDS",
    group: "api",
    need: "optional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect:
      "Порожній → дефолт сервісу (60 c). Скільки гард тримає в кеші права ролі — тобто **скільки щонайдовше діятиме вже зняте право**. Нуль вимикає кеш і б'є в БД на кожен адмін-запит.",
    howTo:
      "Секунди. Збільшувати лише свідомо: це вікно, у якому звільнений працівник ще має доступ.",
  },
  {
    name: "NEXT_PUBLIC_PAYMENT_METHODS",
    group: "frontend",
    need: "optional",
    compose: "default",
    services: [],
    buildArgs: ["store-client"],
    example: true,
    validated: "absent",
    code: "used",
    effect:
      "Порожній → чекаут пропонує лише оплату при отриманні. Список способів оплати, які ввімкнені на цьому стенді, у НАШІЙ термінології (`ON_DELIVERY,ONLINE,INSTALLMENTS`) — не в термінах `paytypes` провайдера.",
    howTo:
      "Через кому. Тимчасовий шов: правильне рішення — ендпоінт `GET /api/payments/methods`, щоб фронт не вгадував конфігурацію бекенда.",
    gap: {
      reason:
        "a build-time allowlist standing in for an availability endpoint the API does not expose yet; the frontend cannot otherwise know which methods are configured",
      task: "TASK-330",
    },
  },

  // ─── Sentry ───────────────────────────────────────────────────────────────
  {
    name: "SENTRY_DSN",
    group: "sentry",
    need: "optional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect:
      "Порожній → Sentry на бекенді повністю вимкнено, помилки видно тільки в логах.",
    howTo: "Sentry → Project Settings → Client Keys (DSN).",
  },
  {
    name: "SENTRY_ENVIRONMENT",
    group: "sentry",
    need: "optional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect: "Дефолт — значення NODE_ENV. Розділяє прод і staging у Sentry.",
    howTo: "`production` / `staging`.",
  },
  {
    name: "SENTRY_TRACES_SAMPLE_RATE",
    group: "sentry",
    need: "optional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect:
      "Дефолт 0 — трасування вимкнено. Значення поза 0..1 блокує старт API.",
    howTo: "Число 0..1.",
  },
  {
    name: "NEXT_PUBLIC_SENTRY_DSN",
    group: "sentry",
    need: "optional",
    compose: "default",
    services: [],
    buildArgs: ["store-client", "store-admin"],
    example: true,
    validated: "absent",
    code: "used",
    effect:
      "Порожній → браузерний Sentry вимкнено. Запікається в бандл — зміна потребує **перезбирання образу**.",
    howTo: "Той самий проєкт Sentry, ключ для браузера.",
  },
  {
    name: "NEXT_PUBLIC_SENTRY_ENVIRONMENT",
    group: "sentry",
    need: "optional",
    compose: "default",
    services: [],
    buildArgs: ["store-client", "store-admin"],
    example: true,
    validated: "absent",
    code: "used",
    effect: "Дефолт `production`. Build-time.",
    howTo: "`production` / `staging`.",
  },
  {
    name: "NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE",
    group: "sentry",
    need: "optional",
    compose: "default",
    services: [],
    buildArgs: ["store-client", "store-admin"],
    example: true,
    validated: "absent",
    code: "used",
    effect: "Дефолт 0. Build-time.",
    howTo: "Число 0..1.",
  },
  {
    name: "SENTRY_ORG",
    group: "sentry",
    need: "optional",
    compose: "default",
    services: [],
    buildArgs: ["store-client", "store-admin"],
    example: true,
    validated: "absent",
    code: "unused",
    effect:
      "Лише під час збірки: без трійки ORG/PROJECT/AUTH_TOKEN не завантажуються source maps, і стектрейси в Sentry залишаються нечитабельними. Збірка не падає.",
    howTo: "Slug організації в Sentry.",
  },
  {
    name: "SENTRY_PROJECT",
    group: "sentry",
    need: "optional",
    compose: "default",
    services: [],
    buildArgs: ["store-client", "store-admin"],
    example: true,
    validated: "absent",
    code: "unused",
    effect: "Див. SENTRY_ORG.",
    howTo: "Slug проєкту в Sentry.",
  },
  {
    name: "SENTRY_AUTH_TOKEN",
    group: "sentry",
    need: "optional",
    compose: "default",
    services: [],
    buildArgs: ["store-client", "store-admin"],
    example: true,
    validated: "absent",
    code: "unused",
    effect: "Див. SENTRY_ORG. Це секрет — не в Variables, а в Secrets.",
    howTo: "Sentry → User Settings → Auth Tokens.",
  },

  // ─── Umami ────────────────────────────────────────────────────────────────
  {
    name: "UMAMI_APP_SECRET",
    group: "analytics",
    need: "required",
    compose: "required",
    services: [],
    buildArgs: [],
    example: true,
    validated: "absent",
    code: "unused",
    effect: "Стек не стартує (Umami підіймається разом з усіма).",
    howTo: "`openssl rand -hex 32`.",
  },
  {
    name: "UMAMI_ORIGIN",
    group: "analytics",
    need: "optional",
    compose: "default",
    services: ["store-api"],
    buildArgs: [],
    example: true,
    validated: "optional",
    code: "used",
    effect:
      "Порожній → CSP API не дозволяє origin скрипта Umami. Заповнювати лише коли Umami виставлено на публічний домен.",
    howTo: "Той самий origin, що й у NEXT_PUBLIC_UMAMI_SRC.",
  },
  {
    name: "NEXT_PUBLIC_UMAMI_SRC",
    group: "analytics",
    need: "optional",
    compose: "default",
    services: [],
    buildArgs: ["store-client"],
    example: true,
    validated: "absent",
    code: "used",
    effect: "Порожній → вітрина йде без аналітики. Build-time.",
    howTo: "Публічний URL скрипта Umami.",
  },
  {
    name: "NEXT_PUBLIC_UMAMI_WEBSITE_ID",
    group: "analytics",
    need: "optional",
    compose: "default",
    services: [],
    buildArgs: ["store-client"],
    example: true,
    validated: "absent",
    code: "used",
    effect: "Порожній → вітрина йде без аналітики. Build-time.",
    howTo: "ID сайту з панелі Umami.",
  },
  {
    name: "NEXT_PUBLIC_UMAMI_DASHBOARD_URL",
    group: "analytics",
    need: "optional",
    compose: "default",
    services: [],
    buildArgs: ["store-admin"],
    example: true,
    validated: "absent",
    code: "used",
    effect:
      "Порожній → картка «Відвідуваність» в адмінці показується приглушеною, без посилання (не веде в нікуди). Це НЕ те саме, що NEXT_PUBLIC_UMAMI_SRC: там скрипт лічильника для вітрини, тут лише посилання для власника. Build-time.",
    howTo:
      "Повний URL сторінки сайту в самій Umami, напр. `https://analytics.<DOMAIN>/websites/<website-id>`. Задавати лише коли Umami вже доступна на публічному домені.",
  },

  // ─── Вітрина й адмінка ────────────────────────────────────────────────────
  {
    name: "NEXT_PUBLIC_API_URL",
    group: "frontend",
    need: "required",
    compose: "required",
    services: [],
    buildArgs: ["store-client", "store-admin"],
    example: true,
    validated: "absent",
    code: "used",
    effect:
      "Збірка не почнеться. Задає і адресу API, і дозволений origin для next/image — **образ прив’язаний до цього домену**, зміна = перезбирання.",
    howTo: "`https://api.<DOMAIN>`.",
  },
  {
    name: "NEXT_PUBLIC_APP_URL",
    group: "frontend",
    need: "required",
    compose: "required",
    services: [],
    buildArgs: ["store-client", "store-admin"],
    example: true,
    validated: "absent",
    code: "used",
    effect:
      "Збірка не почнеться. Той самий origin compose передає в API як STORE_CLIENT_URL — тобто від нього залежать ще й посилання відновлення пароля та callback Google.",
    howTo: "`https://<DOMAIN>`.",
  },
  {
    name: "NEXT_PUBLIC_ADMIN_URL",
    group: "frontend",
    need: "required",
    compose: "required",
    services: [],
    buildArgs: ["store-admin"],
    example: true,
    validated: "absent",
    code: "unused",
    effect: "Збірка адмінки не почнеться.",
    howTo: "`https://admin.<DOMAIN>`.",
  },
  {
    name: "NEXT_PUBLIC_SITE_URL",
    group: "frontend",
    need: "optional",
    compose: "default",
    services: [],
    buildArgs: ["store-client"],
    example: true,
    validated: "absent",
    code: "used",
    effect:
      "Порожній → підставляється NEXT_PUBLIC_APP_URL. Це канонічний origin для sitemap, robots, JSON-LD і canonical — помилка тут псує індексацію.",
    howTo: "`https://<DOMAIN>`.",
  },
  {
    name: "NEXT_PUBLIC_CURRENCY",
    group: "frontend",
    need: "optional",
    compose: "default",
    services: [],
    buildArgs: ["store-client"],
    example: true,
    validated: "absent",
    code: "used",
    effect: "Дефолт `UAH`. Build-time.",
    howTo: "`UAH`.",
  },
  {
    name: "NEXT_PUBLIC_IMAGE_HOSTS",
    group: "frontend",
    need: "optional",
    compose: "default",
    services: [],
    buildArgs: ["store-client"],
    example: true,
    validated: "absent",
    code: "used",
    effect:
      "Порожній → оптимізується лише origin із NEXT_PUBLIC_API_URL, і плитка категорії з картинкою на будь-якому іншому хості мовчки падає на заглушку: ні помилки, ні запису в лог, просто категорія без зображення. Build-time.",
    howTo:
      "Через кому, ГОЛІ імена хостів без схеми й шляху: `cdn.mystore.ua,images.brand.com`. Додавати щойно в адмінці з'явилося зовнішнє посилання на картинку категорії.",
  },
  {
    name: "SERVER_FETCH_TIMEOUT_MS",
    group: "frontend",
    need: "optional",
    compose: "default",
    services: ["store-client"],
    buildArgs: [],
    example: true,
    validated: "absent",
    code: "either",
    effect:
      "Обмежує серверні fetch вітрини до API (SSR/ISR): скільки чекати, перш ніж віддати сторінку з деградованим блоком замість того, щоб висіти. Без значення діє дефолт 5000 мс (TASK-327). Збірочні (build-time) запити цим значенням не керуються — для них потрібен ARG у Dockerfile.",
    howTo:
      "Мілісекунди, дефолт 5000. Піднімати лише якщо API стабільно повільніший.",
  },

  // ─── Бекапи ───────────────────────────────────────────────────────────────
  {
    name: "AGE_PUBLIC_KEY",
    group: "backup",
    need: "required",
    compose: "none",
    services: [],
    buildArgs: [],
    example: true,
    validated: "absent",
    code: "unused",
    effect:
      "`backup.sh` відмовляється працювати, а прод-деплой робить бекап ПЕРЕД міграцією — тобто без цього ключа деплой не просто без бекапу, а взагалі не поїде.",
    howTo:
      "`age-keygen -o backup-key.txt` **на ноуті**; сюди — лише публічна половина `age1…`. Приватну на сервер не кладуть ніколи.",
  },
  {
    name: "RCLONE_REMOTE",
    group: "backup",
    need: "optional",
    compose: "none",
    services: [],
    buildArgs: [],
    example: true,
    validated: "absent",
    code: "unused",
    effect:
      "Порожній → бекапи лишаються на тому ж сервері, який вони мають захищати. Від втрати сервера це не захищає взагалі.",
    howTo: "Назва remote у rclone + шлях, напр. `b2:store-backups`.",
  },
  {
    name: "BACKUP_DIR",
    group: "backup",
    need: "optional",
    compose: "none",
    services: [],
    buildArgs: [],
    example: true,
    validated: "absent",
    code: "unused",
    effect: "Дефолт `<репозиторій>/backups`.",
    howTo: "Абсолютний шлях або порожньо.",
  },
  {
    name: "BACKUP_KEEP_DAYS",
    group: "backup",
    need: "optional",
    compose: "none",
    services: [],
    buildArgs: [],
    example: true,
    validated: "absent",
    code: "unused",
    effect:
      "Дефолт 7 днів — і лише для локальної копії. Довге зберігання налаштовують правилом життєвого циклу на бакеті, а не тут.",
    howTo: "Ціле число днів або порожньо.",
  },

  // ─── Разові операції ──────────────────────────────────────────────────────
  {
    name: "ADMIN_SEED_EMAIL",
    group: "ops",
    need: "optional",
    compose: "none",
    services: [],
    buildArgs: [],
    example: false,
    validated: "absent",
    code: "used",
    effect:
      "Лише для `db:seed`. Передається в командному рядку разово, не зберігається в env-файлі.",
    howTo: "Див. docs/seed-guide.md.",
  },
  {
    name: "ADMIN_SEED_PASSWORD",
    group: "ops",
    need: "optional",
    compose: "none",
    services: [],
    buildArgs: [],
    example: false,
    validated: "absent",
    code: "used",
    effect: "Лише для `db:seed`. Не зберігати в env-файлі.",
    howTo: "Див. docs/seed-guide.md.",
  },
  {
    name: "ALLOW_PROD_SEED",
    group: "ops",
    need: "optional",
    compose: "none",
    services: [],
    buildArgs: [],
    example: false,
    validated: "absent",
    code: "used",
    effect:
      "Запобіжник: сид відмовляється працювати проти прод-бази, доки не передати його явно однією командою. У env-файлі йому не місце.",
    howTo: "Передавати лише інлайн, свідомо: `ALLOW_PROD_SEED=1 …`.",
  },
  {
    name: "ADMIN_EMAIL",
    group: "ops",
    need: "optional",
    compose: "none",
    services: [],
    buildArgs: [],
    example: false,
    validated: "absent",
    code: "used",
    effect: "Лише для разового скрипта створення адміна.",
    howTo: "Передавати інлайн.",
  },
  {
    name: "ADMIN_PASSWORD",
    group: "ops",
    need: "optional",
    compose: "none",
    services: [],
    buildArgs: [],
    example: false,
    validated: "absent",
    code: "used",
    effect: "Лише для разового скрипта створення адміна.",
    howTo: "Передавати інлайн.",
  },

  // ─── Тюнінг ───────────────────────────────────────────────────────────────
  ...[
    ["MEM_POSTGRES", "768m"],
    ["MEM_REDIS", "192m"],
    ["MEM_MEILI", "384m"],
    ["MEM_UMAMI", "256m"],
    ["MEM_STORE_API", "640m"],
    ["MEM_STORE_CLIENT", "512m"],
    ["MEM_STORE_ADMIN", "384m"],
    ["MEM_CADDY", "96m"],
  ].map(([name, def]) => ({
    name,
    group: "tuning",
    need: "optional",
    compose: "default",
    services: [],
    buildArgs: [],
    example: false,
    validated: "absent",
    code: "unused",
    effect: `Ліміт пам’яті контейнера, дефолт ${def}. Розраховано на 4 ГБ VPS. Ліміти вирішують, ХТО помре при витоку пам’яті — без них ядро вбиває найбільший процес, тобто Postgres.`,
    howTo: `Задавати лише при зміні розміру VPS; дефолт ${def}.`,
  })),
  {
    name: "ACCOUNT_LOCKED_NOTICE_WINDOW_HOURS",
    group: "tuning",
    need: "optional",
    compose: "none",
    services: [],
    buildArgs: [],
    example: false,
    validated: "optional",
    code: "used",
    effect:
      "Дефолт 24 год — мінімальний проміжок між листами про блокування акаунта.",
    howTo: "Ціле число годин.",
  },
  {
    name: "REFRESH_TOKEN_CLEANUP_CRON",
    group: "tuning",
    need: "optional",
    compose: "none",
    services: [],
    buildArgs: [],
    example: false,
    validated: "optional",
    code: "used",
    effect: "Дефолт `0 3 * * *` — коли чистяться прострочені refresh-токени.",
    howTo: "Cron-вираз із 5 полів.",
  },
  {
    name: "REFRESH_TOKEN_REVOKED_RETENTION_DAYS",
    group: "tuning",
    need: "optional",
    compose: "none",
    services: [],
    buildArgs: [],
    example: false,
    validated: "optional",
    code: "used",
    effect: "Дефолт 0 — відкликані токени видаляються одразу.",
    howTo: "Ціле число днів.",
  },
  {
    name: "PASSWORD_RESET_TOKEN_EXPIRATION",
    group: "tuning",
    need: "optional",
    compose: "none",
    services: [],
    buildArgs: [],
    example: false,
    validated: "optional",
    code: "used",
    effect: "Дефолт `1h` — скільки живе посилання «відновити пароль».",
    howTo: "Напр. `1h`.",
  },
  {
    name: "PUBLISHING_CRON",
    group: "tuning",
    need: "optional",
    compose: "none",
    services: [],
    buildArgs: [],
    example: false,
    validated: "optional",
    code: "used",
    effect: "Дефолт — щохвилинна перевірка запланованих публікацій.",
    howTo: "Cron-вираз із 5 полів.",
  },
  {
    name: "MAIL_OUTBOX_CRON",
    group: "tuning",
    need: "optional",
    compose: "none",
    services: [],
    buildArgs: [],
    example: false,
    validated: "optional",
    code: "used",
    effect: "Дефолт — як часто розбирається черга вихідних листів.",
    howTo: "Cron-вираз із 5 полів.",
  },
  {
    name: "MAIL_OUTBOX_BATCH_SIZE",
    group: "tuning",
    need: "optional",
    compose: "none",
    services: [],
    buildArgs: [],
    example: false,
    validated: "optional",
    code: "used",
    effect: "Скільки листів відправляти за один тік черги.",
    howTo: "Ціле число.",
  },
  {
    name: "MAIL_OUTBOX_BACKOFF_BASE_MS",
    group: "tuning",
    need: "optional",
    compose: "none",
    services: [],
    buildArgs: [],
    example: false,
    validated: "optional",
    code: "used",
    effect: "Базова затримка повторної спроби відправки листа.",
    howTo: "Мілісекунди.",
  },
  {
    name: "MAIL_OUTBOX_BACKOFF_MAX_MS",
    group: "tuning",
    need: "optional",
    compose: "none",
    services: [],
    buildArgs: [],
    example: false,
    validated: "optional",
    code: "used",
    effect: "Стеля затримки повторної спроби відправки листа.",
    howTo: "Мілісекунди.",
  },
  {
    name: "NEXT_RUNTIME",
    group: "tuning",
    need: "optional",
    compose: "none",
    services: [],
    buildArgs: [],
    example: false,
    validated: "absent",
    code: "used",
    effect:
      "Не конфігурується оператором — Next.js сам виставляє його (`nodejs` / `edge`).",
    howTo: "Не задається.",
  },
];

// ───────────────────────────────────────────────────────────────────────────
// Parsers
// ───────────────────────────────────────────────────────────────────────────

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (text) =>
  text
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");

/**
 * `${VAR:?msg}` / `${VAR:-default}` / `${VAR}` across the compose files.
 * `$$VAR` (escaped for the container shell) is intentionally not a reference.
 * Returns Map<name, 'required'|'default'> keeping the STRONGEST form seen: the
 * same var is often `:?` in the service that owns it and bare where it is reused.
 */
function parseComposeRefs(texts) {
  const refs = new Map();
  const re = /(?<!\$)\$\{([A-Z][A-Z0-9_]*)(:\?|\?|:-|-)?/g;
  for (const text of texts) {
    const body = stripComments(text);
    let m;
    while ((m = re.exec(body))) {
      const strength = m[2] === ":?" || m[2] === "?" ? "required" : "default";
      const prev = refs.get(m[1]);
      if (prev !== "required") refs.set(m[1], strength);
    }
  }
  return refs;
}

/**
 * Per-service `environment:` and `build.args:` keys. Indentation-driven rather
 * than a YAML dependency — this script must run with zero installs.
 */
function parseComposeStructure(text) {
  const services = {};
  const buildArgs = {};
  let inServices = false;
  let current = null;
  let block = null;
  let blockIndent = 0;

  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    const indent = raw.match(/^\s*/)[0].length;

    if (indent === 0) {
      inServices = /^services:/.test(raw);
      current = null;
      block = null;
      continue;
    }
    if (!inServices) continue;

    if (indent === 2 && /^\s{2}[a-z0-9_-]+:\s*$/.test(raw)) {
      current = raw.trim().slice(0, -1);
      block = null;
      continue;
    }
    if (!current) continue;

    const blockStart = raw.match(/^\s*(environment|args):\s*$/);
    if (blockStart) {
      block = blockStart[1];
      blockIndent = indent;
      continue;
    }
    if (block) {
      if (indent <= blockIndent) {
        block = null;
      } else {
        const key = raw.match(/^\s*([A-Za-z_][A-Za-z0-9_]*):/);
        if (key) {
          const bucket = block === "environment" ? services : buildArgs;
          (bucket[current] ??= new Set()).add(key[1]);
        }
        continue;
      }
    }
  }
  return { services, buildArgs };
}

/**
 * A Dockerfile's `ARG X` declarations and its `ENV X=${X}` re-exports.
 *
 * Both halves are needed and neither is sufficient. `ARG` alone only creates a
 * build-time substitution variable; `next build` reads `process.env`, so without
 * the `ENV` line the value is accepted and then dropped. `ENV` alone would work
 * but cannot be fed from the outside. Only an assignment that references its own
 * name (`X=${X}`, optionally with a `:-default`) counts — `ENV X=1` is a
 * hardcoded value, not a pass-through, and would make a build arg look wired up
 * when it is being ignored.
 */
function parseDockerfileBuildVars(text) {
  // Fold `\`-continued lines so a multi-line ENV block is one instruction.
  const folded = text.replace(/\\\r?\n/g, " ");
  const args = new Set(
    [...folded.matchAll(/^\s*ARG\s+([A-Z][A-Z0-9_]*)/gim)].map((m) => m[1]),
  );
  const envs = new Set();
  for (const line of folded.matchAll(/^\s*ENV\s+(.*)$/gim)) {
    for (const a of line[1].matchAll(
      /([A-Z][A-Z0-9_]*)=\$\{([A-Z][A-Z0-9_]*)[^}]*\}/g,
    )) {
      if (a[1] === a[2]) envs.add(a[1]);
    }
  }
  return { args, envs };
}

/** Keys of `.env.production.example` (commented-out lines are not keys). */
function parseExample(text) {
  const keys = new Set();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]*)=/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

/**
 * Fields of `EnvironmentVariables`, with the kind implied by their decorators:
 * `@IsOptional` → optional, `@ValidateIf` → conditional, neither → required.
 */
function parseValidation(text) {
  const fields = new Map();
  const re = /^ {2}([A-Z][A-Z0-9_]*)[!?]?:\s*[^;]+;/gm;
  let m;
  let prevEnd = 0;
  while ((m = re.exec(text))) {
    const decorators = text.slice(prevEnd, m.index);
    const kind = decorators.includes("@IsOptional")
      ? "optional"
      : decorators.includes("@ValidateIf")
        ? "conditional"
        : "required";
    fields.set(m[1], kind);
    prevEnd = m.index + m[0].length;
  }
  return fields;
}

/** Every `process.env.X` / `config.get('X')` in non-test application source. */
function scanCode() {
  const names = new Map();
  const isTest = (p) =>
    /\.(test|spec|e2e-spec)\.[tj]sx?$/.test(p) || /[\\/]__tests__[\\/]/.test(p);
  const re =
    /(?:process\.env(?:\.([A-Z][A-Z0-9_]*)|\[['"]([A-Z][A-Z0-9_]*)['"]\])|(?:configService|config|configSvc)\.get(?:OrThrow)?(?:<[^>]*>)?\(\s*['"]([A-Z][A-Z0-9_]*)['"])/g;

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "generated" || entry.name === "node_modules")
          continue;
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name) || isTest(full)) continue;
      const src = fs.readFileSync(full, "utf8");
      let m;
      while ((m = re.exec(src))) {
        const name = m[1] || m[2] || m[3];
        const relPath = path.relative(ROOT, full).replace(/\\/g, "/");
        (names.get(name) ?? names.set(name, new Set()).get(name)).add(relPath);
      }
    }
  };

  for (const root of CODE_ROOTS) {
    const abs = path.join(ROOT, root);
    if (fs.existsSync(abs)) walk(abs);
  }
  return names;
}

// ───────────────────────────────────────────────────────────────────────────
// Audit
// ───────────────────────────────────────────────────────────────────────────

function audit() {
  const byName = new Map(VARS.map((v) => [v.name, v]));
  if (byName.size !== VARS.length) {
    console.error(
      "Duplicate entries in VARS — every variable must appear once.",
    );
    process.exit(1);
  }

  const composeTexts = COMPOSE_FILES.map(read);
  const refs = parseComposeRefs(composeTexts);
  const prod = parseComposeStructure(composeTexts[0]);
  const example = parseExample(read(EXAMPLE_FILE));
  const validation = parseValidation(read(VALIDATION_FILE));
  const code = scanCode();

  /** name -> [messages] */
  const drift = new Map();
  const skipped = [];
  const add = (name, check, message) => {
    const key = `${name}@${check}`;
    const allowed = EXCEPTIONS[key];
    if (allowed) {
      skipped.push({ key, message, ...allowed });
      return;
    }
    if (!drift.has(name)) drift.set(name, []);
    drift.get(name).push(`[${check}] ${message}`);
  };

  // 1. compose `${VAR}` interpolation, both directions.
  for (const [name, strength] of refs) {
    const v = byName.get(name);
    if (!v) {
      add(
        name,
        "table",
        `interpolated in a compose file but missing from VARS in ${rel(__filename)}`,
      );
      continue;
    }
    if (v.compose === "none") {
      add(
        name,
        "compose",
        "interpolated in a compose file, but the table says it never is",
      );
    } else if (v.compose !== strength) {
      add(
        name,
        "compose",
        `compose uses the ${strength === "required" ? "`:?` (required)" : "`:-`/pass-through (defaulted)"} form, the table expects ${v.compose}`,
      );
    }
  }
  for (const v of VARS) {
    if (v.compose === "none") continue;
    if (!refs.has(v.name)) {
      add(
        v.name,
        "compose",
        `expected as \${${v.name}${v.compose === "required" ? ":?…" : ":-…"}} in a compose file, found nowhere`,
      );
    }
  }

  // 2. per-service `environment:` keys of the three app services.
  for (const service of APP_SERVICES) {
    const actual = prod.services[service] ?? new Set();
    const expected = new Set(
      VARS.filter((v) => v.services.includes(service)).map((v) => v.name),
    );
    for (const key of actual) {
      if (!expected.has(key)) {
        add(
          key,
          "service",
          `passed to \`${service}\` in ${COMPOSE_FILES[0]}, but the table does not list that service`,
        );
      }
    }
    for (const name of expected) {
      if (!actual.has(name)) {
        add(
          name,
          "service",
          `the table says \`${service}\` must receive it, but ${COMPOSE_FILES[0]} does not set it there`,
        );
      }
    }
  }

  // 3. per-service `build.args:` keys.
  for (const service of BUILD_SERVICES) {
    const actual = prod.buildArgs[service] ?? new Set();
    const expected = new Set(
      VARS.filter((v) => v.buildArgs.includes(service)).map((v) => v.name),
    );
    for (const key of actual) {
      if (!expected.has(key)) {
        add(
          key,
          "build-arg",
          `a build arg of \`${service}\`, but the table does not list that service`,
        );
      }
    }
    for (const name of expected) {
      if (!actual.has(name)) {
        add(
          name,
          "build-arg",
          `the table says \`${service}\` must build with it, but ${COMPOSE_FILES[0]} does not pass it`,
        );
      }
    }

    // 3b. …and the Dockerfile must actually accept it. Compose passing a build
    //     arg the image never declares is a no-op with only a BuildKit warning;
    //     an ARG with no matching ENV never reaches `next build`. See the header.
    const dfPath = DOCKERFILES[service];
    const df = parseDockerfileBuildVars(read(dfPath));
    for (const name of expected) {
      if (!df.args.has(name)) {
        add(
          name,
          "dockerfile",
          `passed as a build arg to \`${service}\`, but ${dfPath} has no \`ARG ${name}\` — BuildKit discards the value and the build sees nothing`,
        );
      } else if (!df.envs.has(name)) {
        add(
          name,
          "dockerfile",
          `\`ARG ${name}\` exists in ${dfPath} but is never re-exported as \`ENV ${name}=\${${name}}\` — \`next build\` reads process.env, so the value is dropped`,
        );
      }
    }
    for (const name of df.args) {
      if (!expected.has(name)) {
        add(
          name,
          "dockerfile",
          `declared as \`ARG ${name}\` in ${dfPath}, but the table does not list \`${service}\` in buildArgs — nothing passes it, so the image bakes in an empty value`,
        );
      }
    }
  }

  // 4. `.env.production.example`.
  for (const key of example) {
    const v = byName.get(key);
    if (!v) add(key, "table", `a key in ${EXAMPLE_FILE} but missing from VARS`);
    else if (!v.example)
      add(
        key,
        "example",
        `present in ${EXAMPLE_FILE}, but the table says it should not be`,
      );
  }
  for (const v of VARS) {
    if (v.example && !example.has(v.name)) {
      add(
        v.name,
        "example",
        `the operator is expected to set it, but it is not a key in ${EXAMPLE_FILE}`,
      );
    }
  }

  // 5. `env.validation.ts`.
  for (const [name, kind] of validation) {
    const v = byName.get(name);
    if (!v)
      add(
        name,
        "table",
        `declared in ${VALIDATION_FILE} but missing from VARS`,
      );
    else if (v.validated === "absent")
      add(
        name,
        "validation",
        `declared in ${VALIDATION_FILE}, but the table says it is not validated`,
      );
    else if (v.validated !== kind)
      add(
        name,
        "validation",
        `declared as ${kind} in ${VALIDATION_FILE}, the table expects ${v.validated}`,
      );
  }
  for (const v of VARS) {
    if (v.validated !== "absent" && !validation.has(v.name)) {
      add(
        v.name,
        "validation",
        `expected as a ${v.validated} field of EnvironmentVariables, found nowhere`,
      );
    }
  }

  // 6. application source.
  for (const [name, files] of code) {
    const v = byName.get(name);
    if (!v) {
      add(
        name,
        "table",
        `read by ${[...files].slice(0, 2).join(", ")} but missing from VARS`,
      );
    } else if (v.code === "unused") {
      add(
        name,
        "code",
        `the table says nothing reads it, but ${[...files][0]} does`,
      );
    }
  }
  for (const v of VARS) {
    if (v.code === "used" && !code.has(v.name)) {
      add(
        v.name,
        "code",
        "the table says the application reads it, but no source file does",
      );
    }
  }

  // 7. The invariant that would have caught STORE_CLIENT_URL on the day it was
  //    introduced: everything handed to store-api must be declared in
  //    env.validation.ts, so a variable can never reach production unvalidated.
  for (const key of prod.services["store-api"] ?? []) {
    if (!validation.has(key)) {
      add(
        key,
        "invariant",
        `passed to store-api by compose but not declared in ${VALIDATION_FILE} — an unvalidated variable can silently keep a code default in production`,
      );
    }
  }

  // 8. Docs freshness — the operator-facing matrix must match this table.
  const docPath = path.join(ROOT, DOC_PATH);
  if (!fs.existsSync(docPath)) {
    add(
      "(docs)",
      "docs",
      `${DOC_PATH} does not exist — run \`node scripts/env-check.js --docs --write\``,
    );
  } else if (!docsAreCurrent(fs.readFileSync(docPath, "utf8"))) {
    add(
      "(docs)",
      "docs",
      `the matrix block in ${DOC_PATH} is stale — run \`node scripts/env-check.js --docs --write\``,
    );
  }

  report({ drift, skipped, refs, example, validation, code });
}

const rel = (p) => path.relative(ROOT, p).replace(/\\/g, "/");

function report({ drift, skipped, refs, example, validation, code }) {
  console.log(
    `Sources parsed: ${refs.size} compose refs, ${example.size} keys in ${EXAMPLE_FILE}, ` +
      `${validation.size} validated fields, ${code.size} variables read by application code, ` +
      `${VARS.length} rows in the table.`,
  );
  console.log("");

  const gaps = VARS.filter((v) => v.gap);
  if (gaps.length) {
    console.log(
      `Declared gaps — known, deliberate, and documented (${gaps.length}):`,
    );
    for (const v of gaps)
      console.log(`  - ${v.name} — ${v.gap.reason} (${v.gap.task})`);
    console.log("");
  }

  if (skipped.length) {
    console.log(`Suppressed by EXCEPTIONS (${skipped.length}):`);
    for (const s of skipped)
      console.log(`  - ${s.key} — ${s.reason} (${s.task})`);
    console.log("");
  }

  if (!drift.size) {
    console.log("No environment drift: every source agrees with the table.");
    return;
  }

  console.error(
    `ENVIRONMENT DRIFT — ${drift.size} variable(s) disagree with the table:`,
  );
  console.error("");
  for (const [name, messages] of [...drift].sort()) {
    console.error(`  ${name}`);
    for (const message of messages) console.error(`    ${message}`);
  }
  console.error("");
  console.error(
    "Each one is a place where a deployed container, the operator instructions,",
  );
  console.error(
    "the boot-time validation and the code have stopped meaning the same thing.",
  );
  console.error(
    "Fix the source, or — if the difference is deliberate — add the variable to",
  );
  console.error(
    `VARS in ${rel(__filename)}, or an entry with a reason and a task to EXCEPTIONS.`,
  );
  process.exit(1);
}

// ───────────────────────────────────────────────────────────────────────────
// Docs
// ───────────────────────────────────────────────────────────────────────────

const NEED_LABEL = {
  required: "**обов'язкова**",
  conditional: "умовна",
  optional: "необов'язкова",
};

/** Who actually stops a deploy when the value is missing. */
function enforcedBy(v) {
  const guards = [];
  if (v.compose === "required") guards.push("compose (`:?`)");
  if (v.validated === "required" || v.validated === "conditional")
    guards.push("env.validation");
  if (!guards.length) guards.push("ніхто — діє дефолт");
  return guards.join(" + ");
}

const cell = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");

function renderDocs() {
  const out = [];
  for (const [group, title] of GROUPS) {
    const rows = VARS.filter((v) => v.group === group);
    if (!rows.length) continue;
    out.push(`### ${title}`);
    out.push("");
    out.push(
      "| Змінна | Обов’язковість | Хто перевіряє | Якщо не задати | Як отримати значення |",
    );
    out.push("| --- | --- | --- | --- | --- |");
    for (const v of rows) {
      out.push(
        `| \`${v.name}\` | ${NEED_LABEL[v.need]} | ${cell(enforcedBy(v))} | ${cell(v.effect)} | ${cell(v.howTo)} |`,
      );
    }
    out.push("");
  }
  return out.join("\n").trimEnd();
}

/**
 * Compares cell-by-cell after trimming, so Prettier's reformatting is not
 * mistaken for staleness. Prettier owns every markdown file on commit
 * (lint-staged) and does two things to this table: it pads the columns, and it
 * backslash-escapes a bare `_` or `*` in prose. Both are undone here — otherwise
 * the gate would go red on the commit that merely formatted it, which is the
 * fastest way to teach everyone to ignore a gate.
 */
function normalizeTable(block) {
  return block
    .split(/\r?\n/)
    .map((line) => line.replace(/\\([_*])/g, "$1").trim())
    .filter(Boolean)
    .map((line) =>
      line.startsWith("|")
        ? line
            .split("|")
            .map((c) => c.trim())
            .join("|")
        : line,
    )
    .filter((line) => !/^\|[\s|:-]+\|$/.test(line))
    .join("\n");
}

function docsAreCurrent(docText) {
  const start = docText.indexOf(DOC_MARKER_START);
  const end = docText.indexOf(DOC_MARKER_END);
  if (start === -1 || end === -1) return false;
  const current = docText.slice(start + DOC_MARKER_START.length, end);
  return normalizeTable(current) === normalizeTable(renderDocs());
}

function writeDocs() {
  const docPath = path.join(ROOT, DOC_PATH);
  if (!fs.existsSync(docPath)) {
    console.error(
      `${DOC_PATH} does not exist — create it with the two markers first:`,
    );
    console.error(`  ${DOC_MARKER_START}`);
    console.error(`  ${DOC_MARKER_END}`);
    process.exit(1);
  }
  const text = fs.readFileSync(docPath, "utf8");
  const start = text.indexOf(DOC_MARKER_START);
  const end = text.indexOf(DOC_MARKER_END);
  if (start === -1 || end === -1) {
    console.error(
      `${DOC_PATH} is missing the ${DOC_MARKER_START} / ${DOC_MARKER_END} markers.`,
    );
    process.exit(1);
  }
  const next =
    text.slice(0, start + DOC_MARKER_START.length) +
    "\n\n" +
    renderDocs() +
    "\n\n" +
    text.slice(end);
  fs.writeFileSync(docPath, next);
  console.log(`Wrote the matrix into ${DOC_PATH}.`);
}

// ───────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.includes("--docs")) {
  if (args.includes("--write")) writeDocs();
  else console.log(renderDocs());
} else if (args.includes("--audit")) {
  audit();
} else {
  console.error("Usage: node scripts/env-check.js --audit | --docs [--write]");
  process.exit(1);
}
