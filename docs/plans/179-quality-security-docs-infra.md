# План 179 — Якість: безпека, доки, моніторинг, пайплайн, ревʼю, повторний прогін

**Статус:** ⬜ · **Задачі:** TASK-452…457 · **Гілка:** `chore/452-quality` (наприкінці або
фоном) · **Джерело:** [тріаж 2026-08-27](../reviews/2026-08-27-demo-run-triage.md) §6 п.4–6, 18;
§5 «ревʼю якості»; §8 (повторний прогін).

## Навіщо

Власник запитав «як захищено від хакерів», «чи чисті доки», «чи достатньо докер-сервісів для
проду», «розбивати репо чи пайплайн», і попросив ревʼю коду на дублювання, діри й баги.
Дослідження 2026-09-10 відповіло на всі чотири; тут — що з цього робити. Плюс єдина QA-задача
на повторний прогін стендових чеків на staging.

## Інвентар захисту (з `file:line`, щоб не переперевіряти)

| Захист                              | Де                                                                                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Helmet + CSP (API)                  | `config/security.config.ts:24`, `main.ts:47`; вітрина **без CSP** (свідомо, `next.config.ts`)                                                   |
| CORS allowlist                      | `main.ts:69`                                                                                                                                    |
| CSRF double-submit                  | `main.ts:78-80`, `csrf/csrf.service.ts:69` — refresh, cart, wishlist; `__Host-csrf`                                                             |
| Cookies                             | `httpOnly`, `sameSite:'strict'`, secure — `auth.controller.ts:534…652`                                                                          |
| Rate-limit                          | `throttler/throttler.config.ts:21` (100/60 с глобально), ~25 `@Throttle`, Redis-store, `trust proxy` 1 хоп (TASK-386). **Fail-open** → TASK-401 |
| Argon2id                            | `common/security/password-hash.ts:27`                                                                                                           |
| JWT 15 хв / 7 д, ротація, tombstone | `auth.service.ts:98-99`, `refresh-token-cleanup.service.ts`                                                                                     |
| RBAC                                | `permission.guard.ts:90` відмовляє маршруту без декларації; `@OwnerOnly`                                                                        |
| Валідація                           | `main.ts:74` whitelist + forbidNonWhitelisted                                                                                                   |
| Санітайзер rich-text                | `common/sanitize/sanitize-rich-text.ts:16-71`                                                                                                   |
| SSRF хости зображень                | `apps/store-client/next.config.ts` bare hostnames, https only                                                                                   |
| Завантаження                        | MIME allowlist, 15 МБ multer, 5 МБ бізнес, sniff байтів, SVG-санітайзер, traversal-guard                                                        |
| Аудит-лог, редакція                 | `audit/`, `audit.sanitize.ts:32`; Pino redact `pino.config.ts:17`                                                                               |
| Анти-енумерація, lockout            | `auth.service.ts:429-437`, `:65,74` (5/15 хв на акаунт)                                                                                         |
| Swagger лише dev                    | `main.ts`                                                                                                                                       |
| CI                                  | `security.yml`: gitleaks (блокує), `npm audit` з гейтом `scripts/audit-gate.js`, Trivy (advisory)                                               |

## Задачі

### TASK-452 — Пас безпеки: CSP вітрини, honeypot, CodeQL, скан образів (M)

1. CSP для `store-client` через nonce-middleware (`next.config.ts` описує, чому відкладено; час
   настав — до запуску). Umami/Sentry origins у allowlist.
2. Контактна форма: honeypot-поле + cooldown на email (1/10 хв) на додачу до 5/хв IP
   (`contact.controller.ts:50`); те саме для реєстрації/відгуків за потреби.
3. `.github/workflows/security.yml`: `github/codeql-action` (JS/TS), `actions/dependency-review-action`
   на PR, Trivy `scan-type: image` по тегах GHCR (зараз сканує репо, не зібрані образи).
4. Тест на відсутність EXIF у завантаженнях (з TASK-439).
5. Скрипт для SF-AUTH-18/22: 20 запитів `forgot-password` існуючий/неіснуючий email — медіана
   часу відповіді в межах 20 %; результат у TASK-457.

### TASK-453 — Доки: биті посилання, CI-перевірка, оновлення після прогону (S–M)

- Виправити: `docs/handoff-2026-07-07.md:342` → `docs/deploy.md` не існує;
  `docs/backlog-archive.md:266` → `manual-qa-phase3.md` не існує, `:19,466,469,474` →
  `manual-qa-master.md` переїхав у `docs/archive/`; `docs/payments-liqpay.md:338` — `adapters/monopay/`
  не існує (позначити «план», не факт).
