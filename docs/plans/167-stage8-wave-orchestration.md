# План 167 — Оркестрація хвилі Етапу 8

**Статус:** 🔄 виконується (Фаза 0 завершена 2026-07-28)
**Задачі:** координує TASK-330…348, 350, 351 + поглинуті 317/318
**Пов'язані плани:** [163](163-online-payments-liqpay.md) (оплата), [164](164-rbac-manager-user-mgmt.md) (RBAC), [166](166-guest-checkout.md) (гість), [068](068-nova-poshta-delivery.md) (НП)

---

## Навіщо саме така форма

Етап 8 — двадцять задач, і дев'ять із них потребують змін схеми, а сім чіпають
`order.service.ts`. Якби кожна гілка везла свою міграцію, ми б отримали дев'ять
конфліктів у `schema.prisma` і перегони за той самий файл. Тому хвиля розбита на
три фази, а не на «вісім гілок від develop».

```
Фаза 0 (на develop, послідовно)  ──►  Хвиля A: бекенд (4 worktrees)  ──►  інтеграція
                                                                              │
Фаза 3 (на develop)  ◄──  Хвиля B: фронтенд (4 worktrees)  ◄──  swagger+Orval ┘
```

Ключовий принцип: **усе спільне landing-иться до розгалуження.** Схема, seam-контракти,
env-змінні, пін інструментів — усе це на `develop` до того, як з'явиться перша гілка.

---

## Фаза 0 — фундамент ✅ (2026-07-28)

| #   | Що                                                                   | Комміт               |
| --- | -------------------------------------------------------------------- | -------------------- |
| 0.0 | `docs/payments-liqpay.md` — контракт оплати до коду                  | `700dcb0`            |
| 0.1 | TASK-351 — пін `prettier`                                            | `3b75192`, `3e022c1` |
| 0.2 | TASK-347 — базлайн `store_dev` (і `store_test`) під історію міграцій | `692d924`            |
| 0.3 | TASK-331 — знято муляж оплати/доставки з `/cart`                     | `a162b60`            |
| 0.4 | Одна міграція на всю хвилю (14 груп змін)                            | `c8aa321`            |
| 0.5 | Seam-контракти між гілками                                           | `24cd68a`            |
| 0.6 | 10 нових env-змінних у чотирьох джерелах                             | `73340ae`            |
| 0.7 | Плани 163/164/166/167 + TASK-352                                     | цей комміт           |

### Що з Фази 0 треба знати кожному агенту хвилі

- **Схема вже змінена.** Не пишіть міграцій. Усі таблиці й колонки Етапу 8 існують:
  `Payment`, `PaymentEvent`, `RolePermission`, `AuditLog`, `EmailVerificationToken`,
  `TotpBackupCode`, `Return`, `ReturnItem`, `DeliverySetting`; `Order.userId` уже
  nullable; `UserRole` уже має `MANAGER`. Якщо вам здається, що бракує колонки —
  спершу перечитайте `schema.prisma`, і лише потім заводьте міграцію.
- **Seam-контракти оголошено:** `payment.port.ts`, `payment.types.ts`,
  `permission.catalog.ts`, `require-permission.decorator.ts`,
  `OrderService.applyPaymentEvent` (стаб, що кидає `NotImplementedException`).
  Реалізуйте їх, не переоголошуйте.
- **Env-змінні зареєстровано** з `code: "either"` + `gap`. Коли ваш код почне
  читати змінну, **не чіпайте** `env-check.js` — тільки Фаза 3 переводить їх у
  `code: "used"` і знімає gap-и. Так гейт лишається зеленим на всіх гілках.
- **`prettier` запінено на 3.9.6.** Не бампайте.

---

## Хвиля A — бекенд, 4 паралельні worktrees

| Гілка                                      | Володіє файлами                                     | Задачі в порядку виконання                                                                                           |
| ------------------------------------------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **WT-A** `feature/332-order-state-machine` | `apps/store-api/src/order/**`                       | 332 машина станів → 338-back → 335-back → 336-back → 340-back → 341-back                                             |
| **WT-B** `feature/330-payments`            | `apps/store-api/src/payment/**` (усе нове)          | 330-A: LiqPay-адаптер + підпис із тест-вектором → webhook → ідемпотентність → refund → крон звірки й авто-скасування |
| **WT-C** `feature/334-rbac`                | `apps/store-api/src/auth/**`, `user/**`, `audit/**` | 333 → 334 → 318 → 342 → 344                                                                                          |
| **WT-D** `feature/337-delivery`            | `apps/store-api/src/delivery/**`                    | 337 + 080-E                                                                                                          |

### Точки стику, про які треба знати наперед

- **A ↔ B.** WT-B **ніколи** не пише в таблиці замовлень напряму — тільки через
  `OrderService.applyPaymentEvent`. WT-A наповнює цей метод, WT-B його викликає.
  Обидві сторони кодують проти `payment.types.ts`, який уже на `develop`.
