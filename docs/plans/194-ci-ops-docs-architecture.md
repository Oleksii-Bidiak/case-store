# План 194 — CI, пайплайн, ops, доки; архітектурний хвіст API

**Статус:** 🔄 — частина I ✅ (2026-09-25, 18/18 задач пройшли незалежну перевірку, гілка не
змержена; TASK-753 — холодний логін 3/3, повний Playwright червоний до TASK-750/751), частина A2 ⬜ ·
**Задачі:** 23 рядки у двох частинах · **Гілки:** частина I —
`worktree-chore-494-ci-ops-docs` (worktree `chore-494-ci-ops-docs`), частина A2 —
`worktree-refactor-806-api-architecture` (worktree `refactor-806-api-architecture`) · **Після:**
I — M(190); A2 — мержу всіх API-частин циклу (192, 193, 184A, 185A, 188A, 187A) і до S186 ·
**Джерело:** хвости плану 179 (TASK-454/455), [ревʼю якості 2026-09-20](../reviews/2026-09-code-review.md),
TASK-328 з Етапу 7.

## Навіщо

Частина I — все, що живе поза кодом застосунків: воркфлоу, гейти, образи, бекап, тестова
інфраструктура, доки. Вона не перетинається з жодною кодовою хвилею, тож іде паралельно з 191–193.
Головне тут:

- три системи, які звітують про успіх, якого не досягли: бекап «ok — 0 file(s)» на битому архіві,
  `unhealthy` на живих сервісах, Sentry staging як production;
- гейти, що пропускають те, для чого існують: env-check не читає `ci.yml`, docs-links не бачить
  код, fenced-стан інвертується непарним маркером.

Частина A2 — архітектура `store-api`, що зачіпає всі модулі одразу: конверт `{ data }` у 21
сервісі, барелі, шари, докблоки знесених систем і нетипізовані спеки. Її не можна пускати
паралельно з жодною API-хвилею, тому вона окремою сесією стоїть після всіх API-частин і **до**
плану 186. Новий модуль `home-block` одразу народиться за новою конвенцією.

## Кластери

| Кластер                       | Задачі                                 | Файли-центри                                                                                                                                                                                                                                                                                                       |
| ----------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **I1 CI і гейти**             | 494, 737, 747, 765, 766, 767, 768, 821 | `scripts/env-check.js` (+ читання `.github/workflows/**`), `.github/workflows/ci.yml` (build-args Sentry), `.github/dependabot.yml`, `security.yml` (gitleaks із піном і `.gitleaks.toml`, CodeQL `paths-ignore`, trivy `v`-тег), `scripts/check-docs-links.js` (fenced-стан, скан `apps/*/src/**` і `scripts/**`) |
| **I2 ops і образи**           | 526, 738, 739, 829                     | `docker-compose.prod.yml` (healthcheck з Dockerfile, не `wget`), `docker-compose.staging.yml` (`SENTRY_ENVIRONMENT`), `scripts/backup.sh` (перевірка tar), `apps/store-client/Dockerfile` + compose + `.env.production.example` (`NEXT_PUBLIC_FEATURE_STUBS`)                                                      |
| **I3 тестова інфраструктура** | 611, 612, 752, 753                     | `apps/store-api/jest.config*` (ізоляція двох флаків), `package.json` `db:migrate` (передача `--name`), `e2e/*.spec.ts` (`theme.spec` локатор, холодний логін)                                                                                                                                                      |
| **I4 доки**                   | 564, 328                               | `docs/admin-guide.md` (`/pages`), доки пасток `tsx`/`enableImplicitConversion`, `docs/seed-guide.md` + рішення TASK-328 (що пайплайн, що людина)                                                                                                                                                                   |
| **A2 архітектура API**        | 791, 806, 818, 820, 827                | `tsconfig.spec.json` + скрипт `typecheck:spec`, глобальний `TransformInterceptor` або запис у `AGENTS.md`, `*/index.ts` барелі, `user.repository.ts` ↔ `discount`, `order.service.ts` ↔ `cart`, докблоки `require-permission.decorator.ts`, `order-state-machine.ts`                                               |

I1 ∥ I2 ∥ I3 ∥ I4 в одній сесії. A2 — окрема сесія. Усередині A2: 791 перший, бо без типізованих
спек рефакторинг конверта не має страховки; далі 806 → 818 → 827 → 820.

## Приймання

- **494.** `env-check` падає, якщо змінна є в compose, але не в `build-args:` відповідної джоби
  (тест на фікстурі).
- **737, 739.** Збірка фронтів передає Sentry-змінні; staging має `SENTRY_ENVIRONMENT=staging`.
- **747, 765, 766, 767.** Коментар dependabot правдивий; gitleaks запінено, є `.gitleaks.toml`;
  CodeQL не аналізує тести й `scripts/qa`; trivy на `v`-тегу.