- CI-джоба `docs-links`: витягти шляхи `(scripts|apps|docs|packages|e2e)/…` з `docs/**/*.md`,
  падати на неіснуючих (~15 рядків Node).
- `docs/conventions/forms.md` — Rule 4: таймінг валідації (`mode`/`reValidateMode`, крок-як-submit),
  «валідуй нормалізоване значення, не маску» (з TASK-407).
- `docs/admin-guide.md`: розділ `/settings/search`; «коли робити групу, а коли окремий товар» у §5
  (15 рядків із прикладом); що означає «Оплачено» для післяплати (після B-1); де вмикати
  публічність промокоду; де міняти назву магазину (після TASK-433).
- `docs/presentation.md`, `docs/demo-script.md` — перечитати після хвиль 173–176.
- `docs/geo-audit-report.md` (2026-07-06) — переробити або в архів (з TASK-437).
- `docs/README.md` — додати цей тріаж і плани 173–179.

### TASK-454 — Мінімальний моніторинг для одного оператора (S)

Не Prometheus/Grafana (4 ГБ VPS). Зробити й задокументувати в `docs/deploy/06-day-to-day.md`:
UptimeRobot/BetterStack на `/`, `admin.`, `api./health` → Telegram; правила Sentry (new issue +
spike) з каналом, `SENTRY_TRACES_SAMPLE_RATE=0.05`; healthchecks.io dead-man на `backup.sh` і
крон диска; netdata-контейнер або графіки провайдера. `/health` віддає `degraded` для Redis
(з TASK-401).

### TASK-455 — Пайплайн замість розбиття монорепо (M)

Рішення: **не розбивати** (контракт OpenAPI→Orval ловиться в одному PR; вибіркова збірка
образів уже є `ci.yml:806`; команда з однієї людини). Зробити: `dorny/paths-filter` (docs-only PR
не збирає), кеш npm-workspaces/Turborepo, вивести `test-e2e-playwright` з `continue-on-error` після
стабілізації, `docs-links` (TASK-453) і CodeQL (TASK-452) у матрицю.

### TASK-456 — Ревʼю якості коду і доків (M, окрема сесія)

Запустити `code-reviewer` по модулях (`store-api`: order/cart/discount/auth/product; `store-admin`
і `store-client` по шарах FSD) із фокусом: дублювання (5 маперів помилок — уже TASK-402; 16
форматерів дат — TASK-421; 2 валідатори телефону — TASK-407), порушення Clean
Architecture/FSD, мертвий код, `@IsUUID(4)` та інші «міни даних». Результат —
`docs/reviews/2026-09-xx-code-review.md` за форматом
`2026-07-13-full-project-review.md` + рядки в BACKLOG. Розглянути `/code-review ultra`.

### TASK-457 — Повторний прогін стендових чеків на staging (QA)

Передумови: staging з `MAIL_ENABLED=true` (Mailpit або SMTP), `NP_API_KEY`, `GOOGLE_CLIENT_ID/SECRET`,
`INDEXNOW_KEY`, Umami, LiqPay sandbox; хвиля 173 задеплоєна. Перелік чеків — тріаж §8.
Скрипти для «не маю компетенції»:

```bash
H=https://<host>
# SEO: description/og/ld+json на PDP і категорії
curl -s $H/products/<slug> | grep -oE '<meta (name|property)="(description|og:[a-z:]+)"[^>]*>'
curl -s $H/products/<slug> | grep -o '"@type":"[A-Za-z]*"' | sort -u   # Product, Offer, Brand, BreadcrumbList
curl -s $H/ | grep -o '"@type":"[A-Za-z]*"' | sort -u                    # Organization, WebSite
curl -s "$H/products?brandId=X" | grep -Eo '<meta name="robots"[^>]*>|rel="canonical"[^>]*'  # noindex, без canonical
curl -s $H/merchant-feed.xml | grep -c '<item>'
curl -si $H/indexnow.txt | head -1                                       # 200 з ключем
# revalidate
curl -si -X POST $H/api/revalidate -H 'Content-Type: application/json' -d '{"paths":["/"]}' | head -1        # 401
curl -s  -X POST $H/api/revalidate -H 'Content-Type: application/json' -H "x-revalidate-secret: $REVALIDATE_SECRET" -d '{"tags":["seo-settings"]}'  # 200
# заборонений перехід статусу (AD-ORD-15) — очікуємо 409/400
curl -s -X PATCH $API/admin/orders/<id>/status -H "Authorization: Bearer $T" -d '{"status":"DELIVERED","expectedUpdatedAt":"..."}'
# throttler (SF-CNT-19): 6-й POST за хвилину → 429
for i in $(seq 1 6); do curl -s -o /dev/null -w "%{http_code}\n" -X POST $API/contact -H 'Content-Type: application/json' -d '{"name":"t","email":"t@t.ua","phone":"+380501234567","message":"x"}'; done
```

