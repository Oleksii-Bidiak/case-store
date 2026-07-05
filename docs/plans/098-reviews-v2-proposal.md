# Plan 098 — Reviews v2: бенчмарк та пропозиція (TASK-220, discovery)

**Тип:** discovery / proposal (без коду)
**Створено:** 2026-07-05
**Базується на:** реалізованому модулі відгуків (план [089](089-product-reviews.md), TASK-106 + TASK-078)
**Звʼязані напрями:** TASK-192 (CRM-адмінка), план [093](093-image-preoptimization-sharp.md) (image pipeline)

---

## 1. Поточний стан

Модуль відгуків **уже реалізований** (план 089 виконано). Факти з коду:

### Модель даних (`apps/store-api/prisma/schema.prisma`, рядки 301–317)

`Review`: `rating Int (1–5)`, `comment String?`, `isActive Boolean @default(false)` (гейт модерації),
`@@unique([userId, productId])` — один відгук на користувача на товар, назавжди.
**Немає:** фото, відповідей магазину, голосів "корисно", enum-статусу, поля `editedAt`.

### Backend (`apps/store-api/src/review/`)

- `review.controller.ts` — `POST /api/products/:productId/reviews` (JwtAuthGuard,
  `@Throttle({ limit: 10, ttl: 60000 })` — окремий ліміт нижче глобального 100/60с) та публічний
  `GET` (пагінований список схвалених + агрегат).
- `admin-review.controller.ts` — черга модерації (`?status=pending|approved`),
  `PATCH :id/approve`, `DELETE :id`. **Reject = hard delete** — рядок зникає безслідно,
  унікальний слот звільняється, аудиту немає.
- `review.service.ts` — 409 при повторному відгуку (pre-check + P2002), премодерація
  (`isActive: false` при створенні).
- `review.repository.ts` — `isVerifiedPurchase(userId, productId)`:
  `orderItem.findFirst({ where: { productId, order: { userId } } })`.
  **Звʼязка order×review існує** — бейдж "Підтверджена покупка" вже працює. Але:
  1. запит **не фільтрує статус замовлення** — скасоване (`CANCELLED`) чи повернене
     (`REFUNDED`) замовлення теж дає бейдж;
  2. бейдж обчислюється **на кожен рядок списку при кожному запиті** (N+1, обмежений
     `limit ≤ 50`) — не персиститься.

### Користувацькі можливості (те, чого немає)

- **Редагування/видалення власного відгуку — відсутнє.** Жодного `PATCH`/`DELETE` для автора.
  Єдиний шлях "переписати" — попросити адміна відхилити (hard delete).
- **Повторний відгук після нової покупки — неможливий** через `@@unique([userId, productId])`.

### Storefront (`apps/store-client/src/widgets/product-reviews/ui/product-reviews-widget.tsx`)

- Агрегат (зірки + кількість), список відгуків, бейдж покупки, форма
  (`features/submit-review`, auth-gated).
- Автор показується як `dict.reviews.anonymous` — **імена не відображаються взагалі**, хоча
  публічний `ReviewEntity` (`src/review/entities/review.entity.ts`) при цьому **віддає
  `userId` автора назовні** (зайвий витік ідентифікатора без жодної користі для UI).
- Пагінація захардкоджена: `page: 1, limit: 10` — **немає UI пагінації**, 11-й відгук
  недосяжний.
- **Немає** розбивки рейтингу по зірках (гістограми), фільтра за оцінкою, сортування.

### Rate limiting (`apps/store-api/src/throttler/`)

Глобально 100 req/60с; сховище — Redis (`RedisThrottlerStorage`, префікс `throttle:`,
fail-open) коли заданий `REDIS_HOST`, інакше in-memory. Готова інфраструктура для
специфічних лімітів на відгуки.

### Image pipeline (план 093)

`ImageProcessor` (sharp) у `apps/store-api/src/storage/`: WebP-перекодування + LQIP
`blurDataUrl`; `LocalDiskStorageService` (`/uploads/products/…`). Готовий до перевикористання
для фото у відгуках.

---

## 2. Бенчмарк