- **768, 821.** Непарний fenced-маркер не інвертує файл (тест); скан включає код, мертве посилання
  з коментаря `seo-settings-form.tsx` виправлено.
- **526, 738, 829.** Прапорець stubs проведено або явно виключено з реєстру з причиною. Битий архів
  → бекап exit ≠ 0 (відтворити стабом). `docker compose ps` на прод-compose показує `healthy`.
- **611, 612, 752, 753.** Повний `npm run test -w apps/store-api` зелений 3 рази поспіль.
  `npm run db:migrate -- --name x` передає ім'я. Playwright `theme.spec` і холодний логін зелені 3/3
  (це і є передумова TASK-755, який чекає білінгу).
- **564, 328.** Доки відповідають коду; рішення 328 записано в `docs/seed-guide.md`.
- **791.** `npm run typecheck` покриває спеки; знайдені помилки типів у спеках виправлені.
- **806.** Один спосіб будувати конверт, закріплений тестом або лінтом; `BrandListResponse` один.
- **818, 827, 820.** Барелі описують реальний контракт; модулі не ходять у чужі репозиторії;
  докблоки відповідають коду.

## Перевірка

Частина I: `node scripts/env-check.js --audit`, `node scripts/check-docs-links.js`,
`node scripts/audit-gate.js`, `npm run test -w apps/store-api` ×3, `npm run test:e2e:pw` ×3,
`docker compose -f docker-compose.prod.yml config` (Docker Desktop нестабільний — збірку образів
перевіряти на хості, памʼять `containerization-env-gotchas`). Частина A2: повний набір із плану 190.

Юніт-тести скриптів запускати глобом: `node --test "scripts/__tests__/*.test.js"`. Форма з
каталогом (`node --test scripts/__tests__/`) на Node ≥ 21 падає з `MODULE_NOT_FOUND` ще до тестів;
`ci.yml` (джоба env-drift) уже використовує глоб.

## Частина I — підсумок (2026-09-25)

Кожну задачу перевіряв окремий верифікатор (мутації, RED до фіксу, реальні прогони). Шість задач
пройшли з другого-третього кола: 737 (токен Sentry витікав через build record і job summary, не
лише через provenance), 494/821 (доки й охоплення відставали від коду), 612/564 (хибне твердження,
що `</dev/null` рятує від зависання `migrate dev`), 753 (другий механізм флаку).

**Результати**

- **494** — `env-check` читає `build-args:` кроків `ci.yml` п'ятим джерелом (c51ed774, 6639a3c2).
- **526** — `NEXT_PUBLIC_FEATURE_STUBS` явно виключено: виняток `@code` з причиною, перевірка 9
  ловить винятки, що нічого не гасять (91cb701f).
- **737** — фронти отримують частоту трасування й трійку source maps; токен не публікується
  (`provenance: mode=min`, `DOCKER_BUILD_RECORD_UPLOAD`/`DOCKER_BUILD_SUMMARY=false`, перевірка 3d)
  (2c01baf3, c7a76ccb).
- **747** — шапка dependabot правдива (f4c01ea0).
- **765** — gitleaks `v8.30.1`, підкоманда `git`, `.gitleaks.toml` з `targetRules` (834195f1).
- **766** — CodeQL `paths-ignore` для тестів, e2e, `scripts/load`, `scripts/qa` (d99d6083).
- **767** — trivy-action на `v0.36.0` (161daa73).
- **768** — fenced-блоки парує CommonMark-правилами (5d5152ca).
- **821** — docs-links сканує код `apps/*/src` і `scripts/` (ts/js/sh/ps1/css); мертве посилання
  виправлено (df6d97c5, 9aca0c29).
- **829** — client/admin на healthcheck образу, caddy на `127.0.0.1` (1e522944).
- **739** — staging-API жорстко `SENTRY_ENVIRONMENT=staging` (e2408d8d).
- **738** — нечитабельний архів uploads валить бекап; тест зі стабами (2a66f3de).
- **611** — обидва флаки store-api локалізовано й виправлено; 3/3 повні прогони (1be76091).
- **612** — `db:migrate` передає `--name` (7b6192df, d542a7ae).
- **752** — локатор `searchbox` у `theme.spec` (d5acf463).
- **753** — warm-up + гідратація + API без вотчера; холодний логін 3/3 (ecf83845, eed41181,
  3e5e8a9a).
- **564** — `/pages` у admin-guide відповідає коду; `docs/dev-traps.md` (e80134b9, 2a6e810a,
  bab6d804).
- **328** — частина C: рішення в `docs/seed-guide.md` §10 (6ebadb4e); A і B — TASK-1200/1201.

**Записані механізми флаків**

- **611, `scheduling.util.spec`.** Гонка годинника, не таймаут: у cron 3.5.0
  `getTimeout() = max(-1, sendAt() − DateTime.local())` читає час двічі; `sendAt()` округлює вгору
  до секунди, і якщо два читання розділяє межа секунди (~2.8 мс на холодному luxon, більше під
  навантаженням), виходить −1 і `CronJob.start()` викликає `stop()` — `running` лишається `false`.
  Лікування — `jest.useFakeTimers({ now: …:00.500Z })` у цьому describe.