Результати — у `docs/reviews/2026-xx-xx-staging-run.md` за форматом журналу прогону; Launch
Gate-пункти, що не пройшли, — `[❌ …]` у `docs/manual-qa-pending.md`.

## Порядок

452 (1–3) і 453 — можна одразу; 454 — при налаштуванні staging; 455 — після стабілізації e2e;
456 — окрема сесія; 457 — після деплою хвилі 173 на staging.

---

# Хвіст ревʼю хвилі 173 — TASK-460…467, 491…496 (сесія S0, 2026-09-11)

Рядки цих задач указували на цей план, а план про них мовчав: їх додавали в BACKLOG
пізніше. Тут — кореневі причини й що зроблено, щоб не переперевіряти.

## ⚠️ Головне, що змінює приймання будь-якої хвилі: CI не виконується

**Акаунт GitHub заблоковано за білінгом.** Жоден джоб не стартував **із 2026-07-07** — звірено
`gh run view` по прогонах 07-07, 07-15, 07-18, 07-27, 08-25, 08-27: усі падають за 3–7 секунд з
анотацією `The job was not started because your account is locked due to a billing issue`.

Наслідок, який коштував найдорожче: **червоних джобів ніхто не бачив**. Тому в BACKLOG стояло
два, а насправді їх було **три** — про `Env Drift Gate` не знав ніхто. І тому «CI зелений після
пушу» зараз **непідтверджуваний**: приймання йде локальним прогоном еквівалентів (таблиця в
кінці). Заведено як TASK-491.

## Що було червоним

### TASK-460 — `test-int`: три причини, не одна

`cache.int-spec.ts` — єдиний int-спек, зібраний із реальних `imports:`, а не з ручного
`providers:`, як решта десяти; тому його єдиного зачепив 0718fc9.

1. **DI.** `RevalidationNotifier` живе в `@Global()` `PublishingModule` і потрібен **трьом**
   класам у графі спека. Виправлено локальним `@Global()`-модулем-заглушкою: провайдер у корені
   тестового модуля невидимий інжекторам `ProductModule`/`CategoryModule`, а імпорт справжнього
   `PublishingModule` потягнув би `PublishingScheduler` і живий крон.
2. **У CI не було Redis** — і перше пояснення було **хибним**. Здавалося, що без `REDIS_HOST`
   кеш іде в памʼять, але спек робить `process.env.REDIS_HOST ?? 'localhost'`, а `??` не ловить
   порожній рядок: CI брав Redis-гілку й говорив у порожнечу. Доведено вимірюванням: із
   `REDIS_HOST=''` (справжня in-memory) тест **зелений**, із мертвим портом падає рівно з
   `Received number of calls: 2`. Тому в джоб додано `redis:7-alpine`.
3. **Третій тест перевіряв порожнечу** — діставав клієнта як `cacheManager.store.client` (форма
   cache-manager v5), шлях резолвився в `undefined`, розриву не було, тест проходив вхолосту.

Спек тепер **жорстко вимагає** Redis: раніше без контейнера він давав три вхолосту зелені
тести — той самий клас дефекту, що й п. 3.

### TASK-461 — `contract-freshness` і обидва кроки експорту в деплої

Усі три кроки живуть у `ci.yml` (окремих `deploy-*.yml` не існує). Бракувало **різного**:
`contract-freshness` і `deploy-production` — трьох змінних, `deploy-staging` — **чотирьох**
(ще й `CORS_ORIGINS`). Коментар при цьому попереджав, що деплойні кроки не мають `CSRF_SECRET`,
хоча вони вже мали.

**Уточнення до BACKLOG:** 866834e зробив обовʼязковими лише `REVALIDATE_SECRET` і
`STOREFRONT_REVALIDATE_URL`; `STORE_CLIENT_URL` — раніше, у 1fdeecd (TASK-324). Джоб червоний
**довше**, ніж казала задача. Три блоки тепер побайтово однакові; перевірено парсером, а не
читанням: `env:` витягнуто прямо з `ci.yml` і ним прогнано експорт.

