# Ранбук сесій, цикл 2: плани 189–198 і черга 184–188

> **Для кого:** власник, який запускає сесії Claude Code одну за одною. Кожен промпт нижче
> самодостатній і копіюється цілим блоком у нову сесію; у промптах немає кутових дужок для заміни.
>
> **Стан, з якого цикл стартує** (звірено 2026-09-23): develop на `cdf97bf9`, демо-стенд на
> `b63c3570`. У BACKLOG 376 відкритих рядків, розкладку див. в
> [інвентарі циклу 2](reviews/2026-09-23-cycle-2-inventory.md). Next ID — TASK-858.
>
> **Джерела:** плани [189](plans/189-design-track-cycle-2.md)…[198](plans/198-admin-by-mockups.md) і
> [184](plans/184-delivery-methods.md)…[188](plans/188-analytics.md) (розділи «Кластери (цикл 2)»);
> перепровірка — [`qa-recheck.md`](qa-recheck.md). Попередній цикл —
> [session-runbook.md](session-runbook.md).

## Перед кожною сесією

1. Claude Code з кореня `D:\projects\store-ai`, гілка `develop`, `git pull`. Worktree сесія створює
   сама (слово «worktree» у промпті вмикає інструмент; `worktree.baseRef=head` у налаштуваннях,
   інакше гілка пішла б від застарілого `main`).
2. Модель Opus для виконання й мержу. Брейншторми — будь-яка.
3. Паралельні сесії — окремі вікна з того самого кореня.
4. Слово **ultracode** у промпті вмикає багатоагентний режим; без нього сесія працює звичайно.

Локального стенда немає: `[🔁]` у `qa-recheck.md` означає «змержено», перевіряється лише після
D; таблиця «Деплої» каже, який коміт на стенді.

Два уроки з обриву сесій 2026-09-11. (1) Агенти ultracode комітять у гілку worktree одразу після
своєї задачі; злиття не відкладати на кінець, інакше обрив сесії лишає десятки незакомічених
файлів. (2) Транскрипт сесії, що ввійшла у worktree, зберігається під каталогом worktree: щоб
продовжити її, запускайте `claude --resume` саме з `.claude/worktrees/<name>`. Нова сесія у
наявному worktree — «Увійди у вже створений worktree за шляхом …» (EnterWorktree з path).

## Порядок

Z0 → B-11 → S190 ∥ Д-а ∥ Д-д → M190 → D → Д-б → S191 ∥ S192 ∥ S193 ∥ S194 ∥ Д-в ∥ Д-е1…е4 →
M191, M192, M193, M194 → D → S195 ∥ S196 ∥ S184A ∥ S185A ∥ S188A ∥ Д-ж1 → M195, M196, M184A, M185A,
M188A → D → Д-ж2 → Д-ж3 ∥ S187A ∥ S197 → S198 ∥ Д-г ∥ Д-н1 → Д-н2 → M187A, M197, M198 → S194-A2 →
M194-A2 → S7′ → M217 → S184U ∥ S185U ∥ S188U → M184U, M185U, M188U → S187U → M187U → S186 → M186 →
D → перепровірка → Z.

**Канвас-сесії з власником ідуть одна за одною:** Д-в (частина в2) → Д-ж2 → Д-ж3 → Д-г → Д-н1 →
Д-н2. Знак ∥ поруч із ними означає, що поки власник у канвасі, кодові хвилі йдуть паралельно, а не
що дві канвас-сесії відкриті одночасно.

Чому такий порядок:

- **Червоне першим.** S190 — як S0 минулого циклу: CI червоний на develop, дірки безпеки, гроші.
- **Дизайн-трек перший серед фронтових.** Правило власника: спершу синхронізувати й доопрацювати
  наявні макети так, щоб реалізована верстка не деградувала, і лише потім нові макети й нові
  екрани. Тому вигляд вітрини (S197) іде після Д-в, адмінки (S198) — після Д-ж, а UI-частини
  184–188 (нові екрани) — після Д-н і мержу 197/198.
- **API-частини 184/185/187/188 ідуть рано.** Вони зворотно сумісні й не чекають макетів.
- **186 іде цілком і останнім.** Міграція зносить `Carousel.placement`, на якому стоять чинні
  форма каруселі й головна. TASK-667 переписує ті самі edit-сторінки, що й 198.
- **S194-A2 (архітектура API) — після всіх API-гілок.** Вона чіпає кожен модуль.
- **B-11 перед S190.** Там рішення для TASK-493 (fail-closed скидання пароля), а 192 і 193
  реалізують решту рішень.

Деплой D — після кожного великого блоку мержів, щоб перепровірка не накопичувалась до кінця.
Власник проходить `[🔁]` після кожного D, не чекаючи наступного.

## Сесії поза хвилями

### Z0 — звірка застарілих рядків (лише доки)

```
Увійди в plan mode. Прочитай у docs/reviews/2026-09-23-cycle-2-inventory.md розділ «Лише звірка (сесія Z0)» і рядки BACKLOG.md для TASK-397, 400, 402, 405, 407, 413, 415, 419, 421, 428, 459, 615, 659, 704, а також docs/qa-recheck.md Додаток А. Для кожного рядка перевір по коду в develop, чи весь обсяг рядка зроблено, і по Додатку А, які чеки ще не ✅. Склади таблицю: рядок · зроблено в коді (так/ні, де) · чеки · що робимо (✅ / лишити ⬜ з приміткою «код у develop, чекає тестера» / відрізати незроблене в новий рядок з наступного вільного ID). Для TASK-615 — запит до store_dev: чи мають люди з returns:* права в UserPermission і чи є returns:* у шаблонах. Для TASK-659 — звір TASK-427 і TASK-403 так само. Для TASK-704 — не пересівай базу, лише запиши в рядку команду й наслідок (передача власності блокує db:seed, див. docs/seed-guide.md). Покажи таблицю, чекай схвалення.

Після схвалення: онови BACKLOG.md (✅ ставиш лише там, де код зроблено і немає незакритих чеків; правило «✅ = чеки пройдені» не порушувати), нові рядки — з наступного вільного ID, онови next ID в обох місцях BACKLOG. node scripts/check-docs-links.js, коміт docs у develop: docs(backlog): reconcile stale rows before cycle 2. Коду не чіпай.
```

### B-11 — рішення власника, що блокують рядки

```
Використай скіл superpowers:brainstorming. Тема: п'ять рядків BACKLOG, які чекають мого рішення, плюс одне рішення для TASK-493. Прочитай ці рядки повністю: TASK-352 (політика неоплачених онлайн-замовлень, гібрид 30 хв від 2026-07-28 — підтвердити або змінити), TASK-731 («приватний» промокод — зараз кожен активний код публікується на «Акції»), TASK-839 (правила глузду для дерева категорій — AD-CAT-08), TASK-701 (виведені з опису значення charger-output — лишити з позначкою чи прибрати), TASK-620 (чи лишається PaymentStatus.REFUNDED термінальним), TASK-493 (fail-closed для auth/password-reset/confirm і auth/email/verify/confirm: безпека проти доступності при збої Redis). Для кожного спершу коротко перекажи «що є» і перевір у коді, що воно досі так. Питання став мені по одному, з варіантами і твоєю рекомендацією; не переходь далі без моєї відповіді. Наприкінці запиши рішення в docs/plans/178-brainstorms.md під заголовком «Рішення (B-11)» із сьогоднішньою датою; у кожному з шести рядків BACKLOG допиши рішення одним реченням і куди йде реалізація (493 → план 190, 352/620/731 → план 192, 701 → план 193, 839 → план 185 частина A). Рядок TASK-856 постав ✅. Закоміть docs у develop. Коду не чіпай.
```

### D — деплой на демо

```
Задеплой поточний develop на демо-стенд за docs/deploy/03b-test-deploy-no-domain.md, розділ «Перезалив на вже сіджений сервер». Спершу переконайся, що develop запушений: git log origin/develop..develop має бути порожній, інакше спершу git push. SSH до стенда в тебе немає: команди на сервері виконую я, ти даєш їх по одній і перевіряєш результат ззовні curl-ом — заголовки Content-Security-Policy і X-Robots-Tag на вітрині, GET /api/health (uptime показує час старту контейнера, ним визначай, що реально на стенді). Якщо з часу попереднього деплою змержено хвилю 193 — нагадай мені про повну переіндексацію Meilisearch і дай команду. Після успішного перезаливу допиши рядок у таблицю «Деплої» в шапці docs/qa-recheck.md: дата, коміт develop, які хвилі й задачі увійшли з часу попереднього деплою. Закоміть docs у develop. У звіті: список чеків із [🔁], які тепер можна проходити, згруповані за зонами.
```

Після D власник проходить `[🔁]` у `qa-recheck.md`.

### Z — закриття задач після перепровірки

```
Прочитай docs/qa-recheck.md і docs/reviews/2026-09-23-cycle-2-inventory.md (розділ «Батьки, що закриваються дочірньою задачею»). Для кожної задачі з Додатку А, у якої всі чеки [✅], постав ✅ у BACKLOG.md; батька закривай разом із дочірньою. Для чеків із [❌ …] створи рядки в BACKLOG з наступного вільного ID у секції «Перепровірка після деплою» з датою деплою і перенеси текст «що бачив» у docs/reviews/2026-08-27-demo-run.md як нові 🐞 у розділ перепровірки з тією ж датою. Перед комітом пошукай у [❌ …] адреси стенда (nip.io, IP) і заміни їх на «стенд» — репозиторій публічний. Закоміть docs у develop і онови памʼять проєкту: що закрито, next ID, що відкрито.
```

## Хвиля 190 — червоне: CI, безпека, гроші

### S190

```
Створи worktree fix-770-red-wave і працюй у ньому. Перед першою збіркою виконай у worktree: npm install, npm run db:generate, npm run generate:api.

Увійди в plan mode. Прочитай docs/plans/190-red-wave-ci-security-money.md, docs/reviews/2026-09-code-review.md (шість CRITICAL) і в docs/plans/178-brainstorms.md рішення B-11 щодо TASK-493. Склади план сесії за розділом «Кластери» плану: R-API, R-вітрина, R-адмінка; для кожного кластера випиши файли й перевір, що кластери не перетинаються. Порядок усередині — за планом: 775 → 770 → 772 → 771 → 774 → 773 разом із 794 → решта; TASK-527 лише після TASK-770. Для TASK-772 спершу порахуй колізії регістру email у store_dev і покажи мені число до будь-якої міграції. Покажи план, чекай схвалення.

Після схвалення: ultracode, агент на кластер, верифікатор на задачу за розділом «Приймання» плану. Правила: кожен агент комітить у гілку worktree одразу після своєї задачі, злиття не відкладати на кінець; сусідні знахідки лише рядками в BACKLOG з наступного вільного ID; jest --runInBand; e2e store-api серійно; міграції через npx prisma migrate diff --script (migrate dev тут неінтерактивний), бекфіли з підрахунком рядків до й після; TASK-735 з Playwright-скриншотами до й після ключових екранів обох застосунків. Закриваючи задачу — [🔁] на її чеках у docs/qa-recheck.md і id задачі в Додатку А; нові чеки з плану — з id, вільними в docs/qa-manual-full.md. Наприкінці повні тести: npm run typecheck, npm run lint, npm run test -w apps/store-api -- --runInBand, npm run test:int -w apps/store-api, npm run test:e2e -w apps/store-api -- --runInBand, npm run test -w apps/store-client -- --runInBand, npm run test -w apps/store-admin -- --runInBand, npm run test:e2e:pw, node scripts/env-check.js --audit, node scripts/audit-gate.js. Звіт: що зроблено, що лишилось, висновок для TASK-732 після TASK-775. Із worktree не виходь.
```

### M190

```
Увійди у вже створений worktree за шляхом .claude/worktrees/fix-770-red-wave (EnterWorktree з path). Увійди в plan mode. Прочитай docs/plans/190-red-wave-ci-security-money.md і git log develop..HEAD. Переконайся, що незакомічених змін немає — інакше зупинись і скажи мені. Запусти /review на diff гілки проти develop з фокусом: міграція нормалізації email без мовчазного злиття акаунтів, машина станів оплати й часткового рефанду, fail-closed на публічних токен-ендпоінтах, санітайзер редиректу в обох застосунках однаковий, @layer base не зламав вигляд рамок. Кожну знахідку класифікуй: виправити зараз (лише якщо це дефект цієї ж хвилі) або рядок у BACKLOG з наступного вільного ID. Покажи список і чекай схвалення.

Після схвалення: виправ погоджене в worktree і закоміть; зроби git merge develop у гілку і виріши конфлікти (у dictionary.ts і BACKLOG.md зберігай рядки обох сторін, next ID бери більший); прожени npm run typecheck && npm run lint && npm run test -- --runInBand, npm run test:int -w apps/store-api і e2e store-api серійно. Потім вийди з worktree (ExitWorktree keep) і вже в корені: git merge --no-ff worktree-fix-770-red-wave у develop, повтори npm run test -- --runInBand на develop, після зелених тестів git worktree remove .claude/worktrees/fix-770-red-wave і git branch -d worktree-fix-770-red-wave. Звіт: що змержено, які чеки в docs/qa-recheck.md тепер [🔁]. На демо не заливай.
```