| Механіка                            | Rozetka                                                                   | Amazon                                              | UA-конкуренти (Comfy/Allo)            | Shopify-апки (Judge.me/Loox)                  | **Наш стан**                              |
| ----------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------- | --------------------------------------------- | ----------------------------------------- |
| Редагування після публікації        | Ні (тільки через підтримку)                                               | Так, будь-коли через профіль (Community activity)   | Ні                                    | Через магазин/лінк                            | **Немає**                                 |
| Публічна відповідь магазину         | Так (продавець відповідає у гілці)                                        | Так (seller reply)                                  | Так (представник відповідає)          | Так (store reply, AI-підказки)                | **Немає**                                 |
| Повторний відгук на той самий товар | Гілка коментарів під відгуком                                             | Один відгук на товар (редагований)                  | Один відгук                           | Один на замовлення                            | **Один назавжди (unique)**                |
| Спам-захист                         | Бот + жива модерація 100% відгуків; можуть запросити чек/номер замовлення | Гейт: ≥ $50 покупок за 12 міс.; guidelines-фільтри  | Премодерація ~1 доба, фільтр лексики  | Модерація в кабінеті, авто-публікація опційна | **Премодерація + throttle 10/хв**         |
| Фото/відео                          | Так, з правилами вмісту (без водяних знаків тощо)                         | Так                                                 | Фото (Comfy: "Прикріпити зображення") | Так, у Loox — фото-first                      | **Немає**                                 |
| Голоси "корисно"                    | Так (👍/👎)                                                               | Так ("Helpful", впливає на ранжування)              | Частково                              | Так                                           | **Немає**                                 |
| Бейдж перевіреної покупки           | "Відгук покупця" + бонусні ₴ за відгук покупцям (до 10/міс)               | "Verified Purchase" (не дається при великій знижці) | Так                                   | Verified badge з замовлення                   | **Є, але без фільтра статусу замовлення** |
| Розбивка рейтингу (гістограма)      | Так + фільтр за зірками                                                   | Так (% на кожну зірку, клікабельно)                 | Так                                   | Так                                           | **Тільки середнє + кількість**            |
| Плюси/мінуси окремими полями        | Так                                                                       | Ні                                                  | Так (Comfy: "Переваги"/"Недоліки")    | Ні                                            | **Немає**                                 |