- **611, `image-processor.service.spec`.** CPU-голодування, не асерт: 12MP-тест у спокої ~0.5 с,
  у звичайному паралельному прогоні 1–1.4 с, під 3× перепідпискою 3.1–9.6 с проти 5 с дефолту
  jest. Фікстура раз у `beforeAll`, заміряний `PHOTO_TIMEOUT_MS = 30 с`; бюджет 400 КБ і розмір
  фікстури не мінялись. `sharp.concurrency(1)` відкинуто — фікстура в 4.7 раза повільніша.
- **753, механізм 1.** Ціль редиректу після логіну (`/` адмінки з recharts) на холодному dev
  компілюється ~4.7 с, а `expect(...).not.toHaveURL(/login/)` чекає 5 с (1/3 холодних прогонів).
  Гіпотезу «клік до гідратації» спростовано трасою (URL без query, POST з React-обробника).
- **753, механізм 2.** `nest start --watch` зрідка ловить «File change detected» без зміни коду;
  Nest CLI убиває й перезапускає застосунок — :3001 темний ~12.5 с, логін у цьому вікні отримує
  connection refused (2/5 прогонів з перезапуском, 1/5 з падінням). e2e-API тепер `nest start`.
- **753, окремо.** 1/7 холодних прогонів store-admin кешує в `.next` падіння `next/font/google`
  (HTTP 500 до видалення `.next`) — warm-up падає швидко з підказкою; корінь — TASK-1211.

**Перевіряється лише після TASK-491 або на стенді**

- SYS-01 — усі 8 сервісів `healthy` після деплою (829).
- SYS-36 — gitleaks зелений у `git`-режимі в контейнері (`safe.directory`), trivy резолвить
  `v0.36.0`, Code scanning без алертів із тестових шляхів (765/766/767).
- SYS-40 — `environment=staging` у Sentry; source maps, трейси фронтів і відсутність токена в
  артефактах, summary й provenance (737/739).
- SYS-41 — нічний бекап на реальному томі uploads (738).
- Юніт-крок env-drift і docs-links у CI ще жодного разу не виконувались; запас 30 с для 12MP-спеки
  підтвердити на малому раннері; джоба Playwright у CI — разом із TASK-755.

**Нові рядки BACKLOG (сусідні знахідки, блок TASK-1200…1217)**

TASK-1200/1201 — частини A/B TASK-328; 1202 — `SENTRY_AUTH_TOKEN` як BuildKit secret; 1203 —
`04-secrets-ci.md` без нових входів Sentry; 1204 — опис `SENTRY_ENVIRONMENT` в `04a`; 1205 —
`demo-script.md` про stubs; 1206 — один `SENTRY_PROJECT` на два фронти; 1207 — межі парсера
`build-args`; 1208 — хвости gitleaks; 1209 — SHA-пін trivy-action; 1210 — форма входу адмінки
шле пароль GET-ом до гідратації; 1211 — `next/font/google` у `.next`; 1212 — `screens-190.spec`;
1213 — пастка `start:dev` у dev-traps; 1214 — застарілий коментар Playwright-джоби; 1215 — мертвий
`prisma.seed`; 1216 — `session-runbook.md` без `--name`; 1217 — lint-staged лишає до-Prettier
копію в індексі.

Уже відстежені й не продубльовані: гідратація `CategoryChips` (TASK-534), Playwright червоний до
TASK-750/751, ESLint не покриває кореневі скрипти (TASK-912 — той самий корінь для `e2e/` і
`playwright.config.ts`). Свідомо без рядка: healthcheck `store-api` на `localhost` (працює, бо Node
слухає `::`), подвійне читання архіву в `backup.sh`, `**/shared/test/**` поза `paths-ignore`
CodeQL, `backup.test.js` (його вже запускає глоб env-drift у `ci.yml`). Стан середовища на
2026-09-25: API Docker Desktop відповідає 500, хоча контейнери 5432/6379 працюють; спільна
`store_test` має 7 міграцій незмерженої гілки (ймовірно 192) — e2e ганяти на ізольованих БД.

## Ризики

- **Воркфлоу не виконуються** (білінг, TASK-491). Кожна правка `.github/**` перевіряється лише
  синтаксично (`actionlint`, якщо доступний) і читанням. Не стверджувати «CI зелений».
- **`guard-bash` блокує команди з підрядком `.env`.** Правки прикладів оточення — лише Write/Edit
  (памʼять `containerization-env-gotchas`).
- **A2 чіпає кожен модуль.** Конфлікти з будь-якою відкритою API-гілкою гарантовані — тому A2
  стартує лише коли жодної API-гілки немає.