## Хвиля 191 — онбординг замовника по адмінці

### S191

```
Створи worktree feature-715-admin-onboarding і працюй у ньому. Перед першою збіркою виконай у worktree: npm install, npm run db:generate, npm run generate:api.

Увійди в plan mode. Прочитай docs/plans/191-admin-customer-onboarding.md, docs/admin-guide.md, docs/admin-tour.md і секцію «Онбординг замовника по адмінці» в BACKLOG.md. Склади план сесії за кластерами O1 (права й картка замовлення), O2 (тексти і словник), O3 (дрібні функції), O4 (доки, TASK-857 — наприкінці); для кожного кластера випиши файли й перевір, що кластери не перетинаються; для TASK-721 перевір сутність SiteContact і запропонуй шлях. Покажи план, чекай схвалення.

Після схвалення: ultracode, агент на кластер O1–O3, верифікатор на задачу за розділом «Приймання», O4 — окремим агентом після злиття O1–O3. Правила: кожен агент комітить у гілку worktree одразу після своєї задачі; кнопки без права не рендеряться (не вимикаються); сусідні знахідки лише в BACKLOG з наступного вільного ID; jest --runInBand; нові ключі словника — у кінець відповідних блоків apps/store-admin/src/shared/config/dictionary.ts, бо паралельно йдуть хвилі 192–194. Закриваючи задачу — [🔁] на її чеках у docs/qa-recheck.md (AD-ORD-34, AD-ORD-35, SF-CAT-32 та нові AD-чеки з id, вільними в docs/qa-manual-full.md) і id задачі в Додатку А. Наприкінці повні тести: npm run typecheck, npm run lint, npm run test -w apps/store-admin -- --runInBand, npm run test:e2e:pw -- --project=admin, node scripts/check-docs-links.js; звіт. Із worktree не виходь.
```

### M191

```
Увійди у вже створений worktree за шляхом .claude/worktrees/feature-715-admin-onboarding (EnterWorktree з path). Увійди в plan mode. Прочитай docs/plans/191-admin-customer-onboarding.md і git log develop..HEAD. Переконайся, що незакомічених змін немає — інакше зупинись і скажи мені. Запусти /review на diff гілки проти develop з фокусом: кожна мутація в UI гейтиться тим самим правом, що й на сервері; жодна дія не зникла для власника; жоден ключ словника не втрачено; доки відповідають коду. Кожну знахідку класифікуй: виправити зараз (лише дефект цієї ж хвилі) або рядок у BACKLOG з наступного вільного ID. Покажи список і чекай схвалення.

Після схвалення: виправ погоджене в worktree і закоміть; зроби git merge develop у гілку і виріши конфлікти (у dictionary.ts і BACKLOG.md зберігай рядки обох сторін, next ID бери більший); прожени npm run typecheck && npm run lint && npm run test -w apps/store-admin -- --runInBand і npm run test:e2e:pw -- --project=admin. Потім вийди з worktree (ExitWorktree keep) і вже в корені: git merge --no-ff worktree-feature-715-admin-onboarding у develop, повтори npm run test -w apps/store-admin -- --runInBand на develop, після зелених тестів git worktree remove .claude/worktrees/feature-715-admin-onboarding і git branch -d worktree-feature-715-admin-onboarding. Звіт: що змержено, які чеки в docs/qa-recheck.md тепер [🔁]. На демо не заливай.
```

## Хвиля 192 — API: замовлення, кошик, гроші, auth, відгуки, права

### S192

```
Створи worktree fix-771-api-orders-money і працюй у ньому. Перед першою збіркою виконай у worktree: npm install, npm run db:generate, npm run generate:api.

Увійди в plan mode. Прочитай docs/plans/192-api-orders-money-auth.md і в docs/plans/178-brainstorms.md розділ «Рішення (B-11)» (TASK-352, 620, 731). Склади план сесії за кластерами A1 кошик, A2 замовлення й гроші, A3 auth і конфіг, A4 відгуки й права, A5 тести: A1 ∥ A2 ∥ A3, A4 після A3 (обидва чіпають user.service.ts), A5 після A1 і A2; для кожного кластера випиши файли й перевір відсутність перетинів. Кошик і знижки — критичні модулі: A1 і A2 роби агентом tdd-agent (Red → Green → Refactor). Покажи план, чекай схвалення.

Після схвалення: ultracode, агент на кластер, верифікатор на задачу за розділом «Приймання». Правила: кожен агент комітить у гілку worktree одразу після своєї задачі; сусідні знахідки лише в BACKLOG з наступного вільного ID; jest --runInBand; e2e серійно; міграції через npx prisma migrate diff --script, бекфіли з підрахунком рядків до й після; після зміни AdminReviewEntity і AuthTokens — npm run generate:api і тести обох фронтів. Закриваючи задачу — [🔁] на її чеках у docs/qa-recheck.md і id задачі в Додатку А. Наприкінці повні тести: npm run typecheck, npm run lint, npm run test -w apps/store-api -- --runInBand, npm run test:int -w apps/store-api, npm run test:e2e -w apps/store-api -- --runInBand, npm run test -w apps/store-admin -- --runInBand, npm run test -w apps/store-client -- --runInBand; звіт. Із worktree не виходь.
```

### M192

```
Увійди у вже створений worktree за шляхом .claude/worktrees/fix-771-api-orders-money (EnterWorktree з path). Увійди в plan mode. Прочитай docs/plans/192-api-orders-money-auth.md і git log develop..HEAD. Переконайся, що незакомічених змін немає — інакше зупинись і скажи мені. Запусти /review на diff гілки проти develop з фокусом: атомарність операцій кошика й замовлення, міграція hiddenReason без втрати рішень модератора, глобальний Prisma-фільтр не ламає коди відповідей, контракт AuthTokens і нова зміна email, бекфіли прав по UserPermission. Кожну знахідку класифікуй: виправити зараз (лише дефект цієї ж хвилі) або рядок у BACKLOG з наступного вільного ID. Покажи список і чекай схвалення.

Після схвалення: виправ погоджене в worktree і закоміть; зроби git merge develop у гілку і виріши конфлікти (у BACKLOG.md зберігай рядки обох сторін, next ID бери більший); прожени npm run typecheck && npm run lint && npm run test -- --runInBand, npm run test:int -w apps/store-api і e2e store-api серійно. Потім вийди з worktree (ExitWorktree keep) і вже в корені: git merge --no-ff worktree-fix-771-api-orders-money у develop, повтори npm run test -- --runInBand на develop, після зелених тестів git worktree remove .claude/worktrees/fix-771-api-orders-money і git branch -d worktree-fix-771-api-orders-money. Звіт: що змержено, які чеки в docs/qa-recheck.md тепер [🔁]. На демо не заливай.
```

## Хвиля 193 — API: каталог, пошук, санітайзер, сід

### S193

```
Створи worktree fix-781-api-catalogue-search і працюй у ньому. Перед першою збіркою виконай у worktree: npm install, npm run db:generate, npm run generate:api.

Увійди в plan mode. Прочитай docs/plans/193-api-catalogue-search-content.md і в docs/plans/178-brainstorms.md рішення B-11 щодо TASK-701. Склади план сесії за кластерами C1 товари і пошук, C2 фасети й сумісність, C3 санітайзер і сторінки, C4 сід (C4 лише викликає sanitizeRichText, не змінює його); для кожного кластера випиши файли й перевір відсутність перетинів; для C1 випиши всі публічні читання товару, на які ляже спільний предикат видимості. Покажи план, чекай схвалення.

Після схвалення: ultracode, агент на кластер, верифікатор на задачу за розділом «Приймання». Правила: кожен агент комітить у гілку worktree одразу після своєї задачі; сусідні знахідки лише в BACKLOG з наступного вільного ID; jest --runInBand; e2e серійно; міграції через npx prisma migrate diff --script з підрахунком рядків (особливо TASK-733); зміну searchableAttributes записати в звіт як крок деплою (переіндексація). Закриваючи задачу — [🔁] на її чеках у docs/qa-recheck.md і id задачі в Додатку А. Наприкінці повні тести: npm run typecheck, npm run lint, npm run test -w apps/store-api -- --runInBand, npm run test:int -w apps/store-api, npm run test:e2e -w apps/store-api -- --runInBand, двічі поспіль npm run db:seed на чистій store_test, npm run generate:api і npm run test -w apps/store-client -- --runInBand; звіт. Із worktree не виходь.
```

### M193

```
Увійди у вже створений worktree за шляхом .claude/worktrees/fix-781-api-catalogue-search (EnterWorktree з path). Увійди в plan mode. Прочитай docs/plans/193-api-catalogue-search-content.md і git log develop..HEAD. Переконайся, що незакомічених змін немає — інакше зупинись і скажи мені. Запусти /review на diff гілки проти develop з фокусом: предикат видимості на кожному публічному читанні товару, санітайзер узгоджений із CSP вітрини, міграція kind і унікальності slug сторінок, ідемпотентність сіду, кеш фасетів не віддає чужі лічильники. Кожну знахідку класифікуй: виправити зараз (лише дефект цієї ж хвилі) або рядок у BACKLOG з наступного вільного ID. Покажи список і чекай схвалення.

Після схвалення: виправ погоджене в worktree і закоміть; зроби git merge develop у гілку і виріши конфлікти (у BACKLOG.md зберігай рядки обох сторін, next ID бери більший); прожени npm run typecheck && npm run lint && npm run test -- --runInBand, npm run test:int -w apps/store-api і e2e store-api серійно. Потім вийди з worktree (ExitWorktree keep) і вже в корені: git merge --no-ff worktree-fix-781-api-catalogue-search у develop, повтори npm run test -- --runInBand на develop, після зелених тестів git worktree remove .claude/worktrees/fix-781-api-catalogue-search і git branch -d worktree-fix-781-api-catalogue-search. Звіт: що змержено, які чеки в docs/qa-recheck.md тепер [🔁], чи потрібна переіндексація на стенді. На демо не заливай.
```

## Хвиля 194 — CI, ops, доки (частина I) і архітектура API (A2)

### S194

```
Створи worktree chore-494-ci-ops-docs і працюй у ньому. Перед першою збіркою виконай у worktree: npm install, npm run db:generate, npm run generate:api.

Увійди в plan mode. Прочитай docs/plans/194-ci-ops-docs-architecture.md (частина I — кластери I1–I4; A2 у цій сесії НЕ роби) і памʼять проєкту containerization-env-gotchas та github-actions-billing-lock. Склади план сесії за кластерами I1 CI і гейти, I2 ops і образи, I3 тестова інфраструктура, I4 доки; для кожного кластера випиши файли й перевір відсутність перетинів. Пам'ятай: guard-bash блокує будь-яку bash-команду з підрядком .env — приклади оточення правити лише Write/Edit; воркфлоу не виконуються (білінг), тож «CI зелений» не стверджувати. Покажи план, чекай схвалення.

Після схвалення: ultracode, агент на кластер, верифікатор на задачу за розділом «Приймання». Правила: кожен агент комітить у гілку worktree одразу після своєї задачі; сусідні знахідки лише в BACKLOG з наступного вільного ID; флаки TASK-611/753 спершу відтворити повним прогоном і записати механізм, лише потім правити. Закриваючи задачу — [🔁] на її чеках у docs/qa-recheck.md і id задачі в Додатку А. Наприкінці: node scripts/env-check.js --audit, node scripts/check-docs-links.js, node scripts/audit-gate.js, npm run test -w apps/store-api три рази поспіль, npm run test:e2e:pw три рази поспіль, docker compose -f docker-compose.prod.yml config; звіт. Із worktree не виходь.
```

### M194

```
Увійди у вже створений worktree за шляхом .claude/worktrees/chore-494-ci-ops-docs (EnterWorktree з path). Увійди в plan mode. Прочитай docs/plans/194-ci-ops-docs-architecture.md (частина I) і git log develop..HEAD. Переконайся, що незакомічених змін немає — інакше зупинись і скажи мені. Запусти /review на diff гілки проти develop з фокусом: воркфлоу синтаксично валідні й запінені, env-check не дає хибних спрацювань на develop, бекап падає на битому архіві, healthcheck не маскує справжній збій, доки відповідають коду. Кожну знахідку класифікуй: виправити зараз (лише дефект цієї ж хвилі) або рядок у BACKLOG з наступного вільного ID. Покажи список і чекай схвалення.

Після схвалення: виправ погоджене в worktree і закоміть; зроби git merge develop у гілку і виріши конфлікти (у BACKLOG.md зберігай рядки обох сторін, next ID бери більший); прожени node scripts/env-check.js --audit, node scripts/check-docs-links.js і npm run test -- --runInBand. Потім вийди з worktree (ExitWorktree keep) і вже в корені: git merge --no-ff worktree-chore-494-ci-ops-docs у develop, повтори npm run test -- --runInBand на develop, після зелених тестів git worktree remove .claude/worktrees/chore-494-ci-ops-docs і git branch -d worktree-chore-494-ci-ops-docs. Звіт: що змержено, що з цього перевіриться лише після розблокування Actions. На демо не заливай.
```