### TASK-495 — `Env Drift Gate` (не було в жодній задачі)

1. **Хибне спрацювання на прозі.** `scanCode()` читав і коментарі, тож фраза
   «literal `process.env.X`» у JSDoc `login-form.tsx` завела змінну на ім'я `X`. Тепер
   коментарі вибілюються; кінцевий `//` свідомо лишається, бо `//` буває в рядках
   (`"https://…"`) і обрізати такий рядок означало б сховати від гейта справжній код.
2. **`NEXT_PUBLIC_GOOGLE_AUTH_ENABLED` не доїжджав до збірки** — ні `ARG`/`ENV` у Dockerfile,
   ні build-арга в compose, ні (головне) рядка у списках `build-args:` у `ci.yml`, які й
   збирають задеплоєні образи. `next build` запікає `NEXT_PUBLIC_*`, тож кнопка «Увійти через
   Google» була прихована в **будь-якому** контейнерному розгортанні. Той самий клас дефекту,
   заради якого TASK-348 писав цю перевірку.

**Лишається дія оператора:** завести `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true` у Variables
середовищ `production` і `staging` — описано в `docs/deploy/04-secrets-ci.md`.

## Хвости ревʼю

### TASK-464 — fail-closed для newsletter

Обидва публічні POST мали `@Throttle(5/хв)` і не мали `@FailClosedThrottle()`. Аудит усіх
`@Throttle`: newsletter був **останнім** неавтентифікованим публічним записом, що падав
відкрито. Попутно виправлено два коментарі, що прогнили так само (повідомлення відмови старту
й докблок самого декоратора не згадували newsletter); повідомлення тепер називає **клас**
маршрутів, а не список. Суміжне й свідомо не зроблене — TASK-493.

### TASK-465 — юнікодна політика пароля в адмінці

Три побайтово однакові ASCII-копії проти юнікодного `\p{Ll}`/`\p{Lu}` на бекенді: `Пароль123`
сервер приймав, адмінка різала. Винесено в `shared/lib/password-policy.ts`, **без zod**
(адмінка не оголошує ні `zod`, ні `react-hook-form`). Деталь, яку легко втратити: регекси
бекенда **не містять** `{8,}`, тож предикат перевіряє довжину окремо — і на це є тест.

### TASK-467 — редактор мовчки видаляв розмітку

Рішення власника: **попередити й захистити**, не розширювати схему (TASK-492). Після засіву
вхідний HTML звіряється з `editor.getHTML()` **за наявністю тегів** — саме так, а не
порівнянням документів: Tiptap завжди переформатовує те, що пропускає, тож перевірка на
рівність спрацьовувала б на звичайному тексті, а хибний банер на кожному товарі гірший за сам
дефект. Перевірка виходу робить її самовиправною.

### TASK-466 — канонічний телефон + перший у репо бекфіл даними

`phoneDigits()` із рядка BACKLOG **не канонізує**: `+380 50 111 2233` → `380501112233`, а
`050 111 2233` → `0501112233`. Рішення власника — `normalizeUaPhone()`.

Трансформ нормалізує **лише вже телефоноподібне значення**, і цей guard — не перестраховка:
class-transformer працює **до** class-validator, тож без нього
`+380 50 123 45 67 call after 6pm` прийшло б валідатору як `380501234567` і пройшло, тоді як
сьогодні воно відхиляється. Тобто змінюється нормалізація, не валідація — рішення TASK-338 не
переглянуто.

Три шляхи запису, а не два: `update-profile.dto.ts` не мав ні трансформу, ні правила формату.
Пошуковий запит нормалізується теж, інакше дефект виживає на читанні — з порогом у 3 цифри, бо
`normalizeUaPhone('ivan')` = `''`, а `contains: ''` матчить усі рядки. Сід — частина фікса:
він пише через Prisma повз DTO, тож кожен `db:seed` повертав би старе написання.

**Не застосовано ніде наживо:** `store_dev` і прод усе ще потребують `prisma migrate deploy`.

### TASK-462 — `cart-flow.spec.ts` перевіряв світ до гість-чекауту

Логін-стіни немає взагалі: TASK-338 її видалив. Переписано під журнал гостя; блок «Контактні
дані» рендериться **тільки** для гостя, тож він і є доказом. Пастка: кожен тест отримує свій
контекст, тож кошик наповнюється **всередині** тесту.

