# План 149 — Оркестрація «Пізньої хвилі» (TASK-274/275/276/174/175)

> **Виконавець:** оркестратор-сесія (Opus) у корені репо, `develop`. Схвалено власником
> 2026-07-11. Скоуп: усі 5 ⬜ задач секції «Пізніша хвиля»; parked (TASK-168, TASK-080-E) і
> deferred-рядки (082/083/084/086/139/140) — НЕ чіпати.
>
> **Правила оркестратора:** `BACKLOG.md` редагує ТІЛЬКИ оркестратор (агенти — ніколи).
> Кожну фазу завершуй комітом на `develop`. Якщо план (Фаза 1) виявить блокер чи потребу
> власницького рішення — зупинись і спитай власника ПЕРЕД імплементацією.

## Фаза 1 — Планування (main tree, без worktrees)

1. Позначити всі 5 задач 🔄 у BACKLOG (Plan-колонка: 149 для 274/275/276; 150/151 — нижче).
2. Запустити два `task-planner`-агенти (кожен пише ТІЛЬКИ свій plan-файл, не BACKLOG):
   - TASK-174 → `docs/plans/150-addon-services.md` — add-on services / protection plans:
     каталог послуг + per-product applicability + cart/order persistence + admin CRUD.
     Cart UI stub вже існує — див. stub-аудит у плані 129 (рядок TASK-174).
   - TASK-175 → `docs/plans/151-loyalty-account.md` — points/cashback модель + accrual/redeem
     API + purchases feed + persisted notification prefs. Account UI stubs існують (план 129).
3. Прочитати обидва плани; блокери → до власника. Закомітити плани + BACKLOG на `develop`
   ДО створення worktrees (гілки мають успадкувати плани).

Дрібні 274/275/276 планів не потребують.

## Фаза 2 — Імплементація (5 паралельних worktrees)

| WT  | Task     | Гілка                           | Агент                                    | Область                                                                                                                                     |
| --- | -------- | ------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | TASK-274 | `fix/274-login-timing`          | tdd-agent (auth = критичний модуль)      | store-api: `AuthService.login()` — спалювати фіксовану argon2-роботу на no-user гілці, дзеркало TASK-273 (план 136, `requestPasswordReset`) |
| B   | TASK-275 | `fix/275-search-combobox-a11y`  | build                                    | store-client: header search — `id` на options + `aria-activedescendant` на input за APG combobox pattern                                    |
| C   | TASK-276 | `fix/276-admin-card-table-a11y` | build                                    | store-admin: card-mode таблиці `<md` — `role="group"` + `aria-label` з ключового поля рядка (sr-only cell labels вже є, план 140)           |
| D   | TASK-174 | `feature/174-addon-services`    | build (+tdd для cart/order money-логіки) | фул-стек за планом 150                                                                                                                      |
| E   | TASK-175 | `feature/175-loyalty-account`   | build (+tdd для accrual/redeem)          | фул-стек за планом 151                                                                                                                      |

**Worktrees створювати вручну, НЕ через `isolation:"worktree"`** (в агентній ізоляції worktree
провізиниться на stray-базі «first commit» без `apps/`):

```bash
git worktree add D:/projects/.wt-store-ai/wt-274 -b fix/274-login-timing develop
# ... аналогічно wt-275, wt-276, wt-174, wt-175
```

Каталог — **поза деревом репо** (`D:\projects\.wt-store-ai\wt-NNN`): відкритий VS Code ламає
`npm install` у worktrees всередині репо (file-watcher локає node_modules).

### Обовʼязковий чек-лист у промпті КОЖНОГО агента

1. `npm install` (не `npm ci` — lockfile-стан у worktree непридатний) у корені worktree,
   потім `npx prisma generate` з inline dummy `DATABASE_URL` (див. п.3).
2. Скопіювати згенеровані Orval-дерева з main tree — ВЕСЬ `shared/api/generated/**` gitignored,
   без нього фронтенд-typecheck червоний:
   `cp -rf D:/projects/store-ai/apps/store-client/src/shared/api/generated/. <wt>/apps/store-client/src/shared/api/generated/`
   (те саме для `store-admin`).
3. `.env*` gitignored → відсутні у worktree: `prisma generate` і `swagger:export` потребують
   inline dummy-env (`DATABASE_URL`, `NODE_ENV`, `JWT_SECRET`/`JWT_REFRESH_SECRET`;
   секрети ≥32 символи — мінімум env-валідації).
4. **НЕ запускати e2e / int / Playwright у worktree** — лише unit + lint + typecheck + build
   свого workspace. Повні гейти йдуть на develop після merge (Фаза 3).
5. **Гейти запускати СИНХРОННО:** один Bash-виклик (timeout до 600000), розпарсити результат у
   звіт. НІКОЛИ не `run_in_background` — фоновий прогін помирає разом з агентом, звіт
   лишається порожнім (сталося 3× у Wave 5).