### S194-A2 — архітектура API (після мержу всіх API-частин: 192, 193, 184A, 185A, 188A, 187A)

```
Створи worktree refactor-806-api-architecture і працюй у ньому. Перед першою збіркою виконай у worktree: npm install, npm run db:generate, npm run generate:api.

Увійди в plan mode. Спершу перевір git worktree list: якщо відкрита будь-яка інша гілка, що змінює apps/store-api, зупинись і скажи мені — ця сесія чіпає кожен модуль. Прочитай docs/plans/194-ci-ops-docs-architecture.md, кластер A2 (TASK-791, 806, 818, 827, 820) і AGENTS.md розділ Backend Conventions. Склади план: 791 перший (типізовані спеки — страховка для решти), далі 806 → 818 → 827 → 820; для 806 спершу покажи мені два варіанти (глобальний інтерсептор або конверт у контролері з лінт-правилом) з наслідками для Orval-моделей і чекай мого вибору. Покажи план, чекай схвалення.

Після схвалення виконуй задачу за задачею агентом build із верифікацією тестами; коміт на задачу; після 806 — npm run generate:api і перевір, що згенеровані моделі обох фронтів не змінились неочікувано (git diff по apps/*/src/shared/api/generated). Закриваючи задачу — [🔁] у docs/qa-recheck.md, якщо в неї є чеки. Наприкінці повні тести: npm run typecheck, npm run lint, npm run test -w apps/store-api -- --runInBand, npm run test:int -w apps/store-api, npm run test:e2e -w apps/store-api -- --runInBand, npm run test -w apps/store-admin -- --runInBand, npm run test -w apps/store-client -- --runInBand, npm run test:e2e:pw; звіт. Із worktree не виходь.
```

### M194-A2

```
Увійди у вже створений worktree за шляхом .claude/worktrees/refactor-806-api-architecture (EnterWorktree з path). Увійди в plan mode. Прочитай docs/plans/194-ci-ops-docs-architecture.md (кластер A2) і git log develop..HEAD. Переконайся, що незакомічених змін немає — інакше зупинись і скажи мені. Запусти /review на diff гілки проти develop з фокусом: конверт відповіді однаковий у всіх модулях і відповідає Swagger, Orval-моделі не змінились без причини, жоден модуль не ходить у чужий репозиторій, спеки типізуються. Кожну знахідку класифікуй: виправити зараз (лише дефект цієї ж хвилі) або рядок у BACKLOG з наступного вільного ID. Покажи список і чекай схвалення.

Після схвалення: виправ погоджене в worktree і закоміть; зроби git merge develop у гілку і виріши конфлікти (у BACKLOG.md зберігай рядки обох сторін, next ID бери більший); прожени npm run typecheck && npm run lint && npm run test -- --runInBand, npm run test:int -w apps/store-api, e2e store-api серійно і npm run test:e2e:pw. Потім вийди з worktree (ExitWorktree keep) і вже в корені: git merge --no-ff worktree-refactor-806-api-architecture у develop, повтори npm run test -- --runInBand на develop, після зелених тестів git worktree remove .claude/worktrees/refactor-806-api-architecture і git branch -d worktree-refactor-806-api-architecture. Звіт: що змержено. На демо не заливай.
```

## Хвиля 195 — адмінка: функції й хвости

### S195

```
Створи worktree feature-810-admin-functions і працюй у ньому. Перед першою збіркою виконай у worktree: npm install, npm run db:generate, npm run generate:api.

Увійди в plan mode. Прочитай docs/plans/195-admin-functions.md і в docs/plans/192-api-orders-money-auth.md рядки TASK-596 і 601 (їхню UI-частину робить ця хвиля, кластер F4). Склади план сесії за кластерами F1 замовлення й платежі, F2 таблиці й каталог, F3 форми й схеми, F4 сесія, журнал, тести, FSD; для кожного кластера випиши файли й перевір відсутність перетинів; жоден кластер не змінює наявні примітиви shared/ui, лише додає. Покажи план, чекай схвалення.

Після схвалення: ultracode, агент на кластер, верифікатор на задачу за розділом «Приймання». Правила: кожен агент комітить у гілку worktree одразу після своєї задачі; сусідні знахідки лише в BACKLOG з наступного вільного ID; jest --runInBand; e2e store-api серійно для 559 і 840; форми за docs/conventions/forms.md; нові ключі словника — у кінець відповідних блоків dictionary.ts, бо паралельно йде хвиля 196 і сесія Д-ж. Закриваючи задачу — [🔁] на її чеках у docs/qa-recheck.md (AD-PROD-33, AD-PROD-34, AD-CAT-12, AD-DEV-11, AD-RBAC-14 та нові) і id задачі в Додатку А. Наприкінці повні тести: npm run typecheck, npm run lint, npm run test -w apps/store-admin -- --runInBand, npm run test:e2e -w apps/store-api -- --runInBand, npm run test:e2e:pw -- --project=admin; звіт. Із worktree не виходь.
```

### M195

```
Увійди у вже створений worktree за шляхом .claude/worktrees/feature-810-admin-functions (EnterWorktree з path). Увійди в plan mode. Прочитай docs/plans/195-admin-functions.md і git log develop..HEAD. Переконайся, що незакомічених змін немає — інакше зупинись і скажи мені. Запусти /review на diff гілки проти develop з фокусом: мапери помилок без обхідних шляхів, кнопка повернення коштів із підтвердженням і серверною межею, undo масових дій під тим самим правом, синоніми пошуку доїжджають у Meili, форми за forms.md. Кожну знахідку класифікуй: виправити зараз (лише дефект цієї ж хвилі) або рядок у BACKLOG з наступного вільного ID. Покажи список і чекай схвалення.

Після схвалення: виправ погоджене в worktree і закоміть; зроби git merge develop у гілку і виріши конфлікти (у dictionary.ts і BACKLOG.md зберігай рядки обох сторін, next ID бери більший); прожени npm run typecheck && npm run lint && npm run test -- --runInBand і npm run test:e2e:pw -- --project=admin. Потім вийди з worktree (ExitWorktree keep) і вже в корені: git merge --no-ff worktree-feature-810-admin-functions у develop, повтори npm run test -- --runInBand на develop, після зелених тестів git worktree remove .claude/worktrees/feature-810-admin-functions і git branch -d worktree-feature-810-admin-functions. Звіт: що змержено, які чеки в docs/qa-recheck.md тепер [🔁]. На демо не заливай.
```

## Хвиля 196 — вітрина: логіка, SEO, контент, форми

### S196

```
Створи worktree fix-793-storefront-logic і працюй у ньому. Перед першою збіркою виконай у worktree: npm install, npm run db:generate, npm run generate:api.

Увійди в plan mode. Прочитай docs/plans/196-storefront-logic-seo-content.md і docs/design-system.md. Склади план сесії за кластерами V1 каталог і фільтри, V2 пошук у хедері, V3 SEO і контент, V4 замовлення, кабінет, форми — паралельно; V5 наскрізне — після них; V6 SSR каталогу — останнім окремим агентом; для кожного кластера випиши файли й перевір відсутність перетинів. Хвиля не змінює вигляд: де фікс вимагає нової розмітки, зроби мінімально за наявними патернами й запиши розбіжність окремим списком для сесії Д-в. Покажи план, чекай схвалення.

Після схвалення: ultracode, агент на кластер, верифікатор на задачу за розділом «Приймання». Правила: кожен агент комітить у гілку worktree одразу після своєї задачі; сусідні знахідки лише в BACKLOG з наступного вільного ID; jest --runInBand; e2e серійно; нові ключі словника — у кінець відповідних блоків apps/store-client/src/shared/config/dictionary.ts; якщо V6 не вміщається в сесію — лиши TASK-563 ⬜ з розбором у плані, не мерж половину. Закриваючи задачу — [🔁] на її чеках у docs/qa-recheck.md (SF-CAT-13, SF-SEO-19, SF-UX-13, SF-CNT-05, SF-CNT-26 та нові) і id задачі в Додатку А. Наприкінці повні тести: npm run typecheck, npm run lint, npm run test -w apps/store-client -- --runInBand, npm run test:e2e -w apps/store-api -- --runInBand, npm run test:e2e:pw -- --project=chromium, npm run build -w apps/store-client; звіт із переліком розбіжностей для Д-в. Із worktree не виходь.
```

### M196

```
Увійди у вже створений worktree за шляхом .claude/worktrees/fix-793-storefront-logic (EnterWorktree з path). Увійди в plan mode. Прочитай docs/plans/196-storefront-logic-seo-content.md і git log develop..HEAD. Переконайся, що незакомічених змін немає — інакше зупинись і скажи мені. Запусти /review на diff гілки проти develop з фокусом: noindex і canonical на фільтрованих і пагінованих сторінках, структурована розмітка лише для видимого, CSP img-src і фолбеки, один автокомпліт зберіг поведінку TASK-411, SSR каталогу не зламав ISR-теги, 5xx не віддається як 404. Кожну знахідку класифікуй: виправити зараз (лише дефект цієї ж хвилі) або рядок у BACKLOG з наступного вільного ID. Покажи список і чекай схвалення.

Після схвалення: виправ погоджене в worktree і закоміть; зроби git merge develop у гілку і виріши конфлікти (у dictionary.ts і BACKLOG.md зберігай рядки обох сторін, next ID бери більший); прожени npm run typecheck && npm run lint && npm run test -- --runInBand, e2e store-api серійно і npm run test:e2e:pw -- --project=chromium. Потім вийди з worktree (ExitWorktree keep) і вже в корені: git merge --no-ff worktree-fix-793-storefront-logic у develop, повтори npm run test -- --runInBand на develop, після зелених тестів git worktree remove .claude/worktrees/fix-793-storefront-logic і git branch -d worktree-fix-793-storefront-logic. Звіт: що змержено, які чеки в docs/qa-recheck.md тепер [🔁]. На демо не заливай.
```

## Хвиля 197 — вітрина: вигляд за оновленими макетами

### S197

```
Створи worktree feature-498-storefront-visual і працюй у ньому. Перед першою збіркою виконай у worktree: npm install, npm run db:generate, npm run generate:api.

Увійди в plan mode. Прочитай docs/plans/197-storefront-visual-by-mockups.md, docs/design-system.md, свіжий звіт аудиту вітрини в docs/reviews (storefront-design-audit, з підсумком сесії Д-в) і рядки BACKLOG під планом 197. Перший крок — дельта: git log від коміту підсумку Д-в до HEAD по apps/store-client/src — що змінилось у коді після синхронізації макетів; розбіжності з макетами покажи мені до коду. Завантаж інструменти claude-design і читай макети «store-client — Pages» (a8ec3567-e819-4d5c-948c-04a1a8fd47aa) через read_file і render_preview. Склади план за кластерами G1 сітки й /promo, G2 хедер і тема, G3 примітиви, G4 PDP і каталог, G5 задачі з аудиту; для кожного кластера — файли, відсутність перетинів і який макет він реалізує. Покажи план, чекай схвалення.

Після схвалення: ultracode, агент designer на кластер, верифікатор на задачу за розділом «Приймання» — кожен змінений екран порівнюється з макетом (render_preview макета поруч із Playwright-скриншотом на 1440 і 390). Правила: кожен агент комітить у гілку worktree одразу після своєї задачі; сусідні знахідки лише в BACKLOG з наступного вільного ID; jest --runInBand; eslint-suppressions.json оновлюється в тому самому коміті, що й код; нові ключі словника — у кінець блоків dictionary.ts. Закриваючи задачу — [🔁] на її чеках у docs/qa-recheck.md (SF-PDP-02 та нові) і id задачі в Додатку А. Наприкінці повні тести: npm run typecheck, npm run lint, npm run test -w apps/store-client -- --runInBand, npm run test:e2e:pw -- --project=chromium, npm run build -w apps/store-client; звіт зі скриншотами «макет / сторінка». Із worktree не виходь.
```

### M197

