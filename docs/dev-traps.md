# Пастки інструментів розробника

> **Для кого:** розробник або агент, що запускає `store-api` і Prisma локально, у CI чи в
> неінтерактивній оболонці. Кожна пастка: **симптом → причина → що робити**. Сюди потрапляє лише
> те, що вже коштувало часу і перевірено по коду, а не з памʼяті (TASK-564).

---

## 1. Nest через `tsx` — застосунок не стартує на валідації env

**Симптом.** `npx tsx src/main.ts` (або будь-який запуск бекенду через `tsx`/esbuild) падає на
старті з
`Invalid environment configuration: PORT must be an integer number; REDIS_PORT must be an integer number; …`
— хоча у файлі оточення `PORT=3001`. Через `npm run start:dev` із тими самими змінними все
працює. Той самий корінь тихо ламає й HTTP-запити: числові query-параметри DTO без явного
`@Type(() => Number)` приходять рядками й не проходять `@IsInt()`.

**Причина.** esbuild (на ньому стоїть `tsx`) вміє `experimentalDecorators`, але **не емітить
decorator metadata** (`emitDecoratorMetadata`, тобто `design:type`). А на ній тримається
`enableImplicitConversion` у class-transformer: щоб перетворити рядок `'3001'` на число, він
питає `Reflect.getMetadata('design:type', …)` — і під `tsx` отримує `undefined`. Рядок лишається
рядком, `@IsInt()` його відкидає. У нас це два місця:

- `validateEnv()` у `apps/store-api/src/config/env.validation.ts` — `plainToInstance(…, {
enableImplicitConversion: true })` + `validateSync`, викликається з `ConfigModule` і **обриває
  старт**;
- глобальний `ValidationPipe` у `apps/store-api/src/main.ts` (`transformOptions.enableImplicitConversion`)
  — для кожного DTO запиту.

Метадані вмикає `packages/typescript-config/nest.json` (`emitDecoratorMetadata: true`), але
цей прапорець читає лише компілятор TypeScript; esbuild його ігнорує.

**Перевірено 2026-09-25** одним і тим самим скриптом (`plainToInstance(EnvironmentVariables,
{ PORT: '3001', REDIS_PORT: '6379' }, { enableImplicitConversion: true })` + `validateSync`):

| Запуск        | `design:type` для `PORT` | `typeof PORT` | Помилки валідації                               |
| ------------- | ------------------------ | ------------- | ----------------------------------------------- |
| `npx tsx`     | `undefined`              | `string`      | `PORT must be an integer number` + `REDIS_PORT` |
| `npx ts-node` | `Number`                 | `number`      | немає                                           |

**Що робити.** Бекенд запускати лише тим, що компілює через `tsc`: `npm run start:dev -w
apps/store-api` (`nest start --watch`), `ts-node` (так працює `swagger:export`) або зібраний
`node dist/main`. `tsx` лишається нормальним вибором для коду **без** class-validator /
class-transformer — наприклад сіду (`tsx prisma/seed.ts`), який DTO не валідовує. Якщо колись
знадобиться швидкий рантайм для Nest — лише такий, що емітить метадані (SWC з
`decoratorMetadata: true`), і з перевіркою цього самого сценарію.

---

## 2. `prisma migrate dev` без TTY зависає, а паралельний запуск падає з P1002

**Симптом.** У неінтерактивній оболонці (агент, CI, `… | tee`, скрипт) `prisma migrate dev`
після зміни схеми нічого не пише й не завершується. Поки він висить (або поки живий
осиротілий `schema-engine`, якщо батьківський процес кинули), **кожен** інший `migrate dev` /
`migrate deploy` / `migrate reset` проти тієї ж бази падає за ~10 с:

```text
Error: P1002
The database server … was reached but timed out.
… Timed out trying to acquire a postgres advisory lock (SELECT pg_advisory_lock(72707369)) …
```

**Причина.** Два факти разом (Prisma 7.9.1, перевірено по `node_modules/prisma/build/cli.js`):

1. Коли `--name` не передано, `migrate dev` **питає імʼя міграції** («Enter a name for the new
   migration»). Пропускає питання він лише тоді, коли в оточенні стоїть змінна CI (`CI`,
   `BUILD_NUMBER`, …): перевірка TTY у цьому місці фактично не спрацьовує. Тож без TTY промпт
   чекає вводу вічно — **і закритий stdin цього не змінює**: з `</dev/null` він так само висить на
   «Enter a name for the new migration» (у вбудованій бібліотеці промптів немає обробника EOF, а
   живий дочірній schema engine не дає процесу завершитися).
