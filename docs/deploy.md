# Деплой на staging — ранбук для власника (TASK-271)

> **Для кого:** для власника без технічного бекграунду. Кожен розділ — це набір
> команд, які можна **копіювати як є**. Технічні рішення (чому саме так) описані
> в `docs/plans/124-staging-deploy.md`.
>
> **Staging** — це «тестовий магазин»: точна копія майбутнього продакшену, куди
> кожна зміна потрапляє **автоматично** після зеленого CI. На ньому можна все
> клацати й ламати — дані там **одноразові** (їх не шкода). **Продакшен**
> (справжній магазин для покупців) — це вже інша задача (TASK-272), тут його
> немає.

---

## 0. Словник за 30 секунд

| Слово      | Що це                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| **VPS**    | орендований сервер у хмарі, де крутиться staging                                                                         |
| **CI**     | автоматичні перевірки коду на GitHub (тести, лінт, збірка)                                                               |
| **образ**  | «заморожена» збірка одного застосунку (`store-api`, `store-client`, `store-admin`)                                       |
| **GHCR**   | сховище образів GitHub (`ghcr.io`), звідки сервер їх завантажує                                                          |
| **сервіс** | один контейнер у стеку: `store-api`, `store-client`, `store-admin`, `postgres`, `redis`, `meilisearch`, `umami`, `caddy` |
| **SHA**    | короткий код коміту, напр. `a1b2c3d`; тег образу — `staging-<SHA>`                                                       |

Стек на сервері живе в теці **`/opt/store-ai`**. Заходиш на сервер так:

```bash
ssh <користувач>@<адреса-сервера>
cd /opt/store-ai
```

> Усі довгі команди `docker compose` нижче використовують **два** файли —
> базовий `docker-compose.prod.yml` і staging-оверайд `docker-compose.staging.yml`
> (він підміняє образи на ті, що лежать у GHCR). Завжди вказуй обидва `-f`.

---

## 1. Що відбувається автоматично

1. Розробник зливає зміну в гілку **`develop`**.
2. GitHub проганяє **CI** (тести/лінт/збірка). Якщо щось червоне — деплою **не буде**.
3. Якщо CI зелений — запускається задача **Deploy to Staging**, яка:
   - збирає три образи й кладе їх у GHCR із тегами `staging-<SHA>` та `staging-latest`;
   - заходить на сервер по SSH, завантажує свіжі образи (`pull`) і перезапускає стек (`up -d`);
   - застосовує схему бази (`prisma db push`);
   - робить **smoke-перевірку** — стукає у три адреси й переконується, що все відповідає.
4. Через кілька хвилин зміни видно на staging. **Продакшен при цьому не чіпається.**

> **Один деплой за раз.** Якщо дві зміни зайшли майже одночасно, другий деплой
> **стане в чергу** й дочекається, поки завершиться перший (не обриває його).

---

## 2. Де дивитись, чи деплой пройшов

- **GitHub → вкладка Actions** → workflow **CI** → останній запуск на `develop`.
  Задача **Deploy to Staging** має бути зелена. У її **Summary** видно коміт, тег
  образу й три посилання (вітрина / адмінка / health).
- **GitHub → Environments → `staging`** — історія всіх деплоїв staging.
- Якщо задача **червона** на кроці **Smoke check** — образи зібралися й
  завантажились, але один із застосунків не відповів. Дивись логи (розділ 3).