```
Увійди у вже створений worktree за шляхом .claude/worktrees/feature-498-storefront-visual (EnterWorktree з path). Увійди в plan mode. Прочитай docs/plans/197-storefront-visual-by-mockups.md і git log develop..HEAD. Переконайся, що незакомічених змін немає — інакше зупинись і скажи мені. Запусти /review на diff гілки проти develop з фокусом: відповідність макетам Pages, адаптив без горизонтального скролу на 320–1440, Radix-примітиви з a11y за APG, жодних нових довільних значень Tailwind. Кожну знахідку класифікуй: виправити зараз (лише дефект цієї ж хвилі) або рядок у BACKLOG з наступного вільного ID. Покажи список і чекай схвалення.

Після схвалення: виправ погоджене в worktree і закоміть; зроби git merge develop у гілку і виріши конфлікти (у dictionary.ts і BACKLOG.md зберігай рядки обох сторін, next ID бери більший); прожени npm run typecheck && npm run lint && npm run test -- --runInBand і npm run test:e2e:pw -- --project=chromium. Потім вийди з worktree (ExitWorktree keep) і вже в корені: git merge --no-ff worktree-feature-498-storefront-visual у develop, повтори npm run test -- --runInBand на develop, після зелених тестів git worktree remove .claude/worktrees/feature-498-storefront-visual і git branch -d worktree-feature-498-storefront-visual. Звіт: що змержено, які чеки в docs/qa-recheck.md тепер [🔁], чи змінились apps/store-client/src/shared/ui або globals.css (тоді наступна дизайн-сесія починає з Д-б). На демо не заливай.
```

## Хвиля 198 — адмінка за макетами (Д-з)

### S198

```
Створи worktree feature-732-admin-by-mockups і працюй у ньому. Перед першою збіркою виконай у worktree: npm install, npm run db:generate, npm run generate:api.

Увійди в plan mode. Прочитай docs/plans/198-admin-by-mockups.md, docs/plans/189-design-track-cycle-2.md (реєстр екранів), свіжий список проблем адмінки в docs/reviews (admin-design-problems, з переліком змін по екранах у кінці) і рядки BACKLOG під планом 198. Завантаж інструменти claude-design; артборди — у проєкті «store-admin — Pages» (id — у .design-sync-admin/NOTES.md). Склади план на перший блок реєстру (База): перший крок — спільні зміни shared/ui одним агентом, далі екрани, що не ділять widgets і features, паралельно; для кожного екрана — артборд, файли, які RTL-тести пишуться до зміни. Перед TASK-732 перевір висновок у рядку після TASK-775. Покажи план, чекай схвалення.

Після схвалення: екран за екраном агентом designer (паралельні агенти лише для екранів без спільних файлів), після КОЖНОГО екрана: npm run test -w apps/store-admin -- --runInBand і npm run test:e2e:pw -- --project=admin зелені, RTL-тест на кожен змінений компонент, Playwright-скриншот поруч із render_preview артборда на 1440 і 390, коміт у гілку worktree. Правило: функціональність не регресує — жодна дія, доступна до зміни, не зникає без рядка в переліку змін Д-ж, що це дозволяє; кожна кнопка гейтиться тим самим правом. Нові ключі словника — у кінець блоків dictionary.ts. Наприкінці блоку: npm run typecheck, npm run lint; якщо змінились apps/store-admin/src/shared/ui або globals.css — нагадай мені про синк дизайн-системи адмінки. Закриваючи задачу — [🔁] на її чеках у docs/qa-recheck.md і id задачі в Додатку А. Якщо блок не вміщається в сесію — зупинись після зеленого екрана і скажи, з якого екрана продовжувати. Із worktree не виходь.
```

Наступні блоки (CRM, Контент, Каталог і маркетинг) — новою сесією в тому самому worktree:

```
Увійди у вже створений worktree за шляхом .claude/worktrees/feature-732-admin-by-mockups (EnterWorktree з path). Увійди в plan mode. Прочитай docs/plans/198-admin-by-mockups.md і git log develop..HEAD — що вже зроблено. Візьми наступний незроблений блок реєстру з docs/plans/189-design-track-cycle-2.md і склади план так само, як для блоку База: спільні зміни shared/ui першим кроком, далі екран за екраном; покажи план, чекай схвалення. Далі ті самі правила: після кожного екрана npm run test -w apps/store-admin -- --runInBand і npm run test:e2e:pw -- --project=admin зелені, RTL на змінені компоненти, скриншот поруч з артбордом, коміт; функціональність не регресує; [🔁] у docs/qa-recheck.md і id у Додатку А. Із worktree не виходь.
```

### M198

```
Увійди у вже створений worktree за шляхом .claude/worktrees/feature-732-admin-by-mockups (EnterWorktree з path). Увійди в plan mode. Прочитай docs/plans/198-admin-by-mockups.md і git log develop..HEAD. Переконайся, що всі чотири блоки зроблено і незакомічених змін немає — інакше зупинись і скажи мені. Запусти /review на diff гілки проти develop з фокусом: жодна дія не зникла (порівняй перелік дій кожного екрана до і після), права на кожній кнопці, відповідність артбордам, a11y таблиць і діалогів. Кожну знахідку класифікуй: виправити зараз (лише дефект цієї ж хвилі) або рядок у BACKLOG з наступного вільного ID. Покажи список і чекай схвалення.

Після схвалення: виправ погоджене в worktree і закоміть; зроби git merge develop у гілку і виріши конфлікти (у dictionary.ts і BACKLOG.md зберігай рядки обох сторін, next ID бери більший); прожени npm run typecheck && npm run lint && npm run test -- --runInBand і npm run test:e2e:pw -- --project=admin. Потім вийди з worktree (ExitWorktree keep) і вже в корені: git merge --no-ff worktree-feature-732-admin-by-mockups у develop, повтори npm run test -- --runInBand на develop, після зелених тестів git worktree remove .claude/worktrees/feature-732-admin-by-mockups і git branch -d worktree-feature-732-admin-by-mockups. Звіт: що змержено, які чеки тепер [🔁], чи потрібен синк дизайн-системи адмінки. На демо не заливай.
```

## Дизайн-трек (план 189)

Інструменти:

- `/design-sync` — слеш-команда. Її вводить власник першим рядком промпту, і вона веде інструмент
  DesignSync.
- Макети й артборди Claude Code пише через MCP claude-design. Перед першим записом він викликає
  `get_claude_design_prompt`.
- Правки в канвасі claude.ai/design робить власник. Claude Code читає їх як коментарі.

### Д-а — аудит вітрини (без змін у Claude Design і в коді)

```
Увійди в plan mode. Це аудит: код і Claude Design не змінюй. Прочитай docs/plans/189-design-track-cycle-2.md (розділ «Д-а — що має бути в аудиті»), docs/design-system.md і .design-sync/NOTES.md. Завантаж інструменти claude-design (ToolSearch) і прочитай список файлів проєкту «store-client — Pages» (a8ec3567-e819-4d5c-948c-04a1a8fd47aa). Для кожного з 27 маршрутів apps/store-client/src/app/**/page.tsx і кожного з 19 *.dc.html у Pages план має дати рядок: що в коді (розмітка, компоненти shared/ui, брейкпоінти, стани), що в макеті (read_file і render_preview на 1440 і 390), що в docs/design-system.md, хто правий, дія (оновити макет / оновити design-system.md / кодова задача). Покажи план аудиту, чекай схвалення.

Після схвалення: факти коду збирай агентами Explore по групах (каталог і PDP; кошик і чекаут; кабінет, auth і замовлення; контент і хаби), макети й DS — сам. Спірні «хто правий» покажи мені наприкінці через AskUserQuestion, з варіантами і твоєю рекомендацією. Результат — файл у docs/reviews з іменем «сьогоднішня дата у форматі РРРР-ММ-ДД» + «-storefront-design-audit.md»: таблиця по екранах, маршрути без макета, перелік змін docs/design-system.md для Д-б, перелік змін макетів для Д-в, кодові задачі. Кодові задачі заведи рядками BACKLOG під планом 197 з наступного вільного ID; рядок TASK-844 — ✅. node scripts/check-docs-links.js, коміт docs у develop.
```

### Д-б — синхронізація дизайн-системи вітрини (після M190)

```
/design-sync
Повторна синхронізація store-client Design System після хвилі 190 (TASK-735 і 736 змінили shared/ui і globals.css). Спершу прочитай .design-sync/NOTES.md (особливо Re-sync risks) і docs/plans/189-design-track-cycle-2.md (TASK-845). Перед збіркою node .design-sync/build/compile-css.mjs. Прев'ю нових компонентів авторити, змінені — перевірити й переоцінити; Input › Invalid тепер має червону рамку — переоцінити клітинку і прибрати примітку з Known render warns. Перед завантаженням покажи мені .review.html і чекай «так». templates/, screenshots/, uploads/ у проєкті не чіпати.

Після завантаження: відкрий DS-проєкт, щоб перегенерувався _ds_manifest.json. Потім у «store-client — Pages» (a8ec3567-e819-4d5c-948c-04a1a8fd47aa): render_preview кожного з 19 *.dc.html ДО копіювання; скопіюй 6 файлів (README.md, _adherence.oxlintrc.json, _ds_bundle.css, _ds_bundle.js, _ds_manifest.json, styles.css) з DS-проєкту f20dfb51-3752-4dfd-b3f7-def6adfe814e у _ds/store-client-design-system-f20dfb51-3752-4dfd-b3f7-def6adfe814e/ через claude-design copy_files з finalize_plan і if_match; render_preview усіх 19 ПІСЛЯ. У мок-даних Catalog, Homepage, Promo, Wishlist, Product додай кожному товару inStock: true, одному-двом товарам у Catalog постав inStock: false, більше нічого в них не змінюй. Внеси в docs/design-system.md зміни з розділу «перелік змін design-system.md» свіжого звіту аудиту вітрини. Допиши рядок у Sync log .design-sync/NOTES.md. Скриншоти до й після — у docs/images/design-sync з сьогоднішньою датою в іменах. Рядок TASK-845 — ✅. Коміт .design-sync/, docs і BACKLOG у develop.
```

### Д-в — макети вітрини до реалізованої верстки (в1 — Claude Code, в2 — інтерактивна)

```
Увійди в plan mode. Прочитай docs/plans/189-design-track-cycle-2.md (TASK-846), свіжий звіт аудиту вітрини в docs/reviews (storefront-design-audit) і .design-sync/NOTES.md. Перевір, що дизайн-система не відстала: git log від коміту з останнього рядка Sync log у NOTES.md до HEAD по apps/store-client/src/shared/ui і apps/store-client/src/app/globals.css — не порожньо → зупинись і скажи мені, спершу Д-б. Потім дельта коду: git log від коміту звіту аудиту до HEAD по apps/store-client/src — додай у перелік змін. Завантаж claude-design, виклич get_claude_design_prompt з project_id a8ec3567-e819-4d5c-948c-04a1a8fd47aa і read_design_skill hifi-design. План: по одному макету за раз у порядку аудиту — що змінюєш, щоб макет став як код на 1440 і 390; потім нові файли для маршрутів без макета за переліком аудиту. Жодних покращень: макет відтворює код. Покажи план, чекай схвалення.

Після схвалення (в1): для кожного файла — read_file, write_files з if_match, render_preview до й після; після кожних трьох файлів — короткий звіт мені. Наприкінці в1 дай посилання https://claude.ai/design/p/a8ec3567-e819-4d5c-948c-04a1a8fd47aa і скажи «готово до правок».

Далі (в2, інтерактивно): я правлю в канвасі й лишаю коментарі. Коли скажу «перевір коментарі» — list_comments по змінених файлах, застосуй, ack_comments, render_preview. Кожну правку, що вимагає зміни коду, записуй рядком у BACKLOG під планом 197 з наступного вільного ID. Коли скажу «закриваємо» — допиши в кінець звіту аудиту розділ «Підсумок Д-в» (коміт develop, що змінено в макетах, які задачі заведено), рядок TASK-846 — ✅, коміт docs і BACKLOG у develop. Коду не чіпай.
```

### Д-г — макет TASK-217 (інтерактивна, після Д-в)

```
Увійди в plan mode. Прочитай docs/plans/174-storefront-ux-wave.md розділ TASK-217 (структура артбордів погоджена там), рядок TASK-217 у BACKLOG і docs/plans/189-design-track-cycle-2.md (Д-г). Перевір, що у звіті аудиту вітрини є «Підсумок Д-в» — інакше зупинись. Завантаж claude-design, виклич get_claude_design_prompt з project_id a8ec3567-e819-4d5c-948c-04a1a8fd47aa, прочитай Account.dc.html. План: новий файл AccountOrders.dc.html поруч з Account.dc.html — історія замовлень і деталі замовлення як секції кабінету (/account/orders і /account/orders/[id]), артборди 1440 і 390, лише компоненти оновленої дизайн-системи й патерни Account.dc.html. Покажи план, чекай схвалення.

Після схвалення: створи файл, render_preview, дай мені посилання https://claude.ai/design/p/a8ec3567-e819-4d5c-948c-04a1a8fd47aa?file=AccountOrders.dc.html і чекай правок у канвасі. Коли скажу «перевір коментарі» — list_comments, застосуй, ack_comments. Коли скажу «закриваємо» — допиши посилання в рядок TASK-217 у BACKLOG, коміт у develop. Коду не чіпай.
```