2. На момент питання schema engine (`schema-engine-windows.exe` / `schema-engine`) уже запущено
   і він **тримає сесійний advisory lock** Postgres `72707369` — так Prisma не дає двом міграціям
   іти одночасно. Поки процес живий (а вбитий батьківський `node` може лишити його сиротою), лок
   не відпускається, і всі інші спроби впираються в таймаут → P1002. Коли процес завершується
   (зокрема після `timeout`/Ctrl+C, якщо engine не лишився сиротою), сесія закривається і лок
   зникає разом із нею.

Підтвердження про втрату даних (`Are you sure you want to create and apply this migration?`)
без TTY натомість падає одразу з «environment is non-interactive, which is not supported» —
це не зависання, а чесна помилка.

**Що робити.**

- **Завжди передавати імʼя** — це єдине, що прибирає промпт:

  ```bash
  npm run db:migrate -- --name add_foo_column
  ```

  `</dev/null` **не** є страховкою: без `--name` команда із закритим stdin висить так само
  (перевірено наживо — див. нижче). Змінна `CI` теж прибирає промпт, але виставляти її вручну
  заради цього не варто: вона змінює поведінку й інших інструментів.

- **Потрібен лише SQL, без застосування** — `npx prisma migrate dev --create-only --name <name>`
  (з `apps/store-api`), або `npx prisma migrate diff … --script`, коли `migrate dev` у цьому
  оточенні взагалі непридатний (так роблять агентні хвилі — див.
  [session-runbook-2.md](session-runbook-2.md)).

- **Лок уже висить (P1002)** — спершу завершити свій завислий `migrate dev` (Ctrl+C / kill
  саме цього процесу); зазвичай лок зникає разом із ним. Якщо ні — закрити сесію, що його тримає,
  **лише у своїй базі**. Id лока `72707369` однаковий для всіх баз Prisma, а `pg_locks` бачить
  увесь кластер: на спільному `store_postgres` паралельні агенти мігрують свої `store_test_NNN`, і
  запит без фільтра за базою вбʼє їхні міграції посеред роботи. Підключіться до потрібної бази й
  виконайте:

  ```sql
  SELECT pg_terminate_backend(pid)
  FROM pg_locks
  WHERE locktype = 'advisory'
    AND objid = 72707369
    AND database = (SELECT oid FROM pg_database WHERE datname = current_database());
  ```

  Після цього `npx prisma migrate status` має відповідати без таймауту.

- **Вбивати `schema-engine` за іменем — лише коли ви певні, що інших міграцій на машині немає.**
  `Get-Process schema-engine* | Stop-Process -Force` (Windows) чи `pkill -f schema-engine`
  (Linux/macOS) зупиняють **усі** schema engine на машині, зокрема ті, що зараз мігрують бази
  інших агентів чи сесій. Якщо лишився саме сирота вашого запуску — знайдіть його PID і
  зупиніть лише його:

  ```powershell
  # Windows: переглянути, хто є хто, і зупинити один процес
  Get-CimInstance Win32_Process -Filter "Name LIKE 'schema-engine%'" |
    Select-Object ProcessId, ParentProcessId, CreationDate, CommandLine
  Stop-Process -Id <PID> -Force
  ```

  ```bash
  # Linux / macOS
  pgrep -af schema-engine
  kill <PID>
  ```

**Перевірено наживо 2026-09-25** на тимчасовій базі в `store_postgres` (Prisma 7.9.1):
`migrate dev` без `--name` і з `</dev/null` висів на «Enter a name for the new migration», доки
його не вбив `timeout 60` (exit 124). У цей час `pg_locks` показував наданий advisory lock
`objid 72707369` у цій базі, а паралельний `migrate dev --name second </dev/null` упав з «Timed
out trying to acquire a postgres advisory lock … Timeout: 10000ms». Запит `pg_terminate_backend`
вище, виконаний з **іншої** бази, не зачепив нічого (0 сесій); у потрібній базі — відпустив лок
(0 advisory-локів у кластері), і `migrate status` відповів одразу. Сам завислий CLI після цього
**далі висів** на промпті — тож його все одно треба зупинити. Після `timeout` сиріт
`schema-engine` не лишилося. `migrate dev --name probe </dev/null` створив і застосував міграцію
без жодного питання (exit 0).

Не вимикайте лок через `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK` «щоб не заважав»: він захищає від
двох одночасних міграцій, а зависання лікується іменем міграції, а не вимкненням захисту.

---

Повʼязане: [seed-guide.md](seed-guide.md) §4 — робочий цикл міграції; пастки деплою й
контейнерів — [deploy/06-day-to-day.md](deploy/06-day-to-day.md).