6. Jest флейкає під паралельними воркерами на цій машині (таймаути 30–80s): червоний повний
   прогін підтверджувати `--runInBand` перед тим, як вважати його реальним.
7. Коміти конвенційні `type(scope): ...`. **BACKLOG.md не чіпати.** Спільні файли — тільки
   append-only: `docs/manual-qa-pending.md` — блок `### TASK-NNN` в кінці файлу; словники
   локалізації — власний namespace; нічого не переписувати поза своєю задачею.
8. Prisma-схему міняють лише D і E: нові моделі — append В КІНЕЦЬ `schema.prisma` (конфлікт
   між гілками стає тривіальним keep-both). Міграційні SQL gitignored — джерело правди
   `schema.prisma` (`db push`, не `migrate dev`).

Якщо агента зрізав session-limit — продовжити через `SendMessage` на його agentId, спершу
попросивши `git log/status`, щоб не переробляв уже закомічене.

## Фаза 3 — Інтеграція (оркестратор, main tree, `develop`)

Merge-порядок — від дрібних до великих; останній великий = «designated adapter»:

1. `git merge --no-ff fix/274-login-timing` → `fix/276-admin-card-table-a11y` →
   `fix/275-search-combobox-a11y` (різні apps — конфліктів не очікується).
2. `git merge --no-ff feature/174-addon-services`.
3. **TASK-175 = adapter:** перед фінальним merge зробити `git merge develop` УСЕРЕДИНІ wt-175
   (агент через SendMessage або оркестратор напряму), розвʼязати конфлікти
   schema.prisma/seed/словників ТАМ, повторно прогнати unit-гейти worktree; лише потім
   `git merge --no-ff feature/175-loyalty-account` у main tree.
4. **Один пост-merge regen на develop** (main tree має справжній `.env`, dummy-env не потрібні):
   `npm run swagger:export -w apps/store-api` → `npm run generate:api`.
   Згенероване gitignored — `git status` лишиться чистим, файли просто мають існувати на диску.
   `npx prisma db push` на dev-БД **і** на `store_test` (Playwright ходить у store_test —
   без явного `DATABASE_URL` сід і API дивляться в різні БД).
5. Повні гейти на develop:
   - `npm run typecheck`, `npm run lint`, `npm run build` (всі workspaces);
   - store-api: unit; e2e `--runInBand` (паралельні supertest-воркери масово флейкають);
     `test:int` серійно (int реально ходить у store_test);
   - store-client: тести `--runInBand` (важкі MSW-сюїти таймаутяться паралельно); store-admin: тести;
   - Playwright з явним `DATABASE_URL` на store_test — 174/175 зачіпають cart/account-флоу.
6. BACKLOG: ✅ по кожній задачі (одним комітом `docs(backlog): ...`); manual-only перевірки →
   append-блоки `### TASK-NNN` у `docs/manual-qa-pending.md`.
7. Cleanup: `git worktree remove <dir>` (може лишити каталог — нормально) + `git worktree prune`;
   фізичні каталоги видалити пізніше, коли Windows відпустить локи.

## Фаза 4 — Верифікація («успішно виконано» =)

- Усі гейти п.5 Фази 3 зелені на `develop`.
- Живий смоук 174/175 на запущеному стеку: add-on додається в кошик і переживає створення
  замовлення; бали нараховуються/списуються на тестовому замовленні; notification prefs
  переживають relogin. Що вимагає ручної перевірки — у manual-qa-pending.
- TASK-274: тест підтверджує близьку латентність `login()` для існуючого vs неіснуючого email
  (патерн TASK-273); TASK-275/276 — RTL-перевірки ARIA-атрибутів.

## Рішення власника 2026-07-11 (після Фази 1)

- **TASK-175 → 🅿️ parked.** Worktree E скасовано; план 151 лишається як довідка на майбутнє.
  Хвиля = 4 worktrees (274/275/276/174).
- **TASK-174 — розширена модель застосовності** (одна задача, план 150 переписано):
  темплейти на категорії з живим наслідуванням, nearest-ancestor-wins по дереву підкатегорій,
  дельти на товарі (ADD-ексклюзив / REMOVE / OVERRIDE) — семантика прототипів JS.
  Standalone-покупка add-on — поза скоупом.
- **Знижки не діють на add-on** — окрема нездешевлювана лінія, як доставка (база знижки =
  subtotal товарів, `order.repository.ts:120-137`). Ідея на майбутнє → 🅿️ TASK-286.

## Довідка

- Наступний вільний task ID — **TASK-287**; наступний вільний план — **152**.
- Повʼязані плани: 129 (stub-аудит зі стабами 174/175), 136 (TASK-273 — патерн timing-hardening),
  140 (admin mobile tables — контекст 276).