### S7′ — реалізація TASK-217 (після Д-г і M197)

```
Створи worktree feature-217-orders-in-account і працюй у ньому. Перед першою збіркою виконай у worktree: npm install, npm run db:generate, npm run generate:api.

Увійди в plan mode. Реалізуй TASK-217 за макетом AccountOrders.dc.html у проєкті «store-client — Pages» (https://claude.ai/design/p/a8ec3567-e819-4d5c-948c-04a1a8fd47aa?file=AccountOrders.dc.html; читай через claude-design read_file і render_preview) і розділом TASK-217 у docs/plans/174-storefront-ux-wave.md: історія й деталі замовлень стають секціями /account/orders і /account/orders/[id], старі /orders* редіректять 308 (крім /orders/status і /orders/guest/…, їх не чіпати), повернення після входу за TASK-419. Покажи план, чекай схвалення, далі виконуй агентом designer. Після кожного екрана — render_preview макета поруч із Playwright-скриншотом на 1440 і 390. Тести: npm run test -w apps/store-client -- --runInBand, npm run test:e2e:pw -- --project=chromium. Коміт на крок, [🔁] у docs/qa-recheck.md з id у Додатку А під TASK-217, із worktree не виходь.
```

### M217

```
Увійди у вже створений worktree за шляхом .claude/worktrees/feature-217-orders-in-account (EnterWorktree з path). Увійди в plan mode. Прочитай розділ TASK-217 у docs/plans/174-storefront-ux-wave.md і git log develop..HEAD. Переконайся, що незакомічених змін немає — інакше зупинись і скажи мені. Запусти /review на diff гілки проти develop з фокусом: 308-редиректи не зачепили гостьові й публічні маршрути, повернення після входу, noindex приватних сторінок, відповідність макету. Кожну знахідку класифікуй: виправити зараз (лише дефект цієї ж хвилі) або рядок у BACKLOG з наступного вільного ID. Покажи список і чекай схвалення.

Після схвалення: виправ погоджене в worktree і закоміть; зроби git merge develop у гілку і виріши конфлікти (у dictionary.ts і BACKLOG.md зберігай рядки обох сторін, next ID бери більший); прожени npm run typecheck && npm run lint && npm run test -w apps/store-client -- --runInBand і npm run test:e2e:pw -- --project=chromium. Потім вийди з worktree (ExitWorktree keep) і вже в корені: git merge --no-ff worktree-feature-217-orders-in-account у develop, повтори npm run test -w apps/store-client -- --runInBand на develop, після зелених тестів git worktree remove .claude/worktrees/feature-217-orders-in-account і git branch -d worktree-feature-217-orders-in-account. Звіт: що змержено, які чеки тепер [🔁]. На демо не заливай.
```

### Д-д — дизайн-система адмінки і «store-admin — Pages»

```
/design-sync
Створи нову дизайн-систему для адмінки: джерело apps/store-admin/src/shared/ui, токени apps/store-admin/src/app/globals.css. Конфіг — окрема тека .design-sync-admin/ за зразком .design-sync/: прочитай .design-sync/NOTES.md цілком (synth-entry, build-only tsconfig, Next-шими, barrel-шими, bundle-prelude зі світлою темою, dts-форк, compile-css, гітігнор-пастка build/) і повтори те, що застосовне; у .gitignore додай виняток для .design-sync-admin/build/. Вітринний .design-sync/ не чіпай. Проєкт у Claude Design — DesignSync create_project з назвою «store-admin Design System». Перед завантаженням покажи мені .review.html і чекай «так».

Після завантаження: відкрий DS-проєкт, щоб зʼявився _ds_manifest.json. Створи claude-design create_project з назвою «store-admin — Pages». Скопіюй 6 файлів (README.md, _adherence.oxlintrc.json, _ds_bundle.css, _ds_bundle.js, _ds_manifest.json, styles.css) з DS-проєкту в «store-admin — Pages» у теку _ds/store-admin-design-system- плюс id DS-проєкту. За зразком «store-client — Pages» (a8ec3567-e819-4d5c-948c-04a1a8fd47aa: read_file ds-base.js і theme.js) додай ds-base.js, що вказує на цю теку. Виклич get_claude_design_prompt для нового проєкту і створи AdminShell.dc.html — оболонка адмінки як у коді (сайдбар за apps/store-admin/src/widgets/admin-shell/admin-nav-list.tsx, шапка, мобільна шухляда), артборди 1440 і 390, render_preview. У .design-sync-admin/NOTES.md запиши обидва id проєктів, Sync log і процедуру копіювання _ds після кожного синку. Рядок TASK-847 — ✅. Коміт .design-sync-admin/, .gitignore і BACKLOG у develop, посилання на обидва проєкти — мені.
```

### Д-е1…е4 — артборди адмінки як у коді (без покращень)

Чотири сесії одна за одною: Д-е1 **База** (TASK-848) → Д-е2 **CRM** (TASK-849) → Д-е3
**Контент** (TASK-850) → Д-е4 **Каталог і маркетинг** (TASK-851). Промпти відрізняються лише
групою реєстру і номером задачі.

**Д-е1:**

```
Увійди в plan mode. Прочитай docs/plans/189-design-track-cycle-2.md (реєстр екранів адмінки, група «База») і .design-sync-admin/NOTES.md. Завантаж claude-design, виклич get_claude_design_prompt для проєкту «store-admin — Pages» (id — у .design-sync-admin/NOTES.md). Базовий коміт = git rev-parse HEAD на develop зараз; запиши його. Для кожного екрана групи «База» прочитай код маршруту в apps/store-admin/src/app/(dashboard) і його widgets та features, тексти — дослівно з apps/store-admin/src/shared/config/dictionary.ts, права — як бачить власник. План: один файл на розділ, два артборди (1440 і 390) плюс стани, що є в коді (порожній, завантаження, помилка, діалог підтвердження), оболонка через dc-import AdminShell. Артборди відтворюють код без жодних покращень — розбіжність із кодом є дефектом артборда. Покажи план, чекай схвалення.

Після схвалення: факти коду можна збирати агентами Explore паралельно по розділах, файли в Claude Design пише лише ця сесія: екран за екраном write_files з if_match і render_preview. Наприкінці: у реєстрі плану 189 допиши для екранів групи «База» базовий коміт, рядок TASK-848 у BACKLOG — ✅, коміт docs і BACKLOG у develop, посилання на проєкт мені.
```

**Д-е2:**

```
Увійди в plan mode. Прочитай docs/plans/189-design-track-cycle-2.md (реєстр екранів адмінки, група «CRM») і .design-sync-admin/NOTES.md. Завантаж claude-design, виклич get_claude_design_prompt для проєкту «store-admin — Pages» (id — у .design-sync-admin/NOTES.md). Базовий коміт = git rev-parse HEAD на develop зараз; запиши його. Для кожного екрана групи «CRM» прочитай код маршруту в apps/store-admin/src/app/(dashboard) і його widgets та features, тексти — дослівно з apps/store-admin/src/shared/config/dictionary.ts, права — як бачить власник. План: один файл на розділ, два артборди (1440 і 390) плюс стани, що є в коді (порожній, завантаження, помилка, діалог підтвердження), оболонка через dc-import AdminShell. Артборди відтворюють код без жодних покращень — розбіжність із кодом є дефектом артборда. Покажи план, чекай схвалення.

Після схвалення: факти коду можна збирати агентами Explore паралельно по розділах, файли в Claude Design пише лише ця сесія: екран за екраном write_files з if_match і render_preview. Наприкінці: у реєстрі плану 189 допиши для екранів групи «CRM» базовий коміт, рядок TASK-849 у BACKLOG — ✅, коміт docs і BACKLOG у develop, посилання на проєкт мені.
```

**Д-е3:**

```
Увійди в plan mode. Прочитай docs/plans/189-design-track-cycle-2.md (реєстр екранів адмінки, група «Контент») і .design-sync-admin/NOTES.md. Завантаж claude-design, виклич get_claude_design_prompt для проєкту «store-admin — Pages» (id — у .design-sync-admin/NOTES.md). Базовий коміт = git rev-parse HEAD на develop зараз; запиши його. Для кожного екрана групи «Контент» прочитай код маршруту в apps/store-admin/src/app/(dashboard) і його widgets та features, тексти — дослівно з apps/store-admin/src/shared/config/dictionary.ts, права — як бачить власник. План: один файл на розділ, два артборди (1440 і 390) плюс стани, що є в коді (порожній, завантаження, помилка, діалог підтвердження), оболонка через dc-import AdminShell. Артборди відтворюють код без жодних покращень — розбіжність із кодом є дефектом артборда. Покажи план, чекай схвалення.

Після схвалення: факти коду можна збирати агентами Explore паралельно по розділах, файли в Claude Design пише лише ця сесія: екран за екраном write_files з if_match і render_preview. Наприкінці: у реєстрі плану 189 допиши для екранів групи «Контент» базовий коміт, рядок TASK-850 у BACKLOG — ✅, коміт docs і BACKLOG у develop, посилання на проєкт мені.
```

**Д-е4:**

```
Увійди в plan mode. Прочитай docs/plans/189-design-track-cycle-2.md (реєстр екранів адмінки, група «Каталог і маркетинг») і .design-sync-admin/NOTES.md. Завантаж claude-design, виклич get_claude_design_prompt для проєкту «store-admin — Pages» (id — у .design-sync-admin/NOTES.md). Базовий коміт = git rev-parse HEAD на develop зараз; запиши його. Для кожного екрана групи «Каталог і маркетинг» прочитай код маршруту в apps/store-admin/src/app/(dashboard) і його widgets та features, тексти — дослівно з apps/store-admin/src/shared/config/dictionary.ts, права — як бачить власник. План: один файл на розділ, два артборди (1440 і 390) плюс стани, що є в коді (порожній, завантаження, помилка, діалог підтвердження), оболонка через dc-import AdminShell. Артборди відтворюють код без жодних покращень — розбіжність із кодом є дефектом артборда. Покажи план, чекай схвалення.

Після схвалення: факти коду можна збирати агентами Explore паралельно по розділах, файли в Claude Design пише лише ця сесія: екран за екраном write_files з if_match і render_preview. Наприкінці: у реєстрі плану 189 допиши для екранів групи «Каталог і маркетинг» базовий коміт, рядок TASK-851 у BACKLOG — ✅, коміт docs і BACKLOG у develop, посилання на проєкт мені.
```

### Д-ж1 — дельта і список проблем адмінки (Claude Code; після Д-е1…е4, можна поки йде S195)

```
Увійди в plan mode. Прочитай docs/plans/189-design-track-cycle-2.md (Д-ж і реєстр екранів) і docs/plans/198-admin-by-mockups.md. ж0: для кожного екрана реєстру git log від його базового коміту до HEAD по apps/store-admin/src — що змінили хвилі 191 і 195 (якщо 195 ще не змержена — дельту 195 дотягнеш у Д-ж2). ж1: список проблем адмінки по екранах із BACKLOG — хвости плану 175, незакрите з плану 191, TASK-732 і 734 та все з позначкою верстки адмінки, ❌ AD-* у docs/qa-recheck.md, зауваження власника в docs/reviews/2026-08-27-demo-run.md (розділ «Перепровірка 2026-09-21», зокрема «таблиці адмінки системно бідні на функції порівняно з 1С»), подорожі персон К і О в docs/user-stories.md. Для кожної проблеми — екран, що не так, пропозиція для артборда. Покажи план, чекай схвалення.

Після схвалення: виконай ж0 (артборди під дельту, як у Д-е — відтворення коду без покращень, базовий коміт у реєстрі оновити), потім запиши список у docs/reviews файлом «сьогоднішня дата у форматі РРРР-ММ-ДД» + «-admin-design-problems.md», node scripts/check-docs-links.js, коміт у develop, посилання на проєкт мені. Коду не чіпай.
```

### Д-ж2 і Д-ж3 — правки адмінки в канвасі (інтерактивні; після M195)

**Д-ж2** — групи «База» і «CRM»:

```
Інтерактивна сесія зі мною в канвасі. Прочитай docs/plans/189-design-track-cycle-2.md (Д-ж, реєстр екранів) і свіжий список проблем адмінки в docs/reviews (admin-design-problems). Якщо M195 змержено після Д-ж1 — спершу дотягни артборди під дельту 195 (git log від базового коміту), як у ж0. Завантаж claude-design, виклич get_claude_design_prompt для «store-admin — Pages» (id — у .design-sync-admin/NOTES.md) і read_design_skill hifi-design. Групи цієї сесії: «База» і «CRM». Для кожного екрана груп по черзі: збережи поточний стан поруч із суфіксом -before, запропонуй правки під проблеми зі списку прямо в артбордах (write_files з if_match, render_preview), покажи мені й чекай мого «далі» або моїх правок у канвасі; коли скажу «перевір коментарі» — list_comments, застосуй, ack_comments. Жодна наявна дія не зникає без мого явного «прибрати». Після кожного екрана — рядок у переліку змін (що міняється, які компоненти shared/ui, які тексти) і задача в BACKLOG під планом 198 з наступного вільного ID, у порядку реєстру. Коли скажу «закриваємо» — перелік змін у кінець списку проблем, коміт docs і BACKLOG у develop. Коду не чіпай.
```

