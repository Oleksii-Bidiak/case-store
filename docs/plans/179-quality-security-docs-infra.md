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