Джерела: [Rozetka — правила відгуків](https://rozetka.com.ua/ua/pages/kommentarii_otzivy/),
[Rozetka — бонусні гривні за відгуки](https://help.rozetka.com.ua/p/67-yak-otrymaty-bonusni-hryvni-za-vidhuky/),
[Amazon — Edit Your Reviews](https://www.amazon.com/gp/help/customer/display.html?nodeId=G5VY882PY3GFTN6Z),
[Amazon — Verified Purchase](https://www.amazon.com/gp/help/customer/display.html?nodeId=G75XTB7MBMBTXP6W),
[Amazon — Reviews & Ratings](https://www.amazon.com/gp/help/customer/display.html?nodeId=G8UYX7LALQC8V9KA),
[Comfy — як залишити відгук](https://faq.comfy.ua/leave-feedback/),
[Comfy — які відгуки публікують](https://faq.comfy.ua/forbidden/),
[Judge.me](https://judge.me/), [Judge.me vs Loox](https://judge.me/compare/loox-vs-judgeme).

---

## 3. Пропозиції

### 3.1 Статусна модель замість hard delete (передумова для всього іншого) — **S**

Reject-як-delete блокує: історію модерації, повідомлення автору "відгук відхилено",
ре-модерацію після редагування. Мінімальна міграція:

```prisma
enum ReviewStatus { PENDING APPROVED REJECTED }
// Review:
status     ReviewStatus @default(PENDING) @map("status")
// isActive лишається на перехідний період: isActive === (status === APPROVED)
```

Backfill: `isActive: true → APPROVED`, `false → PENDING`. Reject більше не звільняє
унікальний слот — але його звільняє редагування (3.2). `@@index([status])` замінює
`@@index([isActive])`.

### 3.2 Вікно редагування — **S**

**Рекомендація: автор може редагувати/видаляти свій відгук протягом 48 годин** після
створення (далі — тільки видалення).
Чому 48 год: Amazon дозволяє редагувати безстроково, але в нас премодерація — безстрокове
редагування означає нескінченні повторні проходи через чергу. 48 год покриває головні кейси
(виправити одруківку, змінити думку після перших вражень) і тримає навантаження на
модерацію передбачуваним. Rozetka/Comfy взагалі не дають самостійного редагування — 48 год
уже конкурентна перевага.

- `PATCH /api/products/:productId/reviews/my` та `DELETE .../my` (owner-check по JWT;
  жодних нових полів — `createdAt` + 48h у сервісі, `updatedAt` вже є).
- Редагування скидає `status → PENDING` (ре-модерація) — тому потрібен 3.1.

### 3.3 Відповідь магазину — `ReviewReply` — **M**

Одна офіційна відповідь на відгук (як у Rozetka/Judge.me; гілки-діалоги не потрібні для MVP):

```prisma
model ReviewReply {
  id        String   @id @default(uuid())
  reviewId  String   @unique @map("review_id")
  review    Review   @relation(fields: [reviewId], references: [id], onDelete: Cascade)
  authorId  String   @map("author_id") // адмін-користувач
  body      String   // plain text, max 2000
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  @@map("review_replies")
}
```

`POST/PATCH/DELETE /api/admin/reviews/:id/reply` (AdminGuard); публічний `GET` списку
відгуків вкладає `reply` (label на storefront: "Відповідь магазину"). Відповідь публікується
без модерації (її пише адмін).

### 3.4 Політика повторного відгуку — **S** (політика, без схеми)

**Рекомендація: залишити один відгук на товар назавжди** (`@@unique` не чіпаємо) — так робить
і Amazon. Повторну покупку покриває вікно редагування + (пізніше) можливість видалити свій
відгук і написати новий. Багато-відгуків-на-користувача (як гілки Rozetka) множить складність
модерації та агрегатів без помітної цінності для нашого асортименту.

### 3.5 Спам-захист і rate limits — **S**

Сьогодні: премодерація + `@Throttle 10/60с` (по IP) + auth-обовʼязковість — уже непогано.
Додати:

- Денний ліміт на користувача: 5 відгуків/добу — Redis `INCR` з TTL 24 год за ключем
  `review:daily:<userId>` (той самий Redis, що й `RedisThrottlerStorage`; fail-open, як там).
- `@Throttle` на майбутні write-ендпоінти (edit, vote, фото-upload) — той самий патерн.
- Мінімальна довжина коментаря для нарахування майбутніх стимулів (як у Rozetka) — не для
  блокування публікації.
- Гейт "тільки покупці" **не** вводимо (рішення плану 089 підтверджується бенчмарком: бейдж
  замість заборони).

### 3.6 Фото у відгуках — **L**

Перевикористовуємо pipeline плану 093 (`ImageProcessor`: sharp → WebP + LQIP;
`LocalDiskStorageService` → `/uploads/reviews/…`):

```prisma
model ReviewImage {
  id          String  @id @default(uuid())
  reviewId    String  @map("review_id")
  review      Review  @relation(fields: [reviewId], references: [id], onDelete: Cascade)
  url         String
  blurDataUrl String? @map("blur_data_url")
  sortOrder   Int     @default(0) @map("sort_order")
  createdAt   DateTime @default(now()) @map("created_at")
  @@index([reviewId])
  @@map("review_images")
}
```

Ліміти: до 3 фото, ≤ 5 МБ, той самий `ALLOWED_MIME_EXT`. Фото модеруються разом з відгуком
(один статус). Multipart-upload у момент сабміту (`POST .../reviews` з файлами) або окремим
ендпоінтом до pending-відгуку. Storefront: мініатюри в `ReviewRow` + lightbox. Admin: прев'ю
в черзі модерації (обовʼязково — фото і є головним спам/NSFW-ризиком).

### 3.7 Голоси "корисно" — **M**

```prisma
model ReviewVote {
  reviewId  String   @map("review_id")
  review    Review   @relation(fields: [reviewId], references: [id], onDelete: Cascade)
  userId    String   @map("user_id")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now()) @map("created_at")
  @@id([reviewId, userId])
  @@map("review_votes")
}
// Review: helpfulCount Int @default(0) — денормалізований лічильник для сортування
```

Тільки "корисно" (без 👎 — negативний голос майже не додає сигналу, але подвоює зловживання).
Захист від накрутки: JWT-only, composite PK = один голос на користувача, заборона голосувати
за власний відгук (перевірка в сервісі), `@Throttle` на ендпоінт, транзакція
`vote create + helpfulCount increment`. Сортування списку "Спершу корисні" — друга фаза.

### 3.8 Verified-purchase badge — виправлення — **S**

Факт: звʼязка order×review **вже є** (`ReviewRepository.isVerifiedPurchase`), але:

1. **Баг-кандидат:** додати фільтр статусу —
   `order: { userId, status: { notIn: [CANCELLED, REFUNDED] } }` (enum `OrderStatus`,
   `schema.prisma` рядки 19–27). Зараз скасоване замовлення дає бейдж.
2. **Персистенція:** колонка `verifiedPurchase Boolean @default(false)` на `Review`,
   обчислюється один раз при сабміті — прибирає N+1 у `getApprovedReviews`
   (`review.service.ts`, рядки 124–132) і дає фільтр "тільки покупці" безкоштовно.
3. Прибрати `userId` з публічного `ReviewEntity` (віддавати натомість `authorName` —
   імʼя/ініціал замість поточного суцільного "анонімного" відображення).

### 3.9 Розбивка рейтингу (гістограма) — **M**

Backend: `prisma.review.groupBy({ by: ['rating'], where: { productId, status: APPROVED }, _count })`
→ розширити `ReviewAggregateEntity` полем `distribution: { rating: 1..5, count }[]`.
Storefront: гістограма-бари поруч з агрегатом + клік = фільтр `?rating=5` (новий параметр
`ReviewListQueryDto`). Це найпомітніша UI-різниця між нами і всіма чотирма бенчмарками.

---

## 4. Модерація в адмінці (напрям CRM, TASK-192)

Поточна черга (`store-admin`, `widgets/review-moderation`) — таблиця pending|approved з
Approve/Reject. Для v2 потрібно:

- **Статуси**: третя вкладка `rejected` (після 3.1) — історія відхилень замість зникнення.
- **Фільтри**: за оцінкою (1–2 зірки = пріоритет), "з фото", "повторно на модерації"
  (відредаговані), за товаром.
- **Reply UI**: інлайн-форма відповіді магазину прямо в рядку черги + індикатор
  "без відповіді" на негативних відгуках (ключова CRM-метрика: час відповіді).
- **Прев'ю фото** в черзі (див. 3.6).
- **Bulk-дії**: масове approve для безфотних 4–5-зіркових відгуків.
- **Контекст автора**: кількість відгуків користувача, чи покупець — сигнали накрутки.

---

## 5. Фазування + рекомендація

| Фаза                             | Обсяг                                                                                                                                          | Effort | Що дає                                                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| **1. Гігієна + швидкі перемоги** | 3.1 status enum, 3.8 verified-badge fix (статус замовлення + персистенція + `authorName`), 3.2 edit window 48h, пагінація списку на storefront | S+S+S  | Виправляє фактичні дефекти (бейдж по скасованих, недосяжні відгуки >10), аудит модерації, перша "велика" механіка |
| **2. Довіра і діалог**           | 3.3 ReviewReply + reply UI в адмінці, 3.9 гістограма рейтингу, 3.5 денні ліміти                                                                | M+M+S  | Паритет з Rozetka/Comfy у найпомітніших місцях PDP; CRM-цінність (TASK-192)                                       |
| **3. UGC-медіа та ранжування**   | 3.6 фото (pipeline 093), 3.7 helpful votes + сортування "корисні"                                                                              | L+M    | Соціальний доказ рівня Loox; потребує фаз 1–2 (модерація фото — через статуси)                                    |

**Рекомендація:** починати з Фази 1 — вона дешева, лагодить два реальні дефекти
(verified-badge без фільтра статусу; список, обрізаний до 10) і закладає статусну модель,
без якої і edit window, і reply, і фото впираються в hard-delete-модерацію. Стимули за
відгуки (бонуси, як у Rozetka/Comfy) свідомо винесені за дужки — потребують програми
лояльності, якої в нас немає.