**Д-ж3** — групи «Контент» і «Каталог і маркетинг»:

```
Інтерактивна сесія зі мною в канвасі. Прочитай docs/plans/189-design-track-cycle-2.md (Д-ж, реєстр екранів) і свіжий список проблем адмінки в docs/reviews (admin-design-problems) разом із переліком змін, який уже дописала сесія Д-ж2 — рішення по спільних компонентах звідти не переглядай без мого слова. Завантаж claude-design, виклич get_claude_design_prompt для «store-admin — Pages» (id — у .design-sync-admin/NOTES.md) і read_design_skill hifi-design. Групи цієї сесії: «Контент» і «Каталог і маркетинг». Для кожного екрана груп по черзі: збережи поточний стан поруч із суфіксом -before, запропонуй правки під проблеми зі списку прямо в артбордах (write_files з if_match, render_preview), покажи мені й чекай мого «далі» або моїх правок у канвасі; коли скажу «перевір коментарі» — list_comments, застосуй, ack_comments. Жодна наявна дія не зникає без мого явного «прибрати». Після кожного екрана — рядок у переліку змін (що міняється, які компоненти shared/ui, які тексти) і задача в BACKLOG під планом 198 з наступного вільного ID, у порядку реєстру. Коли скажу «закриваємо» — перелік змін у кінець списку проблем, рядок TASK-852 — ✅, коміт docs і BACKLOG у develop. Коду не чіпай.
```

### Д-н1 — нові макети вітрини (інтерактивна; після Д-г)

```
Інтерактивна сесія зі мною в канвасі. Прочитай docs/plans/189-design-track-cycle-2.md (Д-н1) і розділи задач у планах: docs/plans/184-delivery-methods.md (TASK-646, 647), docs/plans/185-deletion.md (TASK-657), docs/plans/186-home-blocks-and-preview.md (TASK-663, 669), docs/plans/187-notifications.md (TASK-679). Завантаж claude-design, виклич get_claude_design_prompt з project_id a8ec3567-e819-4d5c-948c-04a1a8fd47aa і read_design_skill hifi-design. План: нові файли в «store-client — Pages» — CheckoutDelivery.dc.html (крок 1 з чотирма методами доставки, стан «вартість уточнить оператор», підсумок, недоступні способи оплати вимкнені з причиною), зміна Cart.dc.html (кнопка «Прибрати недоступні» в підсумку), HomepageBlocks.dc.html (головна як послідовність блоків, два блоки з табами, смужка «Це прев'ю — вийти»), зміна Account.dc.html (куди надсилати сповіщення) і OrderSuccess.dc.html (пропозиція Telegram для гостя); артборди 1440 і 390, лише компоненти дизайн-системи. Покажи план, чекай схвалення.

Після схвалення: файл за файлом, render_preview, посилання мені, чекай моїх правок; «перевір коментарі» — list_comments, застосуй, ack_comments. Коли скажу «закриваємо» — у рядки BACKLOG TASK-646, 647, 657, 663, 669, 679 допиши посилання на свої макети, рядок TASK-854 — ✅, коміт у develop. Коду не чіпай.
```

### Д-н2 — нові макети адмінки (інтерактивна; після Д-ж3)

```
Інтерактивна сесія зі мною в канвасі. Прочитай docs/plans/189-design-track-cycle-2.md (Д-н2) і розділи задач у планах: docs/plans/184-delivery-methods.md (TASK-644, 645, 648), docs/plans/185-deletion.md (TASK-655, 656), docs/plans/186-home-blocks-and-preview.md (TASK-662, 664, 667, 670), docs/plans/187-notifications.md (TASK-676), docs/plans/188-analytics.md (TASK-692, 693). Завантаж claude-design, виклич get_claude_design_prompt для «store-admin — Pages» (id — у .design-sync-admin/NOTES.md) і read_design_skill hifi-design. План: нові файли — SettingsDelivery.dc.html (перемикачі методів, кур'єр, точки самовивозу), CategoryDelete.dc.html (діалог з перемикачем «в існуючу / створити нову» і числами наслідків) і зміна артборда списку товарів для «Відновити», Home.dc.html (/home: блоки з drag-reorder, вмикання, додавання CAROUSEL і TABS), ReadOnlyTemplate.dc.html (edit-сторінка в режимі перегляду), кнопка «Подивитись на сайті» на формах, SettingsNotifications.dc.html, Analytics.dc.html (селектор періоду, п'ять звітів, три рядки виторгу, стан без права на гроші); артборди 1440 і 390 на оновлених артбордах Д-ж. Покажи план, чекай схвалення.

Після схвалення: файл за файлом, render_preview, посилання мені, чекай моїх правок; «перевір коментарі» — list_comments, застосуй, ack_comments. Коли скажу «закриваємо» — у рядки BACKLOG перелічених задач допиши посилання на свої макети, рядок TASK-855 — ✅, коміт у develop. Коду не чіпай.
```

## Черга 184–188

### S184A — доставка, API (після M192)

```
Створи worktree feature-642-delivery-api і працюй у ньому. Перед першою збіркою виконай у worktree: npm install, npm run db:generate, npm run generate:api.

Увійди в plan mode. Прочитай docs/plans/184-delivery-methods.md повністю, особливо «Кластери (цикл 2)», і в docs/plans/178-brainstorms.md «Рішення 2026-09-15 (B-6)». У цій сесії лише частина A: TASK-642 і 643; TASK-650 уже зроблена хвилею 190 — перевір, що вона в develop. Модуль грошовий: TASK-643 роби агентом tdd-agent. Склади план зі списком файлів на кожен крок; перевір на чинному чекауті вітрини, що вона завжди шле місто НП (інакше новий 400 зламає замовлення). Покажи план, чекай схвалення.

Після схвалення: 642 → 643 послідовно; міграція через npx prisma migrate diff --script з підрахунком рядків до й після бекфілу (жодне замовлення з npCityRef не OTHER і навпаки — запитом); після 643 — npm run generate:api. Коміт на задачу; сусідні знахідки лише в BACKLOG з наступного вільного ID. Закриваючи задачу — [🔁] на її чеках у docs/qa-recheck.md і id у Додатку А. Наприкінці: npm run typecheck, npm run lint, npm run test -w apps/store-api -- --runInBand, npm run test:int -w apps/store-api, npm run test:e2e -w apps/store-api -- --runInBand, npm run test -w apps/store-client -- --runInBand; звіт. Із worktree не виходь.
```

### S185A — видалення, API (після M193 і B-11)

```
Створи worktree feature-651-deletion-api і працюй у ньому. Перед першою збіркою виконай у worktree: npm install, npm run db:generate, npm run generate:api.

Увійди в plan mode. Прочитай docs/plans/185-deletion.md повністю, особливо «Кластери (цикл 2)», і в docs/plans/178-brainstorms.md «Рішення 2026-09-15 (B-2)» і рішення B-11 щодо TASK-839. У цій сесії лише частина A: TASK-651, 652, 653, 654. TASK-653 — найризикованіша: випиши в плані КОЖНЕ місце, що читає категорії (grep по category у репозиторіях, SEO, sitemap, hub-routes, фасетах, каруселях, імпорті), і для кожного — як додається deletedAt: null. Покажи план, чекай схвалення.

Після схвалення: 651 → 652 разом із 653 (одна гілка, як вимагає план) → 654; агент build із верифікацією; інтеграційний тест тумбстоуна на справжньому Postgres — гейт сесії; міграція через npx prisma migrate diff --script; коментар про відсутній бекфіл над ключем categories:delete. Коміт на задачу; сусідні знахідки лише в BACKLOG з наступного вільного ID. Закриваючи задачу — [🔁] у docs/qa-recheck.md і id у Додатку А. Наприкінці: npm run typecheck, npm run lint, npm run test -w apps/store-api -- --runInBand, npm run test:int -w apps/store-api, npm run test:e2e -w apps/store-api -- --runInBand; звіт. Із worktree не виходь.
```

### S188A — звіти, API (після M192)

```
Створи worktree feature-684-analytics-api і працюй у ньому. Перед першою збіркою виконай у worktree: npm install, npm run db:generate, npm run generate:api.

Увійди в plan mode. Прочитай docs/plans/188-analytics.md повністю, особливо «Кластери (цикл 2)», і в docs/plans/178-brainstorms.md «Рішення 2026-09-15 (B-8)». У цій сесії лише частина A: TASK-684, 685, 686, 687, 688, 689, 690, 691 (лише спільна правка escapeCsvField і BOM), 694. Гроші: 684 і 686 роби агентом tdd-agent; три тести-гейти TASK-686 пишуться першими. Склади план у порядку з розділу «Порядок» плану; для бекфілу analytics:revenue — запит на підрахунок UserPermission до й після. Покажи план, чекай схвалення.

Після схвалення виконуй задачу за задачею з верифікацією тестами; коміт на задачу; сусідні знахідки лише в BACKLOG з наступного вільного ID; міграції через npx prisma migrate diff --script; після 684 і 685 — npm run generate:api. Закриваючи задачу — [🔁] у docs/qa-recheck.md і id у Додатку А. Наприкінці: npm run typecheck, npm run lint, npm run test -w apps/store-api -- --runInBand, npm run test:int -w apps/store-api, npm run test:e2e -w apps/store-api -- --runInBand, npm run test -w apps/store-admin -- --runInBand; звіт. Із worktree не виходь.
```

### S187A — сповіщення, API (після M184A)

```
Створи worktree feature-672-notifications-api і працюй у ньому. Перед першою збіркою виконай у worktree: npm install, npm run db:generate, npm run generate:api.

Увійди в plan mode. Прочитай docs/plans/187-notifications.md повністю, особливо «Три обмеження» і «Кластери (цикл 2)», і в docs/plans/178-brainstorms.md «Рішення 2026-09-15 (B-7)». У цій сесії лише частина A: TASK-672, 673, 674, 675, 677, 678. Перевір, що TASK-650 і план 184 частина A вже в develop. Склади план у порядку 672 → 673 → 674 → 675 → 677 → 678 зі списком файлів; для 673 — перелік mail-outbox-спек, які мають лишитись зеленими без правок логіки. Покажи план, чекай схвалення.

Після схвалення виконуй задачу за задачею агентом build з верифікацією тестами; коміт на задачу; міграція через npx prisma migrate diff --script з інтеграційним тестом досилання наявних PENDING; TELEGRAM_BOT_TOKEN додається в приклади оточення лише Write/Edit (guard-bash блокує bash-команди з підрядком .env). Сусідні знахідки лише в BACKLOG з наступного вільного ID. Закриваючи задачу — [🔁] у docs/qa-recheck.md і id у Додатку А. Наприкінці: npm run typecheck, npm run lint, npm run test -w apps/store-api -- --runInBand, npm run test:int -w apps/store-api, npm run test:e2e -w apps/store-api -- --runInBand, node scripts/env-check.js --audit; звіт. Із worktree не виходь.
```

### M184A

```
Увійди у вже створений worktree за шляхом .claude/worktrees/feature-642-delivery-api (EnterWorktree з path). Увійди в plan mode. Прочитай docs/plans/184-delivery-methods.md і git log develop..HEAD. Переконайся, що незакомічених змін немає — інакше зупинись і скажи мені. Запусти /review на diff гілки проти develop з фокусом: матриця доставка × оплата лише на бекенді й в одному модулі, вартість рахує сервер, бекфіл deliveryMethod порахований, зворотна сумісність чинного чекауту. Кожну знахідку класифікуй: виправити зараз (лише дефект цієї ж хвилі) або рядок у BACKLOG з наступного вільного ID. Покажи список і чекай схвалення.

Після схвалення: виправ погоджене в worktree і закоміть; зроби git merge develop у гілку і виріши конфлікти (у BACKLOG.md зберігай рядки обох сторін, next ID бери більший); прожени npm run typecheck && npm run lint && npm run test -- --runInBand, npm run test:int -w apps/store-api і e2e store-api серійно. Потім вийди з worktree (ExitWorktree keep) і вже в корені: git merge --no-ff worktree-feature-642-delivery-api у develop, повтори npm run test -- --runInBand на develop, після зелених тестів git worktree remove .claude/worktrees/feature-642-delivery-api і git branch -d worktree-feature-642-delivery-api. Звіт: що змержено, які чеки тепер [🔁]. На демо не заливай.
```

### M185A