- **C ↔ усі.** TASK-334 мігрує 43 місця `@UseGuards(AdminGuard)` по ~23 модулях,
  тобто **зачіпає файли, якими володіють інші гілки** (зокрема
  `admin-order.controller.ts` у WT-A). Це врахований конфлікт: C мерджиться **до**
  A, а A виступає адаптером і розв'язує колізії у своєму worktree.
- **D** ізольована — конфліктів не має.

### Порядок мерджу: D → B → C → A

A останній **навмисно**: він володіє найгарячішим файлом, тож усередині свого
worktree робить `git merge develop` і розв'язує всі колізії там, а не під час
інтеграції. Прийом перевірений Хвилею 5 (план 152).

---

## Інтеграція

```bash
npm run swagger:export -w apps/store-api && npm run generate:api
git add apps/store-api/swagger.json && git commit
npm run build && npm run typecheck && npm run lint
npm run test && npm run test:e2e -w apps/store-api -- --runInBand
npm run test:int -w apps/store-api
node scripts/env-check.js --audit && node scripts/check-lockfile-platforms.js
```

`swagger.json` **трекається** в git (TASK-325), Orval-вивід — ні. Джоба
`contract-freshness` впаде на протухлому спеку, тож експорт обов'язковий.

---

## Хвиля B — фронтенд, 4 паралельні worktrees (від оновленого develop)

| Гілка                                | Володіє                                                  | Задачі                              |
| ------------------------------------ | -------------------------------------------------------- | ----------------------------------- |
| **WT-E** `feature/330b-checkout-ui`  | `store-client` `features/checkout`, `widgets/checkout`   | 330-B + 338-front                   |
| **WT-F** `feature/333f-account`      | `store-client` `widgets/account`, `features/auth`        | 333-front + 342-front + 345         |
| **WT-G** `feature/330c-admin-orders` | `store-admin` `widgets/order-detail`, `features/order-*` | 330-C + 332-UI + 335/336/340/341-UI |
| **WT-H** `feature/334f-admin-users`  | `store-admin` `users`, `widgets/user-*`, `admin-shell`   | 334-UI + 317 + 318-UI + 344-UI      |

**Обов'язково у WT-H:** `auth.context.tsx` і `admin-shell-guard.tsx` сьогодні
відхиляють будь-який не-ADMIN токен — MANAGER не зайде в адмінку, доки це не
змінено. Права фронт бере з `GET /api/auth/me/permissions`, **не** з JWT.

---

## Механіка worktrees — перевірені граблі цього проєкту

- **Не використовувати `isolation: "worktree"`** — воно провізіонить гілку на
  сторонньому базовому коміті (27 файлів, без `apps/`). Тільки вручну:
  `git worktree add <dir> -b feature/NNN-name develop`.
- **Якщо відкрито VS Code на репозиторії** — worktree робити **поза** деревом репо:
  файловий watcher редактора блокує `node_modules` у вкладених worktree-ах, і
  `npm install` падає частковою розпаковкою.
- **У свіжому worktree:** `npm install` (не `ci`) + `npx prisma generate`.
  `.env*` gitignored → відсутні; `prisma.config.ts` резолвить `DATABASE_URL` на
  завантаженні конфігу, тож потрібні інлайн-болванки (JWT-секрети — **мінімум 32
  символи**, інакше env-валідація відхилить).
- **Гейти запускати СИНХРОННО, одним викликом.** Агент, що стартує прогін у фоні й
  зупиняється «чекати нотифікації», не отримає її ніколи — фонова дитина вмирає
  разом з агентом. Це ламало Хвилю 5 тричі.
- **Серійні прогони:** `test:e2e` і повні набори фронтів — під паралельними
  воркерами таймаутяться і дають хибне червоне. `--runInBand` — арбітр.
- **`prisma migrate dev` неінтерактивно не працює** (вимагає підтвердження). Якщо
  міграція таки потрібна: `migrate diff --from-config-datasource --to-schema` →
  файл у `prisma/migrations/<ts>_name/migration.sql` → `migrate deploy`.

## Протокол конфліктів

- `manual-qa-pending.md` — **тільки append-only**, блоками `### TASK-NNN` у кінець.
- `dictionary.ts` — свій неймспейс на гілку, нічого чужого не чіпати.
- `BACKLOG.md` — редагує **лише оркестратор**, після мерджу.
- `env-check.js` / `env.validation.ts` — **не чіпати** (див. Фазу 0.6).

---

## Фаза 3 — фінал

TASK-349 (`eslint-plugin-import` → `import-x`; тільки тут, бо чіпає
`packages/eslint-config`), TASK-346, TASK-348, TASK-350, переведення env-змінних у
`code: "used"`, оновлення BACKLOG / manual-qa / §10 звіту аудиту.
