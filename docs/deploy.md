# Деплой — ранбук для власника (TASK-271, TASK-310)

> **Для кого:** для власника без технічного бекграунду. Кожен розділ — це набір
> команд, які можна **копіювати як є**.
>
> **Два середовища:**
>
> - **Staging** — «тестовий магазин». Кожна зміна в `develop` потрапляє туди
>   **автоматично** після зеленого CI. Закритий паролем (щоб не бачив Google і
>   сторонні). Дані там **одноразові** — можна все клацати й ламати, і треба.
> - **Продакшен** — справжній магазин. Деплоїться з `main` і **чекає, поки ви
>   натиснете «Approve»** у GitHub. Перед кожним деплоєм знімається бекап бази.
>
> **Сусідні документи:**
>
> - `docs/operations.md` — як не дати магазину впасти + чек-лист перед запуском
> - `docs/backup-restore.md` — бекапи й відновлення
> - `docs/rollback.md` — що робити, коли деплой зламав прод

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
   - застосовує схему бази, накочуючи міграції (`prisma migrate deploy`);
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
> накотити `prisma migrate deploy`: у Prisma немає автоматичних «down»-міграцій.
> На staging це не проблема — дані одноразові; за потреби базу завжди можна перезалити
> з нуля (`down -v`, розділ 8). На продакшені відкат схеми робиться відновленням із
> бекапу, який знімається **перед** кожним деплоєм — тут цього НЕ повторюй.

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

### 7.0 Домен — купуйте ОДИН

Вам **не потрібні два домени**. Купіть прод-домен (напр. `myshop.com.ua`), а staging живе
на його піддомені — піддомени безкоштовні й необмежені:

| Середовище | Адреси                                                      |
| ---------- | ----------------------------------------------------------- |
| Прод       | `myshop.com.ua`, `admin.myshop.com.ua`, `api.myshop.com.ua` |
| Staging    | `staging.myshop.com.ua`, `admin.staging.…`, `api.staging.…` |

Це не лише економія — це **технічна вимога**. Бекенд ставить куки з `sameSite=strict`, тож
фронтенд і API **мусять бути піддоменами одного домену**. Інакше браузер просто викине куку
і логін «злітатиме» при кожному перезавантаженні сторінки.

> Безкоштовні варіанти (DuckDNS, nip.io) ділять кореневий домен із тисячами чужих сайтів —
> це ламає модель безпеки same-site і послаблює ваш CSRF-захист. Freenom з 2023 року
> безкоштовних доменів більше не видає. Купіть справжній: ~10–15 $/рік.

### 7.1 Скільки серверів — два

Один VPS для staging, один для прода. Причина не в потужності (обидва невеликі), а в тому,
що на staging ви будете **навмисно ламати й скидати** — репетиція відновлення бекапу,
репетиція відкату, повне стирання бази. Окремий сервер робить відповідь на питання
«в якому я середовищі?» **фізичною**, а не питанням уважності о другій ночі.

Рекомендація: **Hetzner CX22** (2 vCPU / 4 ГБ / 40 ГБ), ~€3.79/міс кожен. DigitalOcean —
рівноцінна заміна, решта інструкції від хостера не залежить.

### 7.2 Підготовка сервера (робіть спершу на staging — це і є репетиція)

```bash
# 1. Створити непривілейованого користувача (root для щоденної роботи — погана ідея)
adduser deploy
usermod -aG sudo deploy
```

**На своєму ноутбуці**, не на сервері:

```bash
ssh-keygen -t ed25519 -C "store-ai deploy"
ssh-copy-id -i ~/.ssh/id_ed25519.pub deploy@<IP-сервера>
```

> ⚠ **Перш ніж закрити root-сесію** — відкрийте **другий термінал** і переконайтесь, що
> `ssh deploy@<IP>` працює. Інакше можна замкнути себе зовні власного сервера.

Тепер на сервері:

```bash
# 2. Вимкнути вхід паролем і root-логін
sudo nano /etc/ssh/sshd_config      # PasswordAuthentication no / PermitRootLogin no
sudo systemctl restart sshd

# 3. Фаєрвол + автооновлення безпеки + fail2ban
sudo apt update && sudo apt install -y ufw unattended-upgrades fail2ban age rclone
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
sudo dpkg-reconfigure -plow unattended-upgrades

# 4. Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker deploy

# 5. Тека стека
sudo mkdir -p /opt/store-ai && sudo chown deploy /opt/store-ai
```

Файли (`docker-compose*.yml`, `Caddyfile*`, `scripts/`, `docker/`) пайплайн **копіює сам**
на кожному деплої — вручну класти не треба.

### 7.3 DNS

A-записи на IP відповідного сервера. **Без проксі** (у Cloudflare — сіра хмарка): Caddy сам
випускає HTTPS-сертифікати Let's Encrypt, і для цього має бачити з'єднання напряму.
Порти **80** і **443** мають бути відкриті.

### 7.4 Пароль на staging