```
Увійди у вже створений worktree за шляхом .claude/worktrees/feature-651-deletion-api (EnterWorktree з path). Увійди в plan mode. Прочитай docs/plans/185-deletion.md і git log develop..HEAD. Переконайся, що незакомічених змін немає — інакше зупинись і скажи мені. Запусти /review на diff гілки проти develop з фокусом: тумбстоун на кожному читанні категорій (новий фільтр видимості × усі шляхи читання), одна транзакція переносу, жоден товар не видалено й не деактивовано, каруселі піддерева перемкнуто явно, право categories:delete без бекфілу з коментарем-причиною. Кожну знахідку класифікуй: виправити зараз (лише дефект цієї ж хвилі) або рядок у BACKLOG з наступного вільного ID. Покажи список і чекай схвалення.

Після схвалення: виправ погоджене в worktree і закоміть; зроби git merge develop у гілку і виріши конфлікти (у BACKLOG.md зберігай рядки обох сторін, next ID бери більший); прожени npm run typecheck && npm run lint && npm run test -- --runInBand, npm run test:int -w apps/store-api і e2e store-api серійно. Потім вийди з worktree (ExitWorktree keep) і вже в корені: git merge --no-ff worktree-feature-651-deletion-api у develop, повтори npm run test -- --runInBand на develop, після зелених тестів git worktree remove .claude/worktrees/feature-651-deletion-api і git branch -d worktree-feature-651-deletion-api. Звіт: що змержено, які чеки тепер [🔁]. На демо не заливай.
```

### M188A

```
Увійди у вже створений worktree за шляхом .claude/worktrees/feature-684-analytics-api (EnterWorktree з path). Увійди в plan mode. Прочитай docs/plans/188-analytics.md і git log develop..HEAD. Переконайся, що незакомічених змін немає — інакше зупинись і скажи мені. Запусти /review на diff гілки проти develop з фокусом: гроші вирізає сервіс (у тілі відповіді без права немає поля), кеш-ключ містить право, київська доба однакова в JS і SQL, бекфіл analytics:revenue по UserPermission порахований, BOM і числові колонки CSV не зламали наявні вивантаження. Кожну знахідку класифікуй: виправити зараз (лише дефект цієї ж хвилі) або рядок у BACKLOG з наступного вільного ID. Покажи список і чекай схвалення.

Після схвалення: виправ погоджене в worktree і закоміть; зроби git merge develop у гілку і виріши конфлікти (у BACKLOG.md зберігай рядки обох сторін, next ID бери більший); прожени npm run typecheck && npm run lint && npm run test -- --runInBand, npm run test:int -w apps/store-api і e2e store-api серійно. Потім вийди з worktree (ExitWorktree keep) і вже в корені: git merge --no-ff worktree-feature-684-analytics-api у develop, повтори npm run test -- --runInBand на develop, після зелених тестів git worktree remove .claude/worktrees/feature-684-analytics-api і git branch -d worktree-feature-684-analytics-api. Звіт: що змержено, які чеки тепер [🔁]. На демо не заливай.
```

### M187A

```
Увійди у вже створений worktree за шляхом .claude/worktrees/feature-672-notifications-api (EnterWorktree з path). Увійди в plan mode. Прочитай docs/plans/187-notifications.md і git log develop..HEAD. Переконайся, що незакомічених змін немає — інакше зупинись і скажи мені. Запусти /review на diff гілки проти develop з фокусом: постановка в чергу в тій самій транзакції, що й подія, жодного зовнішнього HTTP усередині транзакції, канал без налаштування кричить у лог і не ковтає повідомлення, токен прив'язки одноразовий, міграція notification_outbox не губить PENDING. Кожну знахідку класифікуй: виправити зараз (лише дефект цієї ж хвилі) або рядок у BACKLOG з наступного вільного ID. Покажи список і чекай схвалення.

Після схвалення: виправ погоджене в worktree і закоміть; зроби git merge develop у гілку і виріши конфлікти (у BACKLOG.md зберігай рядки обох сторін, next ID бери більший); прожени npm run typecheck && npm run lint && npm run test -- --runInBand, npm run test:int -w apps/store-api і e2e store-api серійно. Потім вийди з worktree (ExitWorktree keep) і вже в корені: git merge --no-ff worktree-feature-672-notifications-api у develop, повтори npm run test -- --runInBand на develop, після зелених тестів git worktree remove .claude/worktrees/feature-672-notifications-api і git branch -d worktree-feature-672-notifications-api. Звіт: що змержено, які чеки тепер [🔁]. На демо не заливай.
```

### S184U — доставка, UI (після Д-н1, Д-н2, M184A, M197, M198, M217)

```
Створи worktree feature-644-delivery-ui і працюй у ньому. Перед першою збіркою виконай у worktree: npm install, npm run db:generate, npm run generate:api.

Увійди в plan mode. Прочитай docs/plans/184-delivery-methods.md (TASK-644…649 і «Кластери (цикл 2)») і docs/conventions/forms.md. Перевір, що частина A (TASK-642, 643) у develop. Макети — посилання в рядках TASK-644…648 у BACKLOG (сесії Д-н1 і Д-н2); завантаж claude-design і читай їх через read_file і render_preview. Склади план: адмінка (644 → 645, 648) і вітрина (646 → 647) — два кластери, файли не перетинаються; 649 наприкінці. Покажи план, чекай схвалення.

Після схвалення: ultracode, агент designer на кластер, верифікатор на задачу за «Прийняттям» задач плану; кожен екран порівнюється з макетом (render_preview поруч із Playwright-скриншотом на 1440 і 390). Правила: коміт у гілку worktree одразу після задачі; форми за forms.md (values або reset(), жодного defaultValues з пропа, жодного key-ремаунту); нові ключі словника — у кінець блоків dictionary.ts обох застосунків; сусідні знахідки лише в BACKLOG з наступного вільного ID. Закриваючи задачу — [🔁] у docs/qa-recheck.md і id у Додатку А; нові SF-CHK і AD-SET чеки — з id, вільними в docs/qa-manual-full.md. Наприкінці: npm run typecheck, npm run lint, npm run test -w apps/store-admin -- --runInBand, npm run test -w apps/store-client -- --runInBand, npm run test:e2e -w apps/store-api -- --runInBand, npm run test:e2e:pw; звіт. Із worktree не виходь.
```

### S185U — видалення, UI (після Д-н1, Д-н2, M185A, M197, M198, M217)

```
Створи worktree feature-655-deletion-ui і працюй у ньому. Перед першою збіркою виконай у worktree: npm install, npm run db:generate, npm run generate:api.

Увійди в plan mode. Прочитай docs/plans/185-deletion.md (TASK-655…658 і «Кластери (цикл 2)») і docs/conventions/forms.md. Перевір, що частина A (TASK-651…654) у develop. Макети — посилання в рядках TASK-655, 656, 657 у BACKLOG (сесії Д-н1 і Д-н2); завантаж claude-design і читай їх через read_file і render_preview. Склади план: адмінка (655; 656 — ендпоінт POST /api/products/:id/restore разом із кнопкою) і вітрина (657) — два кластери, файли не перетинаються; 658 наприкінці. Покажи план, чекай схвалення.

Після схвалення: ultracode, агент на кластер (адмінка й вітрина — designer, ендпоінт 656 — build), верифікатор на задачу за «Приймання» задач плану; кожен екран порівнюється з макетом (render_preview поруч із Playwright-скриншотом на 1440 і 390). Правила: коміт у гілку worktree одразу після задачі; форми за forms.md (поле «назва» в діалозі — без key-ремаунту); нові ключі словника — у кінець блоків dictionary.ts обох застосунків; сусідні знахідки лише в BACKLOG з наступного вільного ID. Закриваючи задачу — [🔁] у docs/qa-recheck.md (AD-CAT-11 та нові) і id у Додатку А; нові AD-* і SF-* чеки — з id, вільними в docs/qa-manual-full.md. Наприкінці: npm run typecheck, npm run lint, npm run test -w apps/store-admin -- --runInBand, npm run test -w apps/store-client -- --runInBand, npm run test:e2e -w apps/store-api -- --runInBand, npm run test:e2e:pw; звіт. Із worktree не виходь.
```

### S188U — звіти, UI (після Д-н2, M188A, M198)

```
Створи worktree feature-692-analytics-ui і працюй у ньому. Перед першою збіркою виконай у worktree: npm install, npm run db:generate, npm run generate:api.

Увійди в plan mode. Прочитай docs/plans/188-analytics.md (TASK-691…695 і «Кластери (цикл 2)») і docs/conventions/forms.md. Перевір, що частина A (TASK-684…691 серверна частина, 694) у develop. Макет /analytics — посилання в рядку TASK-692 у BACKLOG (сесія Д-н2); завантаж claude-design і читай його через read_file і render_preview. Склади план: екран /analytics з одним селектором періоду в URL (use-url-params), п'ять блоків, кнопки CSV кожного звіту (частина TASK-691), без analytics:revenue блоку «Продажі» немає в DOM; потім 693 (підпис «за 7 днів» і «Детальніше» на дашборді); 695 — доки наприкінці. Покажи план, чекай схвалення.

Після схвалення виконуй агентом designer задачу за задачею з верифікацією; екран порівнюється з макетом (render_preview поруч із Playwright-скриншотом на 1440 і 390). Правила: коміт у гілку worktree одразу після задачі; форма діапазону за forms.md; нові ключі словника — у кінець блоків dictionary.ts адмінки; сусідні знахідки лише в BACKLOG з наступного вільного ID. Закриваючи задачу — [🔁] у docs/qa-recheck.md і id у Додатку А; нові AD-* чеки — з id, вільними в docs/qa-manual-full.md. Наприкінці: npm run typecheck, npm run lint, npm run test -w apps/store-admin -- --runInBand, npm run test:e2e:pw -- --project=admin; звіт. Із worktree не виходь.
```

### S187U — сповіщення, UI (після Д-н1, Д-н2, M187A, M184U)

```
Створи worktree feature-676-notifications-ui і працюй у ньому. Перед першою збіркою виконай у worktree: npm install, npm run db:generate, npm run generate:api.

Увійди в plan mode. Прочитай docs/plans/187-notifications.md (TASK-676, 679, 680, 681, «Три обмеження» і «Кластери (цикл 2)») і docs/conventions/forms.md. Перевір, що частина A (TASK-672…675, 677, 678) і план 184 частина U у develop. Макети — посилання в рядках TASK-676 і 679 у BACKLOG (сесії Д-н1 і Д-н2); завантаж claude-design і читай їх через read_file і render_preview. Склади план: адмінка (676 — /settings/notifications з deep-link і QR) і вітрина (679 — перевага в профілі й пропозиція гостю на сторінці успіху; 680 — клієнтські типи в Telegram додатково до пошти) — два кластери, файли не перетинаються; 681 — доки наприкінці. Покажи план, чекай схвалення.

Після схвалення: ultracode, агент на кластер (UI — designer, 680 — build), верифікатор на задачу за розділом плану; кожен екран порівнюється з макетом (render_preview поруч із Playwright-скриншотом на 1440 і 390). Правила: коміт у гілку worktree одразу після задачі; форми за forms.md (значення з асинхронних даних — без useState без гарду); підтвердження замовлення йде поштою завжди; нові ключі словника — у кінець блоків dictionary.ts обох застосунків; сусідні знахідки лише в BACKLOG з наступного вільного ID. Закриваючи задачу — [🔁] у docs/qa-recheck.md і id у Додатку А; нові AD-* і SF-* чеки — з id, вільними в docs/qa-manual-full.md. Сторінку в docs/deploy для TASK-681 я пройду на тестовому боті — дай мені її наприкінці. Наприкінці: npm run typecheck, npm run lint, npm run test -w apps/store-admin -- --runInBand, npm run test -w apps/store-client -- --runInBand, npm run test:e2e -w apps/store-api -- --runInBand, npm run test:e2e:pw; звіт. Із worktree не виходь.
```

### M184U

```
Увійди у вже створений worktree за шляхом .claude/worktrees/feature-644-delivery-ui (EnterWorktree з path). Увійди в plan mode. Прочитай docs/plans/184-delivery-methods.md і git log develop..HEAD. Переконайся, що незакомічених змін немає — інакше зупинись і скажи мені. Запусти /review на diff гілки проти develop з фокусом: відповідність макетам Д-н, форми за forms.md, права settings:delivery на екрані й кнопках, жоден шлях не показує «Доставка: 0 грн» там, де вартість не рахувалась, недоступні способи оплати вимкнені з причиною, а не зникають. Кожну знахідку класифікуй: виправити зараз (лише дефект цієї ж хвилі) або рядок у BACKLOG з наступного вільного ID. Покажи список і чекай схвалення.

Після схвалення: виправ погоджене в worktree і закоміть; зроби git merge develop у гілку і виріши конфлікти (у dictionary.ts і BACKLOG.md зберігай рядки обох сторін, next ID бери більший); прожени npm run typecheck && npm run lint && npm run test -- --runInBand і npm run test:e2e:pw. Потім вийди з worktree (ExitWorktree keep) і вже в корені: git merge --no-ff worktree-feature-644-delivery-ui у develop, повтори npm run test -- --runInBand на develop, після зелених тестів git worktree remove .claude/worktrees/feature-644-delivery-ui і git branch -d worktree-feature-644-delivery-ui. Звіт: що змержено, які чеки тепер [🔁]. На демо не заливай.
```