### TASK-463 — флейк: три причини, остання руйнувала сесії по-справжньому

Спершу довелося ввімкнути логи: `NODE_ENV=test` тримає Pino на `silent` — саме тому попередні
спроби нічого не бачили. З `LOG_LEVEL=debug` перша причина стала очевидною:

```
0.0s 200   1.0s 200   8.2s 200   14.6s 200   31.7s 200
32.6s 429  45.3s 429  51.9s 429  64.4s 429  71.1s 429 …
103.1s 200   ← вікно 60 с прокотилось
```

`POST /api/auth/login` — 5/хв на IP, лічильник у памʼяті одного процесу, усі контексти з `::1`.
Чотири логіни на прогін уміщаються рівно раз; `reuseExistingServer` тримає лічильник між
прогонами. Замість послаблювати продове правило — свій `X-Forwarded-For` на тест (TEST-NET-2,
із домішкою pid воркера, щоб повторні прогони не накопичувались). Перевірено прямо: сім логінів
із семи адрес не дали жодного 429 там, де пʼять з однієї вичерпали ліміт.

Друга: у застосунку було **два шляхи refresh із двома окремими guard'ами** — `instance.ts`
дедуплював викликів інтерсептора, а бутстрап `AuthProvider` кликав згенеровану операцію повз
нього. На холодному завантаженні спрацьовують обидва. Тепер guard один, в обох застосунках.

Третя — справжня. Два одночасні refresh з одним кукі дали `500` і
`401 Token reuse detected — all sessions terminated`, а в сіяного адміна після прогону було
**321 токен, усі відкликані**. Payload refresh-JWT був `{sub, role, type}` плюс `iat`/`exp`, а
JWT штампує їх **у секундах** — два мінти в одну секунду давали побайтово однаковий токен, і
унікальний індекс кидав помилку. А оскільки `refreshToken()` відкликає пред'явлений токен
**до** мінту заміни, цей 500 лишав сесію без жодного живого токена; повтор клієнта пред'являв
уже відкликаний кукі, що не відрізнити від краденого, — і відкликались усі сесії. **Одна
колізія розлогінювала користувача скрізь.** Досяжно входом із двох пристроїв в одну секунду, і
системно — під навантаженням. Лікується `jti`.

Заміряно після кожної зміни, повні прогони поспіль: **3–4 падіння з 12 до → 15 із 15 зелених
після**.

Що **не** виправлено і варте окремої задачі (TASK-496): порядок у `refreshToken()` лишився —
спершу відкликання, потім мінт. Колізію, що робила це досяжним, закрито; форму — ні.

## Локальний прогін еквівалентів джобів CI

Поки білінг заблоковано (TASK-491), це єдине приймання, яке взагалі існує.

| Джоб CI                    | Локально                                                                     |
| -------------------------- | ---------------------------------------------------------------------------- |
| Type Check                 | `npm run typecheck`                                                          |
| Lint                       | `npm run lint`                                                               |
| Lockfile Platform          | `node scripts/check-lockfile-platforms.js`                                   |
| Env Drift Gate             | `node scripts/env-check.js --audit` — перевіряти **код виходу**, не текст    |
| Build                      | `npm run build` з `NEXT_PUBLIC_*` як у `ci.yml`                              |
| Unit Tests                 | `npm run test` (кожен воркспейс `--runInBand`)                               |
| Integration Tests          | `npm run test:int -w apps/store-api` + `DATABASE_URL_TEST`, `REDIS_HOST`     |
| E2E Tests                  | `npm run test:e2e -w apps/store-api -- --runInBand`                          |
| E2E (Playwright)           | `npm run test:e2e:pw` з явним `DATABASE_URL=…/store_test`                    |
| OpenAPI Contract Freshness | `npm run swagger:export` з prod-env + `git diff --exit-code -- swagger.json` |

Дві пастки, що коштували часу цій сесії:

- **`/health` живе поза префіксом `api`.** `curl /api/health` віддає 404, і цикл очікування
  «доки не підніметься» крутиться вічно.
- **`nest start --watch` тихо деградує.** Після правок у store-api сервер у watch-режимі
  перестав віддавати маршрути, і десять прогонів Playwright виміряли зламане середовище —
  мало не привівши до висновку, що фікс зробив гірше. Для вимірювань піднімати API **без**
  `--watch` і перевіряти `/health` перед прогоном.