Перевірити «наживо» вручну (з будь-якого комп'ютера):

```bash
curl -i https://api.<домен>/health     # має бути HTTP 200
curl -i https://<домен>/               # вітрина
curl -i https://admin.<домен>/         # адмінка
```

---

## 3. Як подивитись логи

На сервері, у `/opt/store-ai`. Підстав потрібний сервіс замість `<сервіс>`
(`store-api`, `store-client`, `store-admin`, `postgres`, `redis`, `meilisearch`,
`caddy`, `umami`):

```bash
# «живі» логи одного сервіса (Ctrl+C — вийти):
docker compose -f docker-compose.prod.yml -f docker-compose.staging.yml logs -f <сервіс>

# останні 200 рядків без «стеження»:
docker compose -f docker-compose.prod.yml -f docker-compose.staging.yml logs --tail=200 <сервіс>

# хто зараз запущений і чи «healthy»:
docker compose -f docker-compose.prod.yml -f docker-compose.staging.yml ps
```

Найчастіше цікавить `store-api` (бекенд) — саме там видно помилки замовлень,
авторизації тощо.

---

## 4. Як перезапустити один сервіс

```bash
cd /opt/store-ai
docker compose -f docker-compose.prod.yml -f docker-compose.staging.yml restart <сервіс>
```

Перезапустити геть усе:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.staging.yml restart
```

Якщо сервіс «впав» і не піднімається — глянь його логи (розділ 3), потім:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.staging.yml up -d <сервіс>
```

---

## 5. Як відкотитись (rollback)

Відкат — це **ручна** дія (автоматичної «кнопки відкату» поки немає). Суть:
запустити стек із **попереднім** образом, який уже лежить у GHCR — **нічого
перезбирати не треба**.

**Крок 1. Знайти попередній добрий SHA.** Будь-де з цього:

- GitHub → Actions → попередній зелений **Deploy to Staging** → у Summary тег
  `staging-<SHA>`; або
- `git log --oneline develop` (SHA — це перший стовпчик); або
- GitHub → сторінка пакета в **Packages** (`store-api`/`store-client`/`store-admin`)
  → список версій із тегами `staging-<SHA>`.

**Крок 2. Один раз залогінитись у GHCR** (щоб сервер міг завантажити образ поза
CI). Потрібен персональний токен GitHub із правом **`read:packages`**
(GitHub → Settings → Developer settings → Personal access tokens → згенеруй
classic-токен із галочкою `read:packages`):

```bash
echo '<твій-GHCR-токен>' | docker login ghcr.io -u <твій-github-логін> --password-stdin
```

**Крок 3. Підняти попередній образ:**

```bash
cd /opt/store-ai
export IMAGE_TAG=staging-<попередній-SHA>
docker compose -f docker-compose.prod.yml -f docker-compose.staging.yml --env-file .env.production pull
docker compose -f docker-compose.prod.yml -f docker-compose.staging.yml --env-file .env.production up -d
```

**Перевірити, який образ зараз запущений** (щоб не переплутати збірки):

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.staging.yml images
```

> ⚠ **Про базу даних.** Відкат образів **не відкочує** зміни схеми БД, які встиг
> зробити `prisma db push`. На staging це не проблема — дані одноразові; за потреби
> базу завжди можна перезалити з нуля (`down -v`, розділ 8). На продакшені (майбутнє
> TASK-272) відкат робиться інакше, з бекапом — тут його НЕ повторюй.

---

## 6. Де лежать секрети

Ніяких паролів у коді немає. Усе — у **GitHub → репозиторій → Settings →
Environments → `staging`**:

**Secrets (4 шт.):**

| Ім'я               | Що це                                                                         |
| ------------------ | ----------------------------------------------------------------------------- |
| `SSH_HOST`         | адреса (IP або домен) staging-сервера                                         |
| `SSH_USER`         | користувач для входу по SSH                                                   |
| `SSH_PRIVATE_KEY`  | приватний SSH-ключ (публічний лежить на сервері у `~/.ssh/authorized_keys`)   |
| `STAGING_ENV_FILE` | **весь вміст** заповненого `.env.production` одним блоком (усі паролі, ключі) |

**Variables (публічні, не секрет):**

| Ім'я                                                     | Приклад                 | Навіщо                                            |
| -------------------------------------------------------- | ----------------------- | ------------------------------------------------- |
| `STAGING_DOMAIN`                                         | `staging.mystore.ua`    | домен staging; з нього роблять три адреси й smoke |
| `NEXT_PUBLIC_CURRENCY`                                   | `UAH` _(необов'язково)_ | валюта у вітрині (за замовч. `UAH`)               |
| `NEXT_PUBLIC_SENTRY_DSN`                                 | _(необов'язково)_       | трекінг помилок у браузері                        |
| `NEXT_PUBLIC_UMAMI_SRC` / `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | _(необов'язково)_       | аналітика Umami у вітрині                         |

> `STAGING_ENV_FILE` має бути **повною** копією `.env.production` (усі рядки з
> `.env.production.example`, з реальними значеннями). Якщо пропустити навіть один
> обов'язковий ключ (напр. `POSTGRES_PASSWORD`, `JWT_SECRET`, `NEXT_PUBLIC_API_URL`),
> `docker compose up` впаде з помилкою «... must be set». Згенерувати надійний
> секрет: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

---

## 7. Перша підготовка сервера (одноразово, руками власника)

Це роблять **один раз**, поки staging ще не існує. Далі все автоматично.

1. **Орендуй VPS** (Ubuntu 22.04+), 2 vCPU / 4 ГБ RAM — вистачить для staging.
2. **Встанови Docker** (з офіційного скрипта):
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
   Перевір: `docker --version` і `docker compose version`.
3. **Створи теку стека:** `sudo mkdir -p /opt/store-ai && sudo chown $USER /opt/store-ai`.
   Файли `docker-compose.prod.yml`, `docker-compose.staging.yml`, `Caddyfile` і
   теку `docker/` пайплайн **сам копіює** сюди на кожному деплої — вручну класти
   не треба (за бажання можна покласти для першого ручного запуску).
4. **Додай SSH-ключ:** згенеруй пару (`ssh-keygen -t ed25519`), публічний поклади
   у `~/.ssh/authorized_keys` на сервері, приватний — у секрет `SSH_PRIVATE_KEY`.
5. **Налаштуй DNS.** Три A-записи на IP сервера:
   - `<домен>` → вітрина
   - `admin.<домен>` → адмінка
   - `api.<домен>` → API
     (`<домен>` = значення `STAGING_DOMAIN`.) Порти **80** і **443** мають бути
     відкриті — Caddy сам випустить HTTPS-сертифікати Let's Encrypt.
6. **Заповни секрети/змінні** в Environment `staging` (розділ 6).
7. **Готово.** Наступний push у `develop` задеплоїть staging сам. Хочеш перевірити
   негайно — GitHub → Actions → CI → **Re-run** останнього запуску `develop`.

---

## 8. Аварійне: перезалити staging з нуля

Оскільки дані staging одноразові, найшвидший спосіб полагодити «заплутаний» стан —
знести стек **разом із томами** (Postgres/Redis/Meili/uploads зникнуть) і підняти
заново. **НІКОЛИ не роби так на продакшені.**

```bash
cd /opt/store-ai
docker compose -f docker-compose.prod.yml -f docker-compose.staging.yml --env-file .env.production down -v
docker compose -f docker-compose.prod.yml -f docker-compose.staging.yml --env-file .env.production up -d
```

Схему БД потім наллє наступний деплой (`prisma db push`), або вручну:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.staging.yml --env-file .env.production \
  exec -T -u root -e NPM_CONFIG_CACHE=/tmp/.npm store-api \
  npx --yes prisma@7 db push --schema=prisma/schema.prisma --skip-generate --accept-data-loss
```

---

## Довідка для розробника

- **swagger.json.** Образи вітрини/адмінки генерують Orval-хуки **всередині
  збірки** з файлу `apps/store-api/swagger.json`. Цей файл **у git ігнорується**,
  тому пайплайн `deploy-staging` **регенерує його на раннері перед `docker build`**
  (`npm ci` → `prisma generate` → `npm run swagger:export -w apps/store-api` з
  тимчасовим Postgres і dummy-секретами JWT). Без цього кроку `docker build`
  вітрини/адмінки впав би на `generate:api`.
- **Чому `db push`, а не `migrate deploy`.** Свідоме рішення власника: у git
  версіонується лише одна міграція, `schema.prisma` — джерело правди. `migrate
deploy` на чистій staging-базі впав би. Squash-baseline + перехід на `migrate
deploy` — це вже задача продакшену (TASK-272).
- **Якщо `db push` впав** із «prisma: not found» — рантайм-образ `store-api`
  вирізає devDependencies (`npm prune --omit=dev`), тому CLI `prisma` в ньому може
  бути відсутній. Команда деплою це обходить (`npx --yes prisma@7`, від root, зі
  своїм кешем). Радикальне рішення на майбутнє — внести `prisma` у прод-залежності
  образу (це вже зона Dockerfile з TASK-270).
- **Одноразові образи staging.** `NEXT_PUBLIC_*` «запікаються» у бандл на етапі
  збірки, тож образ прив'язаний до домену staging і **не** може бути промоутнутий
  у прод — прод збирає свої образи (TASK-272).