### M185U

```
Увійди у вже створений worktree за шляхом .claude/worktrees/feature-655-deletion-ui (EnterWorktree з path). Увійди в plan mode. Прочитай docs/plans/185-deletion.md і git log develop..HEAD. Переконайся, що незакомічених змін немає — інакше зупинись і скажи мені. Запусти /review на diff гілки проти develop з фокусом: відповідність макетам Д-н, числа наслідків показані до натискання, селект цілі без категорій піддерева, відновлення товару повертає рідний slug або дає 409 із назвою поля, «Прибрати недоступні» не губить фокус і має доступне ім'я з кількістю. Кожну знахідку класифікуй: виправити зараз (лише дефект цієї ж хвилі) або рядок у BACKLOG з наступного вільного ID. Покажи список і чекай схвалення.

Після схвалення: виправ погоджене в worktree і закоміть; зроби git merge develop у гілку і виріши конфлікти (у dictionary.ts і BACKLOG.md зберігай рядки обох сторін, next ID бери більший); прожени npm run typecheck && npm run lint && npm run test -- --runInBand, e2e store-api серійно і npm run test:e2e:pw. Потім вийди з worktree (ExitWorktree keep) і вже в корені: git merge --no-ff worktree-feature-655-deletion-ui у develop, повтори npm run test -- --runInBand на develop, після зелених тестів git worktree remove .claude/worktrees/feature-655-deletion-ui і git branch -d worktree-feature-655-deletion-ui. Звіт: що змержено, які чеки тепер [🔁]. На демо не заливай.
```

### M188U

```
Увійди у вже створений worktree за шляхом .claude/worktrees/feature-692-analytics-ui (EnterWorktree з path). Увійди в plan mode. Прочитай docs/plans/188-analytics.md і git log develop..HEAD. Переконайся, що незакомічених змін немає — інакше зупинись і скажи мені. Запусти /review на diff гілки проти develop з фокусом: відповідність макету Д-н2, без analytics:revenue жодних сум у DOM і в мережевих відповідях, період у URL і посилання на звіт відтворює той самий звіт, CSV = рівно те, що на екрані, «не налаштовано» і «не відповів» Umami — різні стани, а не 0%. Кожну знахідку класифікуй: виправити зараз (лише дефект цієї ж хвилі) або рядок у BACKLOG з наступного вільного ID. Покажи список і чекай схвалення.

Після схвалення: виправ погоджене в worktree і закоміть; зроби git merge develop у гілку і виріши конфлікти (у dictionary.ts і BACKLOG.md зберігай рядки обох сторін, next ID бери більший); прожени npm run typecheck && npm run lint && npm run test -- --runInBand і npm run test:e2e:pw -- --project=admin. Потім вийди з worktree (ExitWorktree keep) і вже в корені: git merge --no-ff worktree-feature-692-analytics-ui у develop, повтори npm run test -- --runInBand на develop, після зелених тестів git worktree remove .claude/worktrees/feature-692-analytics-ui і git branch -d worktree-feature-692-analytics-ui. Звіт: що змержено, які чеки тепер [🔁]. На демо не заливай.
```

### M187U

```
Увійди у вже створений worktree за шляхом .claude/worktrees/feature-676-notifications-ui (EnterWorktree з path). Увійди в plan mode. Прочитай docs/plans/187-notifications.md і git log develop..HEAD. Переконайся, що незакомічених змін немає — інакше зупинись і скажи мені. Запусти /review на diff гілки проти develop з фокусом: відповідність макетам Д-н, пошта йде завжди (месенджер лише додається), токен прив'язки гостя прив'язаний до замовлення і одноразовий, стан каналу на екрані чесний, форми за forms.md. Кожну знахідку класифікуй: виправити зараз (лише дефект цієї ж хвилі) або рядок у BACKLOG з наступного вільного ID. Покажи список і чекай схвалення.

Після схвалення: виправ погоджене в worktree і закоміть; зроби git merge develop у гілку і виріши конфлікти (у dictionary.ts і BACKLOG.md зберігай рядки обох сторін, next ID бери більший); прожени npm run typecheck && npm run lint && npm run test -- --runInBand, e2e store-api серійно і npm run test:e2e:pw. Потім вийди з worktree (ExitWorktree keep) і вже в корені: git merge --no-ff worktree-feature-676-notifications-ui у develop, повтори npm run test -- --runInBand на develop, після зелених тестів git worktree remove .claude/worktrees/feature-676-notifications-ui і git branch -d worktree-feature-676-notifications-ui. Звіт: що змержено, які чеки тепер [🔁]. На демо не заливай.
```

### S186 — головна як блоки, перегляд, прев'ю (цілком, останньою)

```
Створи worktree feature-660-home-blocks і працюй у ньому. Перед першою збіркою виконай у worktree: npm install, npm run db:generate, npm run generate:api.

Увійди в plan mode. Прочитай docs/plans/186-home-blocks-and-preview.md повністю, особливо «Два обмеження» і «Кластери (цикл 2)», і в docs/plans/178-brainstorms.md «Рішення 2026-09-15 (B-9)». Перевір, що в develop уже є: хвиля 198, сесія S194-A2 (конвенція конверта), макети Д-н1 (головна, смужка прев'ю) і Д-н2 (/home, read-only шаблон, «Подивитись на сайті») — посилання в рядках TASK-662, 663, 667, 669, 670. Склади план за кластерами H1 → (H2 ∥ H3 ∥ H4) → H5; міграції 665 і 666 — в одному прогоні; для 660 — інтеграційний тест «той самий перелік секцій у тому ж порядку» як гейт. Покажи план, чекай схвалення.

Після схвалення: H1 агентом build з верифікацією; далі ultracode, агент на кластер H2–H4 (H3 і H4 — агент designer за макетами), верифікатор на задачу. Правила: коміт у гілку worktree одразу після задачі; міграції через npx prisma migrate diff --script з бекфілом і підрахунком рядків; прев'ю — no-store, без ISR-тегів, noindex, секрет лише в API; нові ключі словника — у кінець блоків dictionary.ts обох застосунків; сусідні знахідки лише в BACKLOG з наступного вільного ID. Закриваючи задачу — [🔁] у docs/qa-recheck.md (AD-PROD-26 та нові) і id у Додатку А. Наприкінці: npm run typecheck, npm run lint, npm run test -- --runInBand, npm run test:int -w apps/store-api, npm run test:e2e -w apps/store-api -- --runInBand, npm run test:e2e:pw; звіт. Із worktree не виходь.
```

### M186

```
Увійди у вже створений worktree за шляхом .claude/worktrees/feature-660-home-blocks (EnterWorktree з path). Увійди в plan mode. Прочитай docs/plans/186-home-blocks-and-preview.md і git log develop..HEAD. Переконайся, що незакомічених змін немає — інакше зупинись і скажи мені. Запусти /review на diff гілки проти develop з фокусом: міграція зберігає порядок головної і зносить placement лише після бекфілу, бекфіли home:write і :read нікому нічого не забрали, роль із самим :read отримує 403 на будь-який запис, прев'ю не потрапляє в кеш і індекс, головна рендериться при недоступному API, drag-reorder без локального фільтра над перетягуванням. Кожну знахідку класифікуй: виправити зараз (лише дефект цієї ж хвилі) або рядок у BACKLOG з наступного вільного ID. Покажи список і чекай схвалення.

Після схвалення: виправ погоджене в worktree і закоміть; зроби git merge develop у гілку і виріши конфлікти (у dictionary.ts і BACKLOG.md зберігай рядки обох сторін, next ID бери більший); прожени npm run typecheck && npm run lint && npm run test -- --runInBand, npm run test:int -w apps/store-api, e2e store-api серійно і npm run test:e2e:pw. Потім вийди з worktree (ExitWorktree keep) і вже в корені: git merge --no-ff worktree-feature-660-home-blocks у develop, повтори npm run test -- --runInBand на develop, після зелених тестів git worktree remove .claude/worktrees/feature-660-home-blocks і git branch -d worktree-feature-660-home-blocks. Звіт: що змержено, які чеки тепер [🔁]. На демо не заливай.
```

## Коли з'явиться staging

У цьому циклі staging не буде (рішення власника 2026-09-23). Тут лежить усе, що чекає на нього:
TASK-457 (~40 чеків ⛔ у `qa-recheck.md`), TASK-584 (замір AVIF/WebP на 2 vCPU) і TASK-393 (замір
спільного rate-limit-відра SSR). Коли сервер буде куплено, потрібні дві сесії: спершу підняття,
потім S15.

### Підняття staging

```
Увійди в plan mode. Ми піднімаємо окремий staging-сервер. Прочитай docs/deploy/00-start-here.md, docs/deploy/01-accounts-access.md, docs/deploy/03-server.md, docs/deploy/04-secrets-ci.md, docs/deploy/04a-env-matrix.md, docs/deploy/05-first-deploy.md, docs/deploy/05a-analytics.md і docs/deploy/10-capacity.md, а також памʼять проєкту infra-decisions-2026-08-03 і github-actions-billing-lock. SSH до сервера в тебе немає: команди на сервері виконую я, ти даєш їх по одній і перевіряєш результат ззовні curl-ом. Спершу спитай мене адресу staging-хоста і чи куплено домен. План: кроки за документами у тому порядку, як вони пронумеровані, з увімкненими реальними ключами для перевірок TASK-457 — MAIL_ENABLED=true (Mailpit або SMTP), NP_API_KEY, GOOGLE_CLIENT_ID і GOOGLE_CLIENT_SECRET, INDEXNOW_KEY, Umami, LiqPay sandbox — і SENTRY_ENVIRONMENT=staging (TASK-739). Секрети не показуй і не записуй у репозиторій; значення прикладів оточення правиш лише Write/Edit. Покажи план, чекай схвалення.

Після схвалення веди мене крок за кроком; після кожного кроку — перевірка ззовні. Наприкінці: GET /api/health, заголовки безпеки, robots із noindex на staging (TASK-550), рядок у таблицю «Деплої» в шапці docs/qa-recheck.md з позначкою staging, короткий запис у docs/deploy/06-day-to-day.md про те, де живе staging, коміт docs у develop.
```

### S15 — прогін на staging (TASK-457, 584, 393)

```
Прочитай docs/plans/179-quality-security-docs-infra.md розділ TASK-457, docs/reviews/2026-08-27-demo-run-triage.md §8 і docs/deploy/10-capacity.md. Спершу спитай мене адресу staging-хоста. Підстав її в curl-скрипти з плану 179, прожени їх сам; прожени харнес scripts/load/images.js холодно й тепло (TASK-584) і замір SSR-відра за docs/deploy/10-capacity.md (TASK-393), 429 рахуй окремо від інших збоїв. Результати запиши в docs/reviews файлом «сьогоднішня дата у форматі РРРР-ММ-ДД» + «-staging-run.md». Що не можна перевірити скриптом, дай мені списком чеків із docs/qa-recheck.md, позначених «⛔ staging», у порядку зон. Закоміть у develop.
```

## Блок білінгу GitHub

TASK-491 — це не код, а рахунок: доки акаунт заблоковано, жоден джоб не стартує. Після
розблокування:

1. Прогнати `ci.yml` і `security.yml` вручну.
2. TASK-755: зняти `continue-on-error` з Playwright після трьох зелених повних прогонів поспіль.
3. TASK-769: перевірити, що cron `security.yml` стартує сам.
4. Пройти чеки SYS-35, SYS-36, SYS-37.

До того «CI зелений» стверджується лише локальним прогоном.

## Кроки запуску і після запуску

- **Кроки запуску, не код:**
  - TASK-272 — прод-деплой;
  - TASK-322 — реліз `main`, який відстав від develop на 800+ комітів;
  - TASK-283 — контент власника;
  - TASK-339 — юрист, cookie-consent;
  - TASK-597 — власник вмикає `reviews:write` менеджерам.

  Порядок описано в `docs/deploy/09-pre-launch.md`.

- **Після запуску (поза циклом, рішення власника 2026-09-23):**
  - 🅿️ TASK-034/081, 049, 050, 085, 090, 175, 178, 286;
  - TASK-284, 341 (залишок), 344 (2FA, рішення B-3), 482, 557, 576, 682, 683, 710, 746, 754.

  Причина кожного — у [інвентарі](reviews/2026-09-23-cycle-2-inventory.md).