Staging закритий Basic Auth, щоб його не проіндексував Google і не побачили сторонні.

```bash
# згенерувати хеш пароля
docker run --rm caddy caddy hash-password --plaintext 'ваш-пароль'
```

- У `STAGING_ENV_FILE`: `STAGING_BASIC_AUTH=<хеш $2a$...>` (хеш **як є**, `$` не подвоювати)
- У секретах Environment `staging`: `STAGING_BASIC_AUTH_PASSWORD=<той самий пароль, відкритим текстом>`
  — потрібен лише для того, щоб smoke-check у CI міг достукатись до сайту. Без нього деплой
  впаде з 401 і скаже вам про це прямо.

Логін: `staging`. `/health` навмисно **не** під паролем — щоб працювали smoke-check і
uptime-моніторинг.

### 7.5 Заповнити Environment

**`staging`** (розділ 6) — і, коли дійде до прода, **`production`**:

| Тип      | Ім'я                                        | Що це                                |
| -------- | ------------------------------------------- | ------------------------------------ |
| Secret   | `SSH_HOST` / `SSH_USER` / `SSH_PRIVATE_KEY` | доступ до **прод**-сервера           |
| Secret   | `PROD_ENV_FILE`                             | увесь `.env.production` одним блоком |
| Variable | `PROD_DOMAIN`                               | `myshop.com.ua` (без `staging.`)     |

> ⚠ **Обов'язково ввімкніть ручне затвердження** для прода:
> GitHub → Settings → Environments → `production` → **Required reviewers** → додайте себе.
>
> **Це єдиний запобіжник.** У самому workflow його немає й бути не може — прод-деплой
> зупиниться й чекатиме, поки ви натиснете «Approve» в GitHub Actions.

### 7.6 Готово

Наступний push у `develop` сам задеплоїть staging. Прод деплоїться з `main` — і чекатиме
вашого підтвердження.

**Далі обов'язково:** `docs/operations.md`, розділ 7 — чек-лист того, що треба закрити
**до першого реального клієнта** (2FA, бекапи, репетиції, Sentry, SMTP, ключ Нової пошти).

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

Схему БД потім наллє наступний деплой (`prisma migrate deploy`), або вручну:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.staging.yml --env-file .env.production \
  exec -T store-api npx prisma migrate deploy --schema=prisma/schema.prisma
```

---

## Довідка для розробника

- **swagger.json.** Образи вітрини/адмінки генерують Orval-хуки **всередині
  збірки** з файлу `apps/store-api/swagger.json`. Цей файл **у git ігнорується**,
  тому пайплайн `deploy-staging` **регенерує його на раннері перед `docker build`**
  (`npm ci` → `prisma generate` → `npm run swagger:export -w apps/store-api` з
  тимчасовим Postgres і dummy-секретами JWT). Без цього кроку `docker build`
  вітрини/адмінки впав би на `generate:api`.
- **Чому `migrate deploy`, а не `db push` (TASK-303).** Раніше тут було `db push
--accept-data-loss`, бо історія міграцій **не потрапляла в git** (`.gitignore`
  ігнорував усі датовані папки). Це виправлено: усі 15 міграцій закомічені, і staging
  тепер накочує схему **тією самою командою, що й прод**. Це принципово — staging є
  репетицією лише тоді, коли репетирує справжню процедуру.
  Різниця критична: `migrate deploy` **ніколи не видаляє дані** і **відмовляється**
  працювати на базі з розбіжною історією — він завалює деплой замість того, щоб мовчки
  перекроїти схему, як це радо робив `db push --accept-data-loss`.
- **Разова дія при переході.** Старий staging-том створювався через `db push`, тож у
  ньому немає службової таблиці `_prisma_migrations`. Перший `migrate deploy` на ньому
  впаде з «relation already exists». Це очікувано: один раз свідомо стерти том
  (`down -v`, розділ 8) — staging-дані одноразові.
- **CLI `prisma` в образі.** Рантайм-образ `store-api` містить CLI `prisma`:
  його внесено у прод-залежності (`dependencies`, версія 7.8), тож він переживає
  `npm prune --omit=dev` і «запікається» в образ. Тому `migrate deploy` запускає
  локальний бінарник — без завантаження з мережі й від імені звичайного (non-root)
  користувача. Якщо колись побачиш «prisma: not found» — переконайся, що `prisma`
  лишається у `dependencies` (а не `devDependencies`) у `apps/store-api/package.json`.
- **Ніколи не запускай `prisma migrate dev` проти staging/прод.** `migrate dev` —
  команда для локальної розробки: побачивши розбіжність, вона пропонує **скинути базу**.
  На сервері використовується виключно `migrate deploy`.
- **Одноразові образи staging.** `NEXT_PUBLIC_*` «запікаються» у бандл на етапі
  збірки, тож образ прив'язаний до домену staging і **не** може бути промоутнутий
  у прод — прод збирає свої образи (TASK-272).
