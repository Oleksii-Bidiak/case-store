# Аудит форм вітрини й адмінки — 2026-11-12

> TASK-1984 (SF-ACC-36, D22). Лише читання, `develop@379fa7ef`: 10 агентів по групах, 73 форми.
> Стандарт, який з цього випливає, — правила 5–7 у [`docs/conventions/forms.md`](../conventions/forms.md).
> Застосування — TASK-1985 (і TASK-744, TASK-407), `/orders/new` з однослівним іменем — TASK-2398.

**Позначки збігу правил:** `=` правила збігаються · `К<С` клієнт м'якший (сервер поверне 400) · `К>С` клієнт суворіший · `≠` правила різні · `К∅` на клієнті правила немає.

## Наскрізні причини

1. **Телефон.** `isValidUAPhone` (вітрина) і `@IsUaPhone` (API) спершу викидають усі нецифрові символи, тому `050 111 2233 ccc` проходить. `@IsInternationalPhone` такий номер відхиляє через `PHONE_SHAPE`. Профіль перевіряє номер на клієнті за UA-правилом, а на сервері — за міжнародним (SF-ACC-36). Телефони пункту самовивозу й контактів магазину не перевіряються ніде («222фіфів»). В адмінці маски немає взагалі.
2. **Помилки сервера.** Глобальний фільтр склеює помилки class-validator в один рядок (`message.join('; ')`). Клієнти або показують загальний тост, або шукають назву поля regex-ом в англійському тексті (`create-order-error.ts`, `isWaybillRejection`, `repair-error.ts`, `return-resolve-form`). Під поле 400 потрапляє лише в `product-restore-dialog`, `return-decide`, `return-repair`.
3. **Довжини.** У більшості схем немає `.max()`, що відповідав би `@MaxLength` у DTO (імена 100/120, адреса 500, пошта 254, URL 500), а `"   "` проходить `min(1)`.
4. **Дублі.** Форми персоналу й ТТН показують одну помилку і під полем, і тостом.
5. **Автозаповнення.** `:-webkit-autofill` не стилізований у жодному застосунку.

## Зведена таблиця

### Вітрина

| Форма                                     | zod                 | DTO                                   | 📞 / ✉ / ₴ / 📅                                                                                                  | Помилка сервера                                   | Маска         |
| ----------------------------------------- | ------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------- |
| checkout-view (крок 1–2)                  | checkout-schema     | create-order → address, guest-contact | 📞≠ (UA проти intl, літери) · ✉К<С (нема max 254) · імена/місто/адреса К<С (нема max 100/120/500, « » проходить) | банер з англійським текстом сервера, без setError | PhoneInput    |
| apply-discount                            | discount-schema     | preview-discount                      | —                                                                                                                | під полем, але сирий англійський текст            | —             |
| account-setup-form                        | inline              | checkout-account                      | —                                                                                                                | будь-яка 400 показується як «посилання мертве»    | —             |
| profile-form                              | profile-schema      | update-profile                        | 📞≠ (клієнт UA, сервер intl, `ccc` проходить) · нема max 30                                                      | **тост** `updateError`                            | **немає**     |
| change-password-form                      | inline              | change-password                       | —                                                                                                                | банер; 401 не під «поточним паролем»              | —             |
| change-email-form                         | change-email-schema | email-change                          | ✉=                                                                                                               | банер; 409 «зайнята» не під полем                 | —             |
| login / forgot / reset / checkout-sign-in | inline ×4           | login, reset…                         | ✉К<С (нема trim/254)                                                                                             | банер (свідомо, захист від перебору)              | —             |
| register-form                             | inline              | register                              | ✉К<С · імена: обов'язкові на клієнті й необов'язкові в DTO                                                       | банер; 409 не під пошту                           | —             |
| contact-form                              | contact-schema      | create-contact-message                | 📞 К<С (`@IsUaPhone` теж пропускає літери) · ✉≠                                                                  | банер                                             | formatUAPhone |
| info-contact-form                         | info-contact-schema | create-contact-message                | 📞 К<С · ✉≠                                                                                                      | банер, 429 без окремого тексту                    | formatUAPhone |
| newsletter-subscribe                      | newsletter-schema   | subscribe                             | ✉≠ (нема max)                                                                                                    | рядок статусу, 400 не розрізняється               | —             |
| submit-review-form                        | review-schema       | create-review                         | —                                                                                                                | **тост**                                          | —             |
| order-lookup-form                         | order-lookup-schema | order-lookup                          | 📞К>С, літери                                                                                                    | банер (свідомо: без підказок для перебору)        | PhoneInput    |
| return-request-button                     | — (useState)        | create-return                         | причина: нема maxLength 1000                                                                                     | **тост**                                          | —             |

### Адмінка

| Форма                                                                                                                  | zod                      | DTO                               | 📞 / ✉ / ₴ / 📅                                                                                                      | Помилка сервера                                                         | Маска                |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------- |
| order-create-form                                                                                                      | create-order-schema      | create-manual-order               | 📞= intl · ✉К<С (regex м'якший за @IsEmail) · ₴= · нема max 100/120/500/20 · **splitName → lastName=''** (TASK-2398) | setError лише для приміток (regex по англійському тексту), решта — тост | немає (type=tel)     |
| order-address-form                                                                                                     | address-schema           | update-order-details              | 📞= · ₴= · нема max                                                                                                  | тост                                                                    | —                    |
| order-details-form (ТТН)                                                                                               | order-details-schema     | update-order-details              | —                                                                                                                    | ТТН одночасно під полем **і** тостом                                    | —                    |
| record-receipt / payout / correction                                                                                   | — (useState)             | order-money                       | ₴= (parseKop)                                                                                                        | formError-банер, не під сумою                                           | —                    |
| return-create / decide / repair / resolve / reduce-credit                                                              | частково                 | returns dto                       | ₴=                                                                                                                   | decide і repair під полем ✓; resolve — regex; reduce — тост             | —                    |
| site-contact-form                                                                                                      | site-contact-schema      | update-site-contact               | 📞 **без правил з обох боків** · ✉К<С · соцпосилання без схеми й max 500                                             | тост                                                                    | немає                |
| pickup-point-form-dialog                                                                                               | pickup-point-schema      | pickup-point-admin                | 📞 **без правил з обох боків** («222фіфів»)                                                                          | тост                                                                    | немає                |
| delivery-settings-form                                                                                                 | delivery-settings-schema | update-delivery-setting           | ₴К<С (нема max 100000) · назви міст без max 255                                                                      | тост                                                                    | локальний MoneyInput |
| seo-settings / search-synonyms                                                                                         | ✓                        | ✓                                 | URL без max 500                                                                                                      | тост                                                                    | —                    |
| admin login-form                                                                                                       | inline                   | login                             | ✉К>С                                                                                                                 | FormAlert (свідомо)                                                     | —                    |
| AdminPasswordChange / UserPasswordReset / TransferOwnership / PermissionTemplate / ChangeUserEmail / CreateStaffWizard | переважно без zod        | staff/auth dto                    | ✉ local regex ≠ @IsEmail · імена без max 100                                                                         | **поле + тост дублюються**; 409 і 400 не під полем                      | —                    |
| user-notes-panel                                                                                                       | —                        | create-user-note                  | —                                                                                                                    | тост, текст сервера губиться                                            | —                    |
| product-form                                                                                                           | product-schema           | create-product                    | ₴К<С (Infinity, нема перевірки compareAt>price)                                                                      | тост; sku/slug не під полем                                             | немає                |
| addon-delta-panel / addon-service-form                                                                                 | —/✓                      | set-product-delta / addon-service | ₴К<С · опис 300 на клієнті й 2000 у DTO                                                                              | тост, клієнтська помилка теж у тості                                    | ₴                    |
| category / brand / device-brand / device-model / product-group                                                         | ✓                        | ✓                                 | url/`.url()` ≠ `@IsUrl`                                                                                              | тост без тексту сервера                                                 | —                    |
| product-restore-dialog                                                                                                 | inline                   | restore-product                   | —                                                                                                                    | **setError 409 → поле ✓ (еталон)**                                      | —                    |
| discount-form                                                                                                          | discount-schema          | create-discount                   | ₴= 📅= · Infinity                                                                                                    | тост; «код уже є» не під полем                                          | type=number          |
| page / banner / blog-post / blog-category / carousel / faq / home-block                                                | ✓                        | ✓                                 | 📅К>С · readingMinutes 0 при @Min(1) · coverImage `.url()` · title без max 255                                       | тост; slug 409 не під полем                                             | —                    |
| review-reply / message-detail-sheet                                                                                    | inline                   | reply / contact-message           | нема max 2000, порожнє мовчки ігнорується                                                                            | тост                                                                    | —                    |

Форми без полів для введення (status-select, staff-status, role-change, permissions, add-carousel-to-home, notification-settings, verify-email, guest-account) показують помилку тостом, і це правильно: поля, під яке її покласти, немає (правило 6c).

## Рішення, ухвалені разом зі стандартом (2026-11-12)

- **D1.** `UpdateProfileDto.phone` переходить на `@IsUaPhone`: у профілі покупець вводить свій номер, а вітрина приймає лише UA. Так клієнт = сервер. Рішення TASK-338 про intl для ендпоінтів замовлень лишається.
- **D2.** `@IsUaPhone` отримує перевірку `PHONE_SHAPE`: форма контакту теж відхиляє літери на сервері.
- **D3.** До конверта помилки API додається ключ `fieldErrors` (`exceptionFactory` у ValidationPipe). Зміна сумісна: `message` і `error` не змінюються.
- **D4.** Телефони пункту самовивозу й контактів магазину перевіряються `@IsInternationalPhone` без нормалізації і зберігаються в тому вигляді, як їх ввели (лінії `0 800`).

## Подробиці по формах

Нижче — сирий звіт агентів аудиту (англійською, як зібрано). Номери рядків — станом на `379fa7ef`.

### Вітрина · чекаут (5)

#### `apps/store-client/src/widgets/checkout/ui/checkout-view.tsx`

- **Маршрут:** /checkout (guest and signed-in; no separate /orders/new in storefront)
- **zod:** apps/store-client/src/features/checkout/model/checkout-schema.ts (checkoutFields + superRefine refineDelivery/refineGuestEmail; checkoutSchemaFor(isGuest,{courierCityFixed}))
- **DTO:** apps/store-api/src/order/dto/create-order.dto.ts CreateOrderDto -> address.dto.ts AddressDto (shippingAddress) + checkout-contact.dto.ts CheckoutContactDto extends guest-contact.dto.ts GuestContactDto (contact, guests only)

| Поле                                                                                                 | Тип   | Клієнт                                                                                                                                     | Сервер                                                                                                                                                                                                                                                        | Збіг          | Примітка                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| phone (shippingAddress.phone AND contact.phone, same masked value sent to both)                      | phone | min(1) + refine(isValidUAPhone): normalizeUAPhone strips ALL non-digits, then /^380\d{9}$/ (shared/lib/phone.ts:97-110)                    | @Transform(normalizePhone) @IsString @IsNotEmpty @MaxLength(30\|32) @IsInternationalPhone (any country 9-15 digits, PHONE_SHAPE refuses letters) — address.dto.ts:~100, guest-contact.dto.ts:~50                                                              | different     | By design client is UA-only and stricter than server (international). But client regex is not the same as server rule and normalize lets letters through: '050 111 2233 ccc' normalises to 380501112233 and passes client; PhoneInput mask (formatUAPhone) usually strips letters so only paste/autofill/programmatic hits it, yet server PHONE_SHAPE would 400 on it. No shared validator; client regex lives in client lib only, DTO uses decorator — no single regex source. |
| email (contact.email, guest only)                                                                    | email | z.string().optional() base; guest refine: trim, required message, z.string().email() (checkout-schema.ts:~160). No max length              | @IsEmail @MaxLength(254) @Transform(normalizeEmail) (guest-contact.dto.ts)                                                                                                                                                                                    | client-looser | No 254 max on client; >254 chars passes client, 400 from server. Zod email vs validator.js isEmail may differ on edge cases (e.g. quoted locals, unicode). Client does not lower-case on submit (only .trim() in use-checkout.ts submitOrder); server normalises — fine.                                                                                                                                                                                                        |
| firstName / lastName (shippingAddress.firstName, lastName; contact.name = `${first} ${last}`.trim()) | other | z.string().min(1) each; no trim, no max; plain <Input> without maxLength                                                                   | AddressDto: @IsString @IsNotEmpty @MaxLength(100) each; GuestContactDto.name: @MinLength(1) @MaxLength(120) with trim transform                                                                                                                               | client-looser | ' ' (spaces) passes client min(1); address ok but guest contact.name trims to empty -> 400 'A name is required' shown as generic banner not under the field. first(100)+last(100) can exceed contact.name 120 -> 400. 101+ char name passes client, 400 on server.                                                                                                                                                                                                              |
| city / deliveryAddress (address.city, address1)                                                      | other | z.string() + superRefine required (trimmed) per delivery branch; no max                                                                    | AddressDto city @IsNotEmpty @MaxLength(100); address1 @IsNotEmpty @MaxLength(500)                                                                                                                                                                             | client-looser | No max on city (100) / deliveryAddress / courierStreet+House+Apartment composed into address1 (500). Pickup branch sends point.city/address (server data) so no field-level check.                                                                                                                                                                                                                                                                                              |
| notes                                                                                                | other | z.string().max(500) + counter 0/500 (checkout-view.tsx:740-760)                                                                            | @IsOptional @IsString @MaxLength(500)                                                                                                                                                                                                                         | same          | Textarea under field error; only checked because it is the one length rule that matches.                                                                                                                                                                                                                                                                                                                                                                                        |
| npCityRef / npWarehouseRef / pickupPointId / deliveryMethod / paymentMethod / createAccount          | other | npCityRef required (as error on city) unless npManual; pickupPointId required for PICKUP; enums for method; createAccount boolean optional | npCityRef @MaxLength(100); pickupPointId @IsUUID('loose'); deliveryMethod @IsEnum; paymentMethod @IsIn allow-list; contact.createAccount @IsBoolean (raw value); cross-rules DELIVERY_*, DISCOUNT_/PAYMENT_ACCOUNT_REQUIRED, ACCOUNT_EXISTS are service-level | same          | Cross-field server rules (disabled method, account required, 409 exists) are handled by outcome enum in use-checkout.ts:~265-275, not mapped to fields.                                                                                                                                                                                                                                                                                                                         |
| discountCode (appliedDiscount.code, from cart)                                                       | other | n/a in checkout; set from applied store                                                                                                    | @MaxLength(64) trim+uppercase                                                                                                                                                                                                                                 | same          | See promo-code form.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| money / date                                                                                         | money | none — no money or date inputs in checkout (totals are display only, shipping computed server-side)                                        | none — client never sends prices                                                                                                                                                                                                                              | same          | n/a                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

- **Де помилка:** Client validation: under the field (<p role=alert> next to each input; phone under PhoneInput; email under input; city under combobox; notes under textarea), focus moves to first error. Server errors: single OrderErrorAlert banner above the step (checkout-view.tsx:645, :793) — not a toast; 400 shows apiErrorMessage(error) i.e. the server's raw (English, e.g. 'A valid phone number is required') sentence or dict.checkout.error400; others dict.common.genericError. Account-required codes map to Ukrainian sentences + tick of createAccount; 409 ACCOUNT_EXISTS swaps the contact block to sign-in.
- **Помилка сервера:** No setError anywhere. use-checkout.ts submitOrder catch (lines ~245-275) classifies into outcome enum (placed/refused/failed/account-exists/account-required); 400 -> 'refused' returns shopper to step 1 with a banner only. A 400 for phone/email/name/city length is not mapped to its field. errorMessage derived at ~use-checkout.ts:360-375.
- **Маска:** phone: PhoneInput (shared/ui/phone-input.tsx, formatUAPhone on value) via Controller; email: plain Input type=email; name/city/address: none
- **Асинхронний сид:** Follows forms.md: defaultValues are static CHECKOUT_DEFAULT_VALUES; profile prefill (use-checkout-prefill.ts) is reset({...defaults,...getValues(),blank fields from profile},{keepDirtyValues:true}) in useEffect keyed to user?.id (Rule 2b/4c). Delivery method moved to shop's first offered method by view after GET /delivery/methods (checkout-view.tsx ~279) via setValue, not useState seed.
- **Дефекти:**
  - apps/store-client/src/shared/lib/phone.ts:97-110 isValidUAPhone: normalize strips all non-digits so letters pass (known); client has its own UA regex, server uses @IsInternationalPhone — two different phone rules, no shared validator
  - apps/store-client/src/features/checkout/model/checkout-schema.ts:~58-59 firstName/lastName min(1) without trim or max(100); whitespace-only name passes client and, for a guest, 400s on server (guest-contact.dto.ts name MinLength(1) after trim)
  - apps/store-client/src/features/checkout/model/use-checkout.ts:~217 contact.name = first+last unbounded vs GuestContactDto.name @MaxLength(120) while AddressDto allows 100+100
  - checkout-schema.ts email: no max(254) (guest-contact.dto.ts @MaxLength(254)); city no max(100); deliveryAddress/courier* no max(500)
  - use-checkout.ts:~245-275,~360-375 server 400 never mapped to fields (no setError); shows raw English server message in banner (checkout-view.tsx:645/793)
  - features/checkout/model/checkout-schema.ts: no 'recipient same as customer' checkbox exists in storefront checkout (recipient == contact: name/phone reused for contact) — the TASK-1985/2398 duplication concern is admin /orders/new, not here
  - delivery-branch-fields.tsx / checkout-address-form.tsx: inputs have no maxLength attribute

#### `apps/store-client/src/features/apply-discount/ui/apply-discount.tsx`

- **Маршрут:** /cart (and order summary in /checkout)
- **zod:** apps/store-client/src/features/apply-discount/model/discount-schema.ts
- **DTO:** apps/store-api/src/discount/dto/preview-discount.dto.ts PreviewDiscountDto

| Поле | Тип   | Клієнт                                                  | Сервер                                                            | Збіг | Примітка                                                                                                  |
| ---- | ----- | ------------------------------------------------------- | ----------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------- |
| code | other | z.string().trim().min(1).max(64).transform(toUpperCase) | @IsString @IsNotEmpty @MaxLength(64) @Transform(trim+toUpperCase) | same | Client and server agree; max(64) matches. Code is non-focus-field kept only because it is the sole field. |

- **Де помилка:** Client validation under the input (errors.code, id discount-code-error); API errors also under the input (discount-code-api-error, role=alert) by status/code map (403, 429, errorCode in dict.discounts.errors, 4xx server message, generic). Not a toast. No money/phone/email/date fields; applied amount shown via formatMoney (display only).
- **Помилка сервера:** No setError; preview.error is derived to a message rendered under the field (apply-discount.tsx:~118-130). Effectively field-level display without RHF mapping. 5xx -> generic, 4xx -> server's raw sentence (may be English).
- **Маска:** none (autoCapitalize=characters; value uppercased by zod transform at submit)
- **Асинхронний сид:** n/a — static defaultValues {code:''}; reset({code:''}) on success
- **Дефекти:**
  - apply-discount.tsx:~118-130 4xx fallback renders raw API message (possibly English) under the field
  - Input is uppercased only on submit, not shown uppercased while typing (cosmetic)

#### `apps/store-client/src/features/auth/ui/account-setup-form.tsx`

- **Маршрут:** /account-setup?token=...
- **zod:** inline setupSchema in apps/store-client/src/features/auth/ui/account-setup-form.tsx (customerPasswordSchema from shared/lib/password-policy.ts + passwordConfirm refine)
- **DTO:** apps/store-api/src/auth/dto/checkout-account.dto.ts ConfirmAccountSetupDto

| Поле     | Тип   | Клієнт                                                               | Сервер                                                                                  | Збіг | Примітка                                                                                                    |
| -------- | ----- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------- |
| password | other | min(8) + regex /^(?=._\p{Ll})(?=._\d).*$/u (CUSTOMER_PASSWORD_REGEX) | @IsCustomerPassword = MinLength(8) + Matches(same regex) (password-policy.decorator.ts) | same | Regex duplicated in both apps (mirrored, comment says so) — no shared source. No max length on either side. |
| token    | other | from query string; missing -> inline alert, form not rendered        | @IsString @IsNotEmpty                                                                   | same | n/a                                                                                                         |

- **Де помилка:** Client validation under fields (AuthField error prop). Server errors in one role=alert paragraph above buttons: 400 -> 'link dead' + link to /forgot-password, 429 -> too many, else generic. No toast. No phone/email/money/date.
- **Помилка сервера:** No field mapping: 400 is always 'link invalid' (ACCOUNT_SETUP_INVALID), a password policy 400 cannot occur after client validation, but if it did it would be reported as a dead link (account-setup-form.tsx:~100-107).
- **Маска:** none (password inputs)
- **Асинхронний сид:** n/a — static defaultValues, token from URL
- **Дефекти:**
  - account-setup-form.tsx:~100-107 any 400 treated as dead link; a policy-mismatch 400 (client/server drift) would be mislabelled
  - 'Пропустити' bypasses form validation by design (separate mutate without password)

#### `apps/store-client/src/features/checkout/model/use-checkout-email-status.ts`

- **Маршрут:** /checkout (guest)
- **zod:** none (uses z.string().email().safeParse inline, use-checkout-email-status.ts:~14)
- **DTO:** apps/store-api/src/auth/dto/checkout-account.dto.ts CheckoutEmailStatusDto

| Поле  | Тип   | Клієнт                                                              | Сервер                                              | Збіг          | Примітка                                                                                                                                    |
| ----- | ----- | ------------------------------------------------------------------- | --------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| email | email | normalize trim+lowercase, z.string().email() before probing; no max | @IsEmail @MaxLength(254) @Transform(normalizeEmail) | client-looser | Not a submit form — silent probe on blur; failures leave answer unknown, never surfaced. >254 chars passes the client guard, 400 swallowed. |

- **Де помилка:** None for the probe; result drives a sign-in block / createAccount checkbox, errors swallowed by design.
- **Помилка сервера:** n/a (intentionally ignored)
- **Маска:** none
- **Асинхронний сид:** n/a — answer keyed by address in useState (known {email,hasAccount}); not a form seed, stale answers ignored by key
- **Дефекти:**
  - Inline sign-in at checkout (widgets/checkout/ui/checkout-sign-in.tsx) renders a login form inside the contact block — owned by auth group, not audited here

#### `apps/store-client/src/features/guest-order-account/ui/create-guest-account.tsx`

- **Маршрут:** /orders/guest/[token] and checkout guest success panel
- **zod:** none (no zod, no inputs — button only)
- **DTO:** none (POST /orders/guest/:token/account takes the token path param; not traced to a body DTO)

| Поле  | Тип   | Клієнт                                            | Сервер | Збіг           | Примітка       |
| ----- | ----- | ------------------------------------------------- | ------ | -------------- | -------------- |
| email | email | display only (button label) — from order snapshot | n/a    | no-client-rule | No user input. |

- **Де помилка:** Inline role=alert text under the button: 429 -> tooMany, ACCOUNT_EXISTS 409 -> sign-in link, else generic. No toast.
- **Помилка сервера:** By status/code to message; no fields exist.
- **Маска:** none
- **Асинхронний сид:** n/a

> **Не досліджено / сумнівно:** Storefront has no 'Одержувач — той самий клієнт' checkbox in checkout (TASK-1984/1985/2398 are the admin /orders/new form, belongs to the admin orders group); not found in apps/store-client. · POST /orders/guest/:token/account DTO and cart discount preview endpoint's controller not traced beyond PreviewDiscountDto (only the DTO was read). · Checkout inline sign-in form (widgets/checkout/ui/checkout-sign-in.tsx) delegates to auth group's login form; not read. · PhoneInput's actual letter-stripping behaviour (formatUAPhone body, phone.ts:78-90) not read in full; letters-pass finding for phone is based on normalizeUAPhone only. · order-payment-panel.tsx / checkout-payment.tsx are radio/payment-handoff controls with no validated inputs; not enumerated as separate forms.

### Вітрина · кабінет (3)

#### `apps/store-client/src/features/profile/ui/profile-form.tsx`

- **Маршрут:** /account (Особисті дані section; PUT /api/users/me)
- **zod:** apps/store-client/src/features/profile/model/profile-schema.ts (profileSchema)
- **DTO:** apps/store-api/src/user/dto/update-profile.dto.ts UpdateProfileDto

| Поле      | Тип   | Клієнт                                                                                                 | Сервер                                                                                                                                                     | Збіг            | Примітка                                                                                                                                                                                                                                                                                                                                                                      |
| --------- | ----- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| phone     | phone | z.string().refine(blank \|\| isValidUAPhone).optional() (UA only, /^380\d{9}$/ after normalizeUAPhone) | @Transform(normalizeProfilePhone: blank->null, else normalizePhone) @IsOptional @IsString @MaxLength(30) @IsInternationalPhone (PHONE_SHAPE + 9-15 digits) | client-stricter | Intentionally stricter (UA-only) per comment in schema, but normalizeUAPhone strips all non-digits so '050 111 2233 ccc' / 'abc0501234567' passes client; server PHONE_SHAPE then refuses it with 400 -> only generic toast. Also client allows 30+ chars of separators? no maxLength on input; server MaxLength(30) can 400 on a long but valid number with many separators. |
| email     | email | none - read-only disabled <Input value=user.email>, not registered in RHF, not sent                    | @IsOptional @Transform(normalizeEmail) @IsEmail (repeat-only; change refused in service)                                                                   | no-client-rule  | Not editable here; real change goes through ChangeEmailForm. No issue.                                                                                                                                                                                                                                                                                                        |
| firstName | other | z.string().max(100, msg).optional(); input maxLength=100                                               | @IsOptional @IsString @MaxLength(100)                                                                                                                      | same            | Client sends undefined for '' so a user cannot clear a name (server has no null path for names, partial update) - emptied name silently ignored, form stays dirty->pristine after refetch.                                                                                                                                                                                    |
| lastName  | other | z.string().max(100, msg).optional(); input maxLength=100                                               | @IsOptional @IsString @MaxLength(100)                                                                                                                      | same            | Same as firstName: cleared value is dropped (\|\| undefined).                                                                                                                                                                                                                                                                                                                 |

- **Де помилка:** field (client, <p role=alert> under each input) + toast (server, dict.account.updateError)
- **Помилка сервера:** profile-form.tsx:60-62 onError -> generic toast.error(dict.account.updateError); no setError, no apiErrorMessage; a 400 on phone shows no field message
- **Маска:** none - plain <Input type=tel> via register('phone'); PhoneInput/formatUAPhone not used (profile-form.tsx:~128-141)
- **Асинхронний сид:** follows forms.md Rule 2a: useForm({values, resetOptions:{keepDirtyValues:true}}) seeded from user prop (profile-form.tsx:36-46)
- **Дефекти:**
  - profile-form.tsx:128 phone input is unmasked (no PhoneInput) while checkout/contact use mask
  - profile-form.tsx:60-62 server 400 (e.g. phone) goes to generic toast, not mapped to the phone field via setError
  - shared/lib/phone.ts:97-107 normalizeUAPhone strips all non-digits, so letters pass isValidUAPhone on client; API PHONE_SHAPE refuses letters -> client/server divergence (profile-schema.ts:36-41)
  - profile-form.tsx:~70-72 firstName/lastName '' -> undefined: cannot clear a name
  - profile-form.tsx: no maxLength/30-char guard matching server @MaxLength(30) on phone
  - client regex is isValidUAPhone (digit-count based), not the same regex as the DTO (PHONE_SHAPE + 9-15 digits); no shared validator

#### `apps/store-client/src/features/auth/ui/change-password-form.tsx`

- **Маршрут:** /account (Безпека card, toggled inline; POST /api/auth/password/change)
- **zod:** apps/store-client/src/features/auth/ui/change-password-form.tsx (inline changePasswordSchema) + apps/store-client/src/shared/lib/password-policy.ts (customerPasswordSchema)
- **DTO:** apps/store-api/src/auth/dto/change-password.dto.ts ChangePasswordDto

| Поле            | Тип   | Клієнт                                                                               | Сервер                                                                                      | Збіг           | Примітка                                                                                                                                                                                             |
| --------------- | ----- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| currentPassword | other | z.string().min(1)                                                                    | @IsString @IsNotEmpty                                                                       | same           | presence only on both sides                                                                                                                                                                          |
| newPassword     | other | customerPasswordSchema: min(8) + CUSTOMER_PASSWORD_REGEX /^(?=._\p{Ll})(?=._\d).*$/u | @IsCustomerPassword (8+, same regex) + service-level STAFF_PASSWORD_REGEX for ADMIN/MANAGER | same           | Regex duplicated by hand in two files (client password-policy.ts and api password-policy.decorator.ts), kept in sync only by comment. Staff on storefront would pass client, 400 server (edge case). |
| confirmPassword | other | z.string() + refine equals newPassword                                               | none (client-only field, not sent)                                                          | no-server-rule | expected                                                                                                                                                                                             |

- **Де помилка:** field (client, via AuthField error) + inline <p role=alert> banner (server: 401 wrong current, else generic); success toast + logout
- **Помилка сервера:** change-password-form.tsx:~108-114 status 401 -> dict errorWrongCurrent banner (NOT attached to currentPassword field); other (incl. 400 policy) -> generic dict.common.genericError banner; no setError, no apiErrorMessage; 400 message from server discarded
- **Маска:** none (no phone/money)
- **Асинхронний сид:** n/a
- **Дефекти:**
  - change-password-form.tsx:~108-114 401 wrong-current-password shown as banner, not under currentPassword field via setError
  - change-password-form.tsx: server 400 on newPassword (e.g. staff-policy rejection, token-bearing message) collapses into generic error, not mapped to newPassword field
  - uses status read directly (changePassword.error?.response?.status) instead of shared apiErrorStatus helper

#### `apps/store-client/src/features/change-email/ui/change-email-form.tsx`

- **Маршрут:** /account (Безпека card, toggled inline; POST /api/auth/email-change/request)
- **zod:** apps/store-client/src/features/change-email/model/change-email-schema.ts (buildChangeEmailSchema)
- **DTO:** apps/store-api/src/auth/dto/email-change.dto.ts RequestEmailChangeDto

| Поле            | Тип   | Клієнт                                                                    | Сервер                                              | Збіг | Примітка                                                                                                                                                     |
| --------------- | ----- | ------------------------------------------------------------------------- | --------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| newEmail        | email | z.string().trim().toLowerCase().email().max(254) + refine != currentEmail | @Transform(normalizeEmail) @IsEmail @MaxLength(254) | same | zod .email() vs class-validator isEmail differ in edge cases (e.g. unicode/quoted local parts) but both normalise trim+lowercase; not verified exhaustively. |
| currentPassword | other | z.string().min(1)                                                         | @IsString @IsNotEmpty                               | same | presence only                                                                                                                                                |

- **Де помилка:** field (client, <p role=alert> under each input) + inline banner (server: 401 wrong password, 409 taken, 429 too many, else generic)
- **Помилка сервера:** change-email-form.tsx:~66-76 status 401/409/429 -> dict banner via apiErrorStatus; not setError: 409 'taken' and 401 'wrong password' are not shown under newEmail / currentPassword fields; 400 -> generic
- **Маска:** none (email, no mask needed)
- **Асинхронний сид:** n/a (currentEmail prop only feeds schema via useMemo; no seeded values)
- **Дефекти:**
  - change-email-form.tsx:~66-76 409 (email taken) is a form-bottom banner, not mapped to the newEmail field; 401 not mapped to currentPassword field
  - change-email-form.tsx:~87 raw <input>/<label> with local fieldClass instead of shared Input/Label (inconsistent with profile-form)
  - server error 400 message never surfaced (generic)

> **Не досліджено / сумнівно:** Saved addresses form: none found under /account (only app/account/{page,orders}); no address-book feature exists in store-client features/widgets · Delete account form: no such form found in storefront account · Notification preferences: AccountSettingsSection topic toggles (widgets/account/ui/account-settings-section.tsx:41-47) are local-only useState checkboxes, not persisted, no DTO (stub, TASK-175); not a real form. Telegram connect (features/telegram-connect, account-notification-channels.tsx) is button-driven with no input fields · widgets/my-devices-manager/ui/my-device-card.tsx:213 has a label text input (rename device, Enter to save) on /devices, not /account; probably belongs to another group; not traced to DTO · widgets/account/ui/account-email-verification.tsx has only a resend button (no fields); features/change-email/ui/email-change-landing.tsx is a token confirm/revert landing, not a field form · Order cancel / return request on /account/orders/[id] (features/cancel-order, features/return-request) belong to the returns/appeals group, not traced here · docs/conventions/forms.md read only the first 120 lines (rules 1-3); rule 4 and any phone/validator sections not read

### Вітрина · auth (7)

#### `apps/store-client/src/features/auth/ui/login-form.tsx`

- **Маршрут:** /login (also sheet, /checkout, /verify-email)
- **zod:** apps/store-client/src/features/auth/ui/login-form.tsx:22 (inline loginSchema)
- **DTO:** apps/store-api/src/auth/dto/login.dto.ts LoginDto

| Поле     | Тип   | Клієнт                | Сервер                                | Збіг          | Примітка                                                                                                                                                          |
| -------- | ----- | --------------------- | ------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| email    | email | z.string().email(msg) | @Transform(normalizeEmail) + @IsEmail | client-looser | No trim/lowercase client-side (server normalizes, so harmless); zod email vs validator.js IsEmail may disagree on edge addresses; no max length on either (login) |
| password | other | z.string().min(1)     | @IsString @MinLength(1)               | same          | Deliberately no password policy on login                                                                                                                          |

- **Де помилка:** field (client, AuthField error under input) + inline banner <p role=alert> (server: 401/429/generic)
- **Помилка сервера:** No setError. login-form.tsx:173-192 maps status only: 401 -> errorInvalid, 429 -> errorTooMany, other -> dict.common.genericError, rendered as one banner under the form; a 400 DTO error is shown as generic text. Appropriate for 401 (anti-enumeration) but no field mapping for 400.
- **Маска:** none (no phone field)
- **Асинхронний сид:** defaultEmail prop (checkout address) passed to useForm defaultValues at login-form.tsx:136, read once at mount. Not server-fetched; checkout-sign-in.tsx mounts/unmounts the form when email changes, so it follows the 'values/reset' rule only by remount. Not violating, but relies on a doc comment contract rather than reset keyed to id.
- **Дефекти:**
  - login-form.tsx:22 inline schema (not in a model/ file), duplicated email rule across 4 auth forms
  - login-form.tsx:185-192 400 from API never mapped to a field; generic banner only
  - login-form.tsx:136 defaultEmail only applied at mount; if the prop changes while mounted the field is stale (documented as intentional)
  - email rule is z.string().email with no trim: ' a@b.com ' fails client but server would accept after normalizeEmail (client stricter on whitespace)

#### `apps/store-client/src/features/auth/ui/register-form.tsx`

- **Маршрут:** /register (also sheet)
- **zod:** apps/store-client/src/features/auth/ui/register-form.tsx:28 (inline registerSchema) + apps/store-client/src/shared/lib/password-policy.ts (customerPasswordSchema)
- **DTO:** apps/store-api/src/auth/dto/register.dto.ts RegisterDto

| Поле            | Тип   | Клієнт                                                                               | Сервер                                                | Збіг           | Примітка                                                                                                                                              |
| --------------- | ----- | ------------------------------------------------------------------------------------ | ----------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| email           | email | z.string().email(msg)                                                                | @Transform(normalizeEmail) @IsEmail @MaxLength(254)   | client-looser  | A 300-char valid address passes client, 400 on server (generic banner)                                                                                |
| firstName       | other | z.string().min(1)                                                                    | @IsOptional @IsString @MaxLength(100)                 | different      | Client requires, server optional; client has no max 100 (101 chars passes client, 400); ' ' (whitespace) passes client min(1), no trim on either side |
| lastName        | other | z.string().min(1)                                                                    | @IsOptional @IsString @MaxLength(100)                 | different      | same as firstName                                                                                                                                     |
| password        | other | customerPasswordSchema: min(8) + CUSTOMER_PASSWORD_REGEX /^(?=._\p{Ll})(?=._\d).*$/u | @IsCustomerPassword (same regex, min 8)               | same           | Regex duplicated by hand in client and API (comment says keep in sync); admin has its own copy                                                        |
| passwordConfirm | other | refine equals password                                                               | not sent                                              | no-server-rule | client-only, fine                                                                                                                                     |
| terms           | other | boolean refine true                                                                  | none                                                  | no-server-rule | Consent not sent or enforced server-side                                                                                                              |
| hpCheck         | other | z.string().optional() no rule; sliced to 255                                         | @Transform trim @IsOptional @IsString @MaxLength(255) | same           | honeypot, intentional                                                                                                                                 |

- **Де помилка:** field (client) + inline banner (server: 409 errorConflict, else generic)
- **Помилка сервера:** No setError. register-form.tsx:133-139: 409 -> d.errorConflict banner (not attached to the email field), any other error incl. 400 validation -> dict.common.genericError. Server per-field messages (email too long, name too long) are discarded.
- **Маска:** none (no phone field)
- **Асинхронний сид:** n/a
- **Дефекти:**
  - register-form.tsx:30 email has no max(254); :31-32 names have no max(100) and no trim, whitespace-only name passes client
  - register-form.tsx:31-32 names required on client but optional in RegisterDto (register.dto.ts:41-52) - rules diverge
  - register-form.tsx:133-139 409 'email exists' should be setError on email field; 400 should map to fields
  - password regex duplicated client/api by hand (password-policy.ts:36 vs password-policy.decorator.ts) - candidate for shared validator

#### `apps/store-client/src/features/auth/ui/forgot-password-form.tsx`

- **Маршрут:** /forgot-password (also sheet)
- **zod:** apps/store-client/src/features/auth/ui/forgot-password-form.tsx:14 (inline forgotSchema)
- **DTO:** apps/store-api/src/auth/dto/request-password-reset.dto.ts RequestPasswordResetDto

| Поле  | Тип   | Клієнт                | Сервер                              | Збіг          | Примітка                                                                             |
| ----- | ----- | --------------------- | ----------------------------------- | ------------- | ------------------------------------------------------------------------------------ |
| email | email | z.string().email(msg) | @Transform(normalizeEmail) @IsEmail | client-looser | Same as login: no trim client-side, validator differences; no max length either side |

- **Де помилка:** field (client) + inline banner (server 429 / generic network text)
- **Помилка сервера:** forgot-password-form.tsx:62-66: isError -> 429 errorTooMany else errorNetwork. Even a 400 is labelled 'network error' (wrong copy). No setError; success always generic (intentional existence-hiding).
- **Маска:** none
- **Асинхронний сид:** n/a
- **Дефекти:**
  - forgot-password-form.tsx:62-66 any non-429 error including 400 validation shows errorNetwork
  - inline schema duplicated with login/register email rule

#### `apps/store-client/src/features/auth/ui/reset-password-form.tsx`

- **Маршрут:** /reset-password?token=
- **zod:** apps/store-client/src/features/auth/ui/reset-password-form.tsx:17 (inline resetSchema) + shared/lib/password-policy.ts
- **DTO:** apps/store-api/src/auth/dto/confirm-password-reset.dto.ts ConfirmPasswordResetDto

| Поле            | Тип   | Клієнт                                          | Сервер                                                                                       | Збіг           | Примітка                                                                                                                                                                               |
| --------------- | ----- | ----------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| newPassword     | other | customerPasswordSchema (min 8 + customer regex) | @IsCustomerPassword; service additionally enforces STAFF regex (uppercase) for ADMIN/MANAGER | client-looser  | A staff account resetting with 'password1' passes client and DTO, then is rejected by AuthService.confirmPasswordReset; client cannot know role. Error would surface as generic banner |
| confirmPassword | other | refine equals newPassword                       | not sent                                                                                     | no-server-rule | client-only                                                                                                                                                                            |
| token           | other | from ?token=, form not rendered if missing      | @IsString @IsNotEmpty                                                                        | same           | not a user field                                                                                                                                                                       |

- **Де помилка:** field (client) + inline banner (server: 401 errorInvalidToken + 'request new link', else generic)
- **Помилка сервера:** reset-password-form.tsx:88-94: 401 -> invalid token banner with link; everything else (incl. 400 weak password for staff) -> dict.common.genericError. No setError onto newPassword.
- **Маска:** none
- **Асинхронний сид:** n/a (token from URL, not form value)
- **Дефекти:**
  - reset-password-form.tsx:88-94 server 400 on newPassword (staff policy) not mapped to the field; user sees generic error
  - reset-password-form.tsx:68-77 early return placed AFTER useForm/hook calls - OK for hooks order, but onSubmit defined after the guard; fine
  - password policy duplicated client/api

#### `apps/store-client/src/features/auth/ui/verify-email-confirm.tsx`

- **Маршрут:** /verify-email
- **zod:** none (no zod, no <form> of its own; auto-submits token from URL in useEffect)
- **DTO:** apps/store-api/src/auth/dto/confirm-email-verification.dto.ts ConfirmEmailVerificationDto

- **Де помилка:** inline banner states (generic error heading/body; 403 VERIFY_SIGN_IN_REQUIRED renders embedded LoginForm)
- **Помилка сервера:** verify-email-confirm.tsx:125-171: 403+code VERIFY_SIGN_IN_REQUIRED -> in-place LoginForm; any other error -> one anti-enumeration message. Intentional; no fields to map.
- **Маска:** none
- **Асинхронний сид:** n/a
- **Дефекти:**
  - No form fields; only embedded LoginForm (see login form row). Token submitted once via requestedTokenRef guard, correct.

#### `apps/store-client/src/widgets/account/ui/account-email-verification.tsx`

- **Маршрут:** /account (resend verification email)
- **zod:** none (resend.mutate() with no body)
- **DTO:** none (POST /api/auth/email/verify/request has no body DTO)

- **Де помилка:** inline <p> on resend.isError (account-email-verification.tsx:62)
- **Помилка сервера:** generic message, no fields
- **Маска:** none
- **Асинхронний сид:** n/a
- **Дефекти:**
  - No input fields; belongs to cabinet group but linked from /verify-email flow. No stand-alone resend form exists on /verify-email itself (the error state only links to /account).

#### `apps/store-client/src/widgets/checkout/ui/checkout-sign-in.tsx`

- **Маршрут:** /checkout
- **zod:** reuses login-form.tsx loginSchema; reset link has no schema (email taken from checkout form)
- **DTO:** LoginDto (login) and RequestPasswordResetDto (reset link)

| Поле               | Тип   | Клієнт                                                                           | Сервер                    | Збіг           | Примітка                                                                                                                                            |
| ------------------ | ----- | -------------------------------------------------------------------------------- | ------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| email (login)      | email | loginSchema email, seeded via defaultEmail from checkout email                   | @IsEmail + normalizeEmail | client-looser  | as login                                                                                                                                            |
| email (reset link) | email | none - passes checkout email string directly to mutate (checkout-sign-in.tsx:41) | @IsEmail + normalizeEmail | no-client-rule | Relies on checkout contact schema having validated the email upstream; if checkout field is invalid/empty, request 400s and shows g.noPasswordError |

- **Де помилка:** login: banner (see login row); reset link: inline <p role=alert> 429 errorTooMany else noPasswordError; success <p role=status>
- **Помилка сервера:** checkout-sign-in.tsx:70-76: 429 vs generic; no field mapping
- **Маска:** none
- **Асинхронний сид:** defaultEmail seed from checkout state: read once at mount (login-form.tsx:136); parent remounts when edited. Satisfies seed-at-mount but not a reset() keyed to id; check against docs/conventions/forms.md.
- **Дефекти:**
  - checkout-sign-in.tsx:41 sendLink sends unvalidated email (no client check before mutation)
  - login-form.tsx:136 defaultEmail one-time seed; staleness depends on parent unmounting

> **Не досліджено / сумнівно:** docs/conventions/forms.md was not read in this audit, so asyncSeed verdicts are judged from the task description only · account-setup-form.tsx (/account-setup, ConfirmAccountSetupDto) and change-password-form.tsx exist in features/auth but are outside the listed sf-auth routes; likely belong to another group, not mapped · auth-sheet.tsx hosts Login/Register/Forgot in sheet mode; no extra fields, not separately mapped · IsEmail (validator.js) vs zod .email() divergence on edge cases not tested, only inferred · Whether a Honeypot field or client email normalizer exists in shared/lib beyond what was read was not checked

### Вітрина · звернення й публічні форми (5)

#### `apps/store-client/src/widgets/contact/ui/contact-form.tsx`

- **Маршрут:** /contact
- **zod:** apps/store-client/src/widgets/contact/model/contact-schema.ts (contactSchema)
- **DTO:** apps/store-api/src/contact/dto/create-contact-message.dto.ts CreateContactMessageDto (POST /api/contact via useContactControllerSubmit)

| Поле               | Тип   | Клієнт                                                                                            | Сервер                                                                                                                   | Збіг          | Примітка                                                                                                                                                                                                                                                                                                                           |
| ------------------ | ----- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| phone              | phone | trim, max(32), refine(isValidUAPhone) -> normalizeUAPhone strips all non-digits then /^380\d{9}$/ | @Transform(normalizePhone) @IsString @MaxLength(32) @IsUaPhone (normalizeUaPhone + /^380\d{9}$/); stored as 380XXXXXXXXX | client-looser | client and server share the same strip-non-digits normalizer, so letters/punctuation pass both ('050 111 2233 ccc' -> valid). Server and client are consistent with each other but the rule is duplicated in two files, not shared in a package; client max(32) is checked on the raw string before normalization, same as server. |
| email              | email | trim, zod .email(), max(255)                                                                      | @Transform(normalizeEmail) (trim+lowercase) @IsEmail @MaxLength(255)                                                     | different     | zod .email() and class-validator isEmail differ in edge cases (e.g. unicode/dotless domains); client does not lowercase, server does (no visible effect). Same messages not shared.                                                                                                                                                |
| name               | other | trim, min(2), max(120)                                                                            | @Transform(trim) @MinLength(2) @MaxLength(120)                                                                           | same          | both bounds use the single nameRequired message on max (too-long name says 'required').                                                                                                                                                                                                                                            |
| message            | other | trim, min(10), max(5000)                                                                          | @Transform(trim) @MinLength(10) @MaxLength(5000)                                                                         | same          | max violation reuses messageRequired text on client.                                                                                                                                                                                                                                                                               |
| topic/orderRef     | other | topic max(60) optional; orderRef trim max(120) optional                                           | topic @MaxLength(60); orderRef @MaxLength(120), both @IsOptional                                                         | same          | orderRef and topic have no rendered error under them: >120 chars blocks submit with an invisible error (orderRef input has no errors.orderRef display, contact-form.tsx ~line 238).                                                                                                                                                |
| website (honeypot) | other | z.string().optional() no limit; clamped to 255 in onSubmit                                        | @IsOptional @MaxLength(255)                                                                                              | same          | intentional, documented (TASK-452).                                                                                                                                                                                                                                                                                                |

- **Де помилка:** field (client): <span role=alert> under name/phone/email/message/consent; server errors: one inline banner <p role=alert> at bottom of form (not a toast), kinds cooldown/rateLimited/failed
- **Помилка сервера:** No setError mapping. contact-form.tsx onSubmit uses submit.mutate without onError; contactSubmitErrorKind (entities/contact/lib/submit-error.ts:23) classifies only cooldown (error code) / 429 / everything else -> generic 'submitFailed'. A 400 with per-field messages (e.g. phone, email) is shown as the generic failure banner, not under the field.
- **Маска:** formatUAPhone applied inline in a Controller on a raw <input type=tel> (contact-form.tsx ~line 166); NOT the shared PhoneInput (intentional, comment says styling). Value in form state stays raw typed string, not normalized.
- **Асинхронний сид:** n/a
- **Дефекти:**
  - contact-form.tsx onSubmit (~line 61-80): server 400 is not mapped to fields; falls to generic banner via submit-error.ts:23-27
  - contact-form.tsx ~238: orderRef input has no error element though schema has max(120); topic max(60) not renderable
  - contact-schema.ts: phone regex duplicated from API (isValidUAPhone vs @IsUaPhone); normalizeUAPhone replace(/\D/g,'') lets letters pass on both ends (no PHONE_SHAPE guard as in the international validator)
  - contact-schema.ts: max() rules reuse the 'required' dict messages (nameRequired, messageRequired, emailInvalid)
  - contact-form.tsx: consent is client-only and never sent; fine, but email is not lowercased before send
  - contact-form.tsx: phone is sent as the raw masked string (values.phone), server normalizes

#### `apps/store-client/src/widgets/info-support/ui/info-contact-form.tsx`

- **Маршрут:** /info
- **zod:** apps/store-client/src/widgets/info-support/model/info-contact-schema.ts (infoContactSchema)
- **DTO:** apps/store-api/src/contact/dto/create-contact-message.dto.ts CreateContactMessageDto (POST /api/contact via useContactControllerSubmit)

| Поле    | Тип   | Клієнт                                           | Сервер                                               | Збіг          | Примітка                                                                                                                                                    |
| ------- | ----- | ------------------------------------------------ | ---------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| phone   | phone | trim, max(32), refine(isValidUAPhone) (TASK-744) | @Transform(normalizePhone) @MaxLength(32) @IsUaPhone | client-looser | same strip-all-non-digits normalizer as /contact: letters pass both sides; rule copy-pasted verbatim from contact-schema.ts (third copy with order-lookup). |
| email   | email | trim, .email(), max(255)                         | @Transform(normalizeEmail) @IsEmail @MaxLength(255)  | different     | zod vs validator.js email edge cases; client does not lowercase.                                                                                            |
| name    | other | trim min(2) max(120)                             | trim MinLength(2) MaxLength(120)                     | same          | max reuses nameRequired text.                                                                                                                               |
| message | other | trim min(10) max(5000)                           | trim MinLength(10) MaxLength(5000)                   | same          | max reuses messageRequired text.                                                                                                                            |

- **Де помилка:** field (client) via <span role=alert> under each field; server errors: single inline banner (<p role=alert>), only 'cooldown' vs generic d.formError (429 rate-limit is NOT distinguished here, unlike /contact)
- **Помилка сервера:** No setError. info-contact-form.tsx:~62 submit.mutate with no onError; uses contactSubmitErrorKind only for cooldown, everything else (400/429/500) -> d.formError. 400 field errors lost.
- **Маска:** formatUAPhone in inline Controller on raw <input type=tel> (~line 100); not PhoneInput
- **Асинхронний сид:** n/a
- **Дефекти:**
  - info-contact-form.tsx ~175-185: error branch maps only cooldown vs formError; rateLimited 429 gets generic copy (contact-form.tsx maps three kinds)
  - info-contact-form.tsx onSubmit: no field mapping of server 400
  - info-contact-schema.ts: phone rule duplicated (third copy) instead of shared validator; letters pass
  - info-contact-form.tsx: no consent checkbox while /contact has one (UX divergence, not validation)

#### `apps/store-client/src/features/newsletter-subscribe/ui/newsletter-subscribe-form.tsx`

- **Маршрут:** embedded (home, promo, footer/blog blocks via source prop)
- **zod:** apps/store-client/src/features/newsletter-subscribe/model/newsletter-schema.ts (newsletterSchema)
- **DTO:** apps/store-api/src/newsletter/dto/subscribe.dto.ts SubscribeDto (POST /api/newsletter/subscribe via useNewsletterControllerSubscribe)

| Поле   | Тип   | Клієнт                                       | Сервер                                             | Збіг           | Примітка                                                                                                                                                                                            |
| ------ | ----- | -------------------------------------------- | -------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| email  | email | trim, toLowerCase, .email() (no max)         | @Transform(normalizeEmail) @IsEmail (no MaxLength) | different      | both sides have no length cap on email (DB column limit unknown); zod .email() vs class-validator isEmail edge cases differ. Order on client: trim then lowercase, server normalizeEmail does same. |
| source | other | not validated (prop passed straight through) | @IsOptional @IsString @MaxLength(50)               | no-client-rule | host-supplied tag >50 chars would 400 with no field to show it on; low risk.                                                                                                                        |

- **Де помилка:** inline status line <p role=alert\|status> under the input (single live region); client zod email error shown first, then server: 429 -> rateLimited text, else generic error. Not a toast.
- **Помилка сервера:** No setError. newsletter-subscribe-form.tsx errorMessage (~line 78): errors.email ? zod message : isError ? (429 ? rateLimited : generic) . A 400 invalid email from server (e.g. zod/validator mismatch) shows generic error, not the email message.
- **Маска:** none (email)
- **Асинхронний сид:** n/a
- **Дефекти:**
  - newsletter-subscribe-form.tsx ~78-84: server 400 not mapped to the email field, collapses to generic error
  - newsletter-schema.ts and subscribe.dto.ts: no max length on email, unlike contact (255)
  - newsletter-subscribe-form.tsx: mutation error is a single status line shared with zod error (field error and server error use the same element; aria-invalid only tied to errorMessage)

#### `apps/store-client/src/features/submit-review/ui/submit-review-form.tsx`

- **Маршрут:** PDP /products/[slug] (reviews section, auth-gated)
- **zod:** apps/store-client/src/features/submit-review/model/review-schema.ts (reviewSchema; REVIEW_COMMENT_MAX=1000 duplicated from API REVIEW_COMMENT_MAX_LENGTH)
- **DTO:** apps/store-api/src/review/dto/create-review.dto.ts CreateReviewDto (POST via useReviewControllerSubmit) and update-review.dto.ts UpdateReviewDto (PATCH :id via useReviewControllerUpdate, review-update.controller.ts:58)

| Поле    | Тип   | Клієнт                                                             | Сервер                                                                                                                             | Збіг | Примітка                                                                                                                                                                                                                                                |
| ------- | ----- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| rating  | other | number int min(1) max(5); starts at 0                              | @IsInt @Min(1) @Max(5) (create only; not sent on update)                                                                           | same | rating is immutable on edit; update body carries only comment.                                                                                                                                                                                          |
| comment | other | string max(1000) optional; textarea maxLength=1000; onSubmit trims | create: trim @IsOptional @IsString @MaxLength(1000); update: trim, ValidateIf(!==undefined) @IsString @IsNotEmpty @MaxLength(1000) | same | schema itself allows empty comment but in edit mode canSaveText gate (line ~192) blocks empty save; whitespace-only counts as empty on both sides after trim. Zod max is on untrimmed string, server on trimmed (1000 spaces + text edge case trivial). |

- **Де помилка:** field (client): rating error under stars (<p role=alert>), comment error under textarea; server errors: toast.error (updateError/submitError/alreadyReviewed on 409) plus an inline 409 <p role=alert> in create mode
- **Помилка сервера:** No setError. submit-review-form.tsx onError (~line 170-187): 409 -> toast alreadyReviewed + refetch mine; any other -> toast.error(submitError); update onError -> toast.error(updateError) for every status incl. 400. Server 400 on comment is a generic toast.
- **Маска:** none (no phone/money/date)
- **Асинхронний сид:** Seeded from useReviewControllerMine via RHF `values` + resetOptions.keepDirtyValues (submit-review-form.tsx ~102-107) and reset(EMPTY_REVIEW) on productId change guarded by lastProductIdRef (~114-120) -> follows forms.md Rule 2a/2b (as stated in the file's comments).
- **Дефекти:**
  - submit-review-form.tsx ~170-187 and update onError: server validation (400) shown only as generic toast, not on comment field
  - review-schema.ts:5 REVIEW_COMMENT_MAX duplicated constant from API instead of shared
  - submit-review-form.tsx: toast is used for 429 (ReviewSubmissionThrottle) too with the generic submitError text (no rate-limit specific copy)
  - review-schema.ts: no .trim() on comment, so zod max counts untrimmed length; edit-mode empty text only guarded by button disabled state, not the schema (no field-level error for an empty edit)

#### `apps/store-client/src/widgets/order-lookup/ui/order-lookup-form.tsx`

- **Маршрут:** /orders/status
- **zod:** apps/store-client/src/widgets/order-lookup/model/order-lookup-schema.ts (orderLookupSchema, normalizeOrderNumber)
- **DTO:** apps/store-api/src/order/dto/order-lookup.dto.ts OrderLookupDto (via useLookupOrder in entities/order)

| Поле   | Тип   | Клієнт                                                         | Сервер                                                                                                                             | Збіг            | Примітка                                                                                                                                                                                                                                                                                             |
| ------ | ----- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| phone  | phone | trim, max(32), refine(isValidUAPhone)                          | @Transform(normalizePhone) @IsString @MaxLength(32); NO @IsUaPhone                                                                 | client-stricter | server accepts any string (e.g. '12345', 'abc') and answers a deliberate generic 404; client blocks non-UA before request. Intentional (anti-enumeration), but then the phone shape error text is a client-only distinction. Letters in phone pass client (digits stripped) e.g. '050 111 2233 ccc'. |
| number | other | trim, max(64), refine(/^[0-9a-f]{8}$/ on normalizeOrderNumber) | @Transform(normalizeOrderNumber) @IsString @MaxLength(64); ORDER_NUMBER_PATTERN exists in DTO file but is not applied as validator | client-stricter | malformed number is rejected client-side but server returns generic 404; normalizeOrderNumber duplicated on both sides with a comment.                                                                                                                                                               |

- **Де помилка:** field (client): <span role=alert> under number and phone; server errors (404 / 429 / generic / empty 200): one inline banner <p role=alert> above the submit button, deliberately NOT mapped to fields (anti-enumeration) and not a toast
- **Помилка сервера:** No setError by design. order-lookup-form.tsx ~158-170: status 404 -> notFound, 429 -> rateLimited, else generic; empty 200 list treated as notFound. A server 400 (e.g. phone >32 chars, number >64) would show generic copy, but client max rules prevent it.
- **Маска:** shared PhoneInput (shared/ui) inside Controller (order-lookup-form.tsx ~226); value in state is raw string
- **Асинхронний сид:** n/a (empty form; results swap in view). Focus managed via focusedFor ref (TASK-626).
- **Дефекти:**
  - order-lookup-schema.ts: client regex 8-hex and phone rule not shared with API; the DTO defines ORDER_NUMBER_PATTERN but never uses it
  - order-lookup-schema.ts phone: isValidUAPhone lets letters pass (strip-all-non-digits)
  - order-lookup-form.tsx: server error mapping intentionally generic; document exception in forms.md standard (security: no field-level oracle) so the 'map server errors to fields' rule carves it out

> **Не досліджено / сумнівно:** No separate 'notify me' / back-in-stock / callback form found in store-client (grep for notify\|callback\|waitlist in tsx returned only unrelated files); not fully traced. · Unsubscribe (POST /newsletter/unsubscribe, UnsubscribeDto) has an API endpoint but I did not locate a storefront form for it; may be a link/page not in this grep (likely /unsubscribe route or token link). · Storefront `features/apply-discount` and `not-found-view`/search forms are outside this group (promo code/search); not audited here. · Did not verify entities/order useLookupOrder hook or generated model file paths, nor dict message text equality with DTO messages; docs/conventions/forms.md was not read in this pass so async-seed rule numbers (2a/2b) are taken from the code comments.

### Вітрина · повернення (1)

#### `apps/store-client/src/features/return-request/ui/return-request-button.tsx`

- **Маршрут:** /account/orders (history) + /account/orders/[id] (order-detail-view) + guest order page /orders/guest/[token] (guest-order-view); same dialog, source={account\|guest}
- **zod:** none (no zod, no react-hook-form; plain useState: quantities, reason, outcome)
- **DTO:** apps/store-api/src/order/returns/dto/create-return.dto.ts : CreateReturnDto (+ ReturnItemDto); account POST /orders/:orderId/returns (return.controller.ts), guest POST /orders/guest/:token/returns (guest-return.controller.ts)

| Поле                | Тип   | Клієнт                                                                                                                                           | Сервер                                                                              | Збіг           | Примітка                                                                                                                                 |
| ------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| items[].quantity    | other | type=number min=0 max=line.remaining; clampQuantity() on change and render; lines with qty 0 filtered out; submit disabled when nothing selected | @IsInt @Min(1); service caps SUM of live claims per line (RETURN_QUANTITY_EXCEEDED) | same           | Client cap derived from fetched ledger; race with another request yields RETURN_QUANTITY_EXCEEDED -> toast + ledger refresh              |
| items[].orderItemId | other | taken from order lines, no user input                                                                                                            | @IsUUID('loose'); ArrayMinSize(1), ArrayMaxSize(200), ValidateNested                | same           | Client guarantees >=1 item via nothingSelected; no client check for 200 max (not reachable)                                              |
| reason              | other | Textarea, no maxLength attribute, no length check; trimmed, omitted when empty                                                                   | @IsOptional @IsString @MaxLength(1000)                                              | client-looser  | Reason >1000 chars passes client, API 400 (generic DTO message) -> generic toast dialog.returnRequest.error; user never learns the limit |
| requestedOutcome    | other | radio group: '' \| REFUND \| REPLACEMENT \| REPAIR ('' not sent)                                                                                 | @IsOptional @IsEnum(ReturnOutcome)                                                  | same           | Enum from generated ReturnOutcome                                                                                                        |
| phone               | phone | no phone field                                                                                                                                   | none in CreateReturnDto (guest identified by token, account by JWT)                 | same           | n/a                                                                                                                                      |
| email               | email | no email field                                                                                                                                   | none in CreateReturnDto                                                             | same           | n/a                                                                                                                                      |
| money               | money | no money field (refund amounts decided by operator)                                                                                              | none in CreateReturnDto                                                             | same           | n/a                                                                                                                                      |
| date                | date  | no date field; 14-day window enforced only server-side (RETURN_ORDER_NOT_RETURNABLE)                                                             | none in DTO; service checks window                                                  | no-client-rule | Client shows trigger per returnable-units/return-policy config; late order only discovered on submit -> toast                            |

- **Де помилка:** No field-level errors at all. Disabled submit + inline hint (nothingSelected) for empty selection; ledger load error as inline role=alert paragraph; all server errors and offline wait: sonner toast (toast.error) or role=status line for offline
- **Помилка сервера:** features/return-request/model/return-error.ts readReturnRequestError (lines 133-147): maps stable RETURN_* codes (QUANTITY_EXCEEDED, ITEM_NOT_IN_ORDER, ORDER_NOT_RETURNABLE, ORDER_NOT_FOUND) via apiErrorCode to Ukrainian toast text; default generic toast. No setError / per-field mapping; a DTO 400 (e.g. reason too long) falls to generic toast. Called at return-request-button.tsx:170-172
- **Маска:** none (no phone/money fields); quantity is native <input type=number> with clamping
- **Асинхронний сид:** n/a for field values (form starts empty). Async ledger (useReturnRequestSource, enabled only while open) drives remaining/max: handled by render-time derivation (returnableLines + clampQuantity) and ledgerSettled disabling inputs, plus render-time guard `if (awaitingNetwork && nothingSelected) setAwaitingNetwork(false)` at :127 - consistent with forms.md render-guard pattern; submitRef pattern for online listener (:180-192)
- **Дефекти:**
  - return-request-button.tsx:319-325 reason Textarea has no maxLength (server MaxLength 1000); overlong reason -> generic toast with no hint
  - return-request-button.tsx:159-173 no error-to-field mapping; reason/DTO 400s fall into generic toast (return-error.ts:144-145) - violates 'server errors map to fields' target
  - return-request-button.tsx:259-282 quantity input onChange Number('') -> 0 and clamps instantly, so user cannot clear field to retype (value always rendered clamped, shows 0); no field error under input
  - No zod schema / shared validator: validation is hand-rolled clampQuantity, not mirrored from DTO
  - Not RHF: three useState values + manual reset in close() (:129-135); inconsistent with other forms
  - Reason has no counter/hint for the 1000 limit (dict.returnRequest.reasonHint, dictionary.ts:2249 only says optional)

> **Не досліджено / сумнівно:** No other return-related form found in storefront: entities/return/ui/{order-return-history,return-history,return-summary-badge}.tsx are read-only displays (no useForm/<form>/inputs). · Admin-side return forms (decide/resolve/reduce-credit/repair-step DTOs) are out of this group (admin group). · Did not open widgets order-detail-view.tsx / guest-order-view.tsx / account orders history to confirm exact call-sites of ReturnRequestButton; routes inferred from task description and file layout.

### Адмінка · замовлення й повернення (12)

#### `apps/store-admin/src/features/order-create/ui/order-create-form.tsx`

- **Маршрут:** —
- **zod:** apps/store-admin/src/features/order-create/model/create-order-schema.ts (createOrderSchema)
- **DTO:** apps/store-api/src/order/dto/create-manual-order.dto.ts CreateManualOrderDto (+ManualOrderContactDto extends guest-contact.dto.ts GuestContactDto, address.dto.ts AddressDto)

| Поле                         | Тип   | Клієнт                                                                                       | Сервер                                                                                                                         | Збіг          | Примітка                                                                                                                                                                                      |
| ---------------------------- | ----- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| contactPhone (guest mode)    | phone | isValidInternationalPhone (PHONE_SHAPE + 9-15 digits), required only when customerMode=guest | @Transform(normalizePhone) @IsString @MaxLength(32) @IsInternationalPhone (same shape/digits)                                  | same          | No max length on client; 40-digit/33+ char value with separators passes client up to 15 digit rule only if digits<=15, so only separator padding >32 chars diverges (400).                    |
| phone (recipient)            | phone | min(1) + isValidInternationalPhone in superRefine (both modes)                               | AddressDto: normalizePhone @IsString @IsNotEmpty @MaxLength(30) @IsInternationalPhone                                          | same          | Server cap is 30 chars, contact cap 32; client has neither. Plain type=tel input, NO mask (deliberate, TASK-426/338; PhoneInput would rewrite foreign numbers). Hint text only.               |
| contactEmail                 | email | trim; optional; /^\S+@\S+\.\S+$/ only when guest mode                                        | ManualOrderContactDto: @Transform empty->undefined, @IsOptional, inherited @IsEmail @MaxLength(254) @Transform(normalizeEmail) | client-looser | a@b.c-style or 'x@y..z' / 'a b@c.d' variants class-validator isEmail rejects but regex accepts (e.g. 'a@b.c', 'user@-x.com', >254 chars) pass client and 400 on server; no 254 max on client. |
| shippingCost                 | money | string; only judged when method=OTHER; parseMoneyInput: /^\d+(?:[.,]\d{1,2})?$/ and <=100000 | @ValidateIf(!==undefined) @IsNumber maxDecimalPlaces 2 @Min(0) @Max(100000)                                                    | same          | Plain text input inputMode=decimal, no money-input mask; no thousands-space tolerance (parseKop accepts '1 234,50' but parseMoneyInput does not: two different money parsers in admin).       |
| firstName / lastName         | other | trim().min(1) no max                                                                         | @IsNotEmpty @MaxLength(100) each                                                                                               | client-looser | 101+ chars pass client, 400 server. lastName required on both sides -> one-word contactName ('Оксана') makes splitName give lastName='' (see issues).                                         |
| contactName                  | other | trim, non-empty in guest mode, no max                                                        | GuestContactDto.name @MinLength(1) @MaxLength(120) trim                                                                        | client-looser | 121+ chars passes client.                                                                                                                                                                     |
| city / address1 / postalCode | other | trim; required per method (refineDelivery); no max                                           | AddressDto city @MaxLength(100), address1 @MaxLength(500), postalCode @MaxLength(20) (@IsNotEmpty on city/address1)            | client-looser | overlong values 400 server; NP branch pick fills address1 via NpWarehouseField.                                                                                                               |
| notes / internalNotes        | other | trim().max(500) / max(2000) with messages                                                    | @MaxLength(500) / @MaxLength(2000)                                                                                             | same          | Server 400 for these is mapped back to the field (create-order-error.ts).                                                                                                                     |
| date fields                  | date  | none                                                                                         | none                                                                                                                           | same          | No date input in this form.                                                                                                                                                                   |

- **Де помилка:** Client: field-level <p role="alert"> under each input (Field/PhoneField/PickupField at ~L892-1031) plus an error-link list in the sticky summary; items-empty line. Server: summary box + toast.error, only notes/internalNotes and line errors placed under their targets.
- **Помилка сервера:** order-create-form.tsx:331-348 readCreateOrderRefusal (model/create-order-error.ts) -> setRefusal + form.setError ONLY for notes/internalNotes via regex on English message; stock/unavailable go under product line; DELIVERY_* code -> summary text. Phone/email/name/city/address 400s are NOT mapped: generic summary t.failedBadRequest + toast.error.
- **Маска:** none (plain type=tel; deliberate, international rule). Money: plain text, no money-input.
- **Асинхронний сид:** n/a (create form; useState defaults; only useEffect syncing deliveryMethod/paymentMethod from GET /delivery/methods offer, via setValue, no reset)
- **Дефекти:**
  - order-create-form.tsx:156-159 splitName: one-word name gives lastName='' ; AddressDto and zod both require lastName, so the 'same recipient' copy (L288-304, L373) yields an empty required field. Workaround at L357-367 (onInvalid unchecks the checkbox) only after a failed submit; copy is silent.
  - order-create-form.tsx:373 copyRecipientFromClient runs at submit and OVERWRITES firstName/lastName/phone with setValue (no dirty/validate) whenever sameRecipient is true; the values persist in the hidden form state, so unchecking later shows copied, stale values and any prior typed recipient is lost.
  - order-create-form.tsx:264-280 selectCustomer prefill (autofill, TASK-1984 area) fills recipient only if empty and does not re-run when customer is changed/cleared (clearCustomer L282 leaves prefilled recipient fields behind); prefill uses setValue without shouldValidate/dirty.
  - order-create-form.tsx:373 + L302: copied contactPhone/account phone is validated against recipient rule; error for a hidden field is shown only via the checkbox flipping off (L366), not under the client field.
  - create-order-schema.ts:113,116-118,121-123 no max-length rules (contactName 120, firstName/lastName 100, city 100, address1 500, postalCode 20, email 254, phone 30/32) while DTO enforces them -> server 400 surfaces as generic toast, not under the field (L344,347).
  - create-order-schema.ts:184 email regex is looser than class-validator @IsEmail; create-order-error.ts maps only notes fields.
  - create-order-schema.ts:154 recipient phone validated even when sameRecipient hides the field (schema cannot see the checkbox); handled only by onInvalid hack.
  - create-order-schema.ts:9 / money-input.ts: parseMoneyInput duplicates but differs from money-kop.ts parseKop (no spaces/₴ tolerance); shippingCost is a number in DTO but a decimal string typed by hand.

#### `apps/store-admin/src/features/order-address-edit/ui/order-address-form.tsx`

- **Маршрут:** —
- **zod:** apps/store-admin/src/features/order-address-edit/model/address-schema.ts (orderAddressSchema)
- **DTO:** apps/store-api/src/order/dto/update-order-details.dto.ts UpdateOrderDetailsDto (shippingAddress: address.dto.ts AddressDto; deliveryMethod, pickupPointId, shippingCost)

| Поле                                                | Тип   | Клієнт                                                   | Сервер                                                                                                             | Збіг          | Примітка                                                                             |
| --------------------------------------------------- | ----- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------ |
| phone (recipient)                                   | phone | trim min(1) + refine isValidInternationalPhone           | AddressDto: normalizePhone @IsNotEmpty @MaxLength(30) @IsInternationalPhone                                        | same          | Plain input, no PhoneInput mask. Server max 30 chars not mirrored on client.         |
| shippingCost                                        | money | parseMoneyInput (<=100000, <=2 decimals), only for OTHER | @ValidateIf @IsNumber maxDecimalPlaces 2 @Min(0) @Max(100000); OTHER only (400 DELIVERY_SHIPPING_COST_NOT_ALLOWED) | same          | Plain inputMode=decimal text input; typed value sent as number by deliveryEditToDto. |
| firstName / lastName / city / address1 / postalCode | other | trim min(1)/required per method; no max                  | @MaxLength 100/100/100/500/20                                                                                      | client-looser | overlong values 400.                                                                 |
| expectedUpdatedAt                                   | date  | lock.token from useEditLockToken (not user-typed)        | @IsDateString; required with any delivery field (400 ORDER_VERSION_REQUIRED)                                       | same          | Not a user date field.                                                               |

- **Де помилка:** Field-level text under inputs (L575 role=alert) and pickup/NP fields; DELIVERY_* refusal shown inline under the form (L438 box / deliveryRefusalOf); 409 -> StaleDraftPanel review; other errors toast.error.
- **Помилка сервера:** order-address-form.tsx:322-350: 409 stale -> review panel; orderConflictMessage -> toast; DELIVERY_* -> inline message; else toast.error(orderWriteErrorMessage). No setError for phone/firstName/etc. 400s (no per-field mapping).
- **Маска:** none (plain input, international rule by design)
- **Асинхронний сид:** Follows forms.md Rule 2a: useForm values: seeded + resetOptions keepDirtyValues (L158-163); post-save form.reset(keepDirtyValues:false) (L294); stale-draft review via resetField/setValue.
- **Дефекти:**
  - order-address-form.tsx:343-350 server 400 on firstName/phone/city length etc. falls to generic toast (orderWriteErrorMessage / detailsFailed) instead of the field.
  - address-schema.ts:30-36 no max-length rules vs AddressDto MaxLength; phone 30-char cap not mirrored.
  - address-schema.ts:25-27 lastName required (min(1)) while the order may have been created with a 'same recipient' one-word name; existing snapshot with empty lastName blocks the edit until filled (consistent with server AddressDto @IsNotEmpty).

#### `apps/store-admin/src/features/order-details-form/ui/order-details-form.tsx`

- **Маршрут:** —
- **zod:** apps/store-admin/src/features/order-details-form/model/order-details-schema.ts (createOrderDetailsSchema)
- **DTO:** apps/store-api/src/order/dto/update-order-details.dto.ts UpdateOrderDetailsDto (trackingNumber, internalNotes, expectedUpdatedAt)

| Поле                 | Тип   | Клієнт                                                                                                  | Сервер                                                                                                           | Збіг | Примітка                                                                                                                   |
| -------------------- | ----- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------- |
| trackingNumber (ТТН) | other | trim max(64); blank ok; == seeded (grandfathered) or isValidWaybill: /^[\d\s-]+$/ and exactly 14 digits | @MaxLength(64) @Transform(normalizeWaybill) @IsNovaPoshtaWaybill (NP_WAYBILL_SHAPE same, 14 digits); null clears | same | Grandfathering exists only on the client; server would reject a legacy value if re-sent, but DTO omits unchanged tracking. |
| internalNotes        | other | trim max(2000)                                                                                          | @MaxLength(2000) trim->null                                                                                      | same |                                                                                                                            |
| expectedUpdatedAt    | date  | lock.token (useEditLockToken)                                                                           | @IsOptional @IsDateString; 409 ORDER_STALE                                                                       | same | System value, not user input.                                                                                              |

- **Де помилка:** Field text under inputs (L345, L388 role=alert); waybill 400 -> setError under field AND toast; 409 -> stale review panel; others toast.
- **Помилка сервера:** order-details-form.tsx:271-277 isWaybillRejection (regex /waybill\|trackingnumber\|ттн/i on English message, model/order-details-schema.ts) -> setError(trackingNumber)+toast. internalNotes 400 not mapped (toast only). Rest toast.error(orderWriteErrorMessage).
- **Маска:** none (no phone/money fields)
- **Асинхронний сид:** Compliant with forms.md Rule 2a: values: seeded derived each render, resetOptions keepDirtyValues, form.reset(keepDirtyValues:false) after save (L174-177, L245).
- **Дефекти:**
  - order-details-form.tsx:271-277 waybill error AND toast fired together (field + toast duplication; rule says toast only for fieldless errors).
  - order-details-form.tsx:289-308 server 400 on internalNotes (length) not mapped to the field; generic toast.

#### `apps/store-admin/src/features/order-status-update/ui/order-status-select.tsx`

- **Маршрут:** —
- **zod:** none (no zod)
- **DTO:** apps/store-api/src/order/dto/update-order-status.dto.ts UpdateOrderStatusDto (status, expectedUpdatedAt, confirmUnpaidShipment)

| Поле   | Тип   | Клієнт                                                             | Сервер                                         | Збіг | Примітка                                                                                      |
| ------ | ----- | ------------------------------------------------------------------ | ---------------------------------------------- | ---- | --------------------------------------------------------------------------------------------- |
| status | other | select restricted to allowed transitions (GET allowed-transitions) | @IsEnum(OrderStatus) + state machine (409/400) | same | No free-text/phone/email/money/date input; confirmUnpaidShipment is a boolean confirm dialog. |

- **Де помилка:** toast.success/toast.error (order-status-select.tsx:260-285); stale/conflict message in toast; reason text for blocked options is rendered inline
- **Помилка сервера:** order-status-select.tsx:277-285 orderConflictMessage -> toast.error; no field to map to (single select), so toast is appropriate.
- **Маска:** none
- **Асинхронний сид:** n/a (select driven by fetched order/transitions; not RHF; value is the order status prop)

#### `apps/store-admin/src/features/order-money-receipt/ui/record-receipt-action.tsx`

- **Маршрут:** —
- **zod:** none (useState; checkMoneyAmount in apps/store-admin/src/entities/order/lib/order-money.ts + parseKop in shared/lib/money-kop.ts)
- **DTO:** apps/store-api/src/order/dto/order-money.dto.ts RecordMoneyInDto

| Поле               | Тип   | Клієнт                                                                                              | Сервер                                  | Збіг           | Примітка                                                                                                                          |
| ------------------ | ----- | --------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| amount (amountKop) | money | parseKop: /^(\d+)(?:[.,](\d{1,2}))?$/ after stripping spaces/₴/грн, whole <=8 digits, <=MAX_KOP; >0 | @IsInt @Min(1) @Max(2147483647) kopecks | same           | Server cap on overpayment: needs note (ORDER_MONEY_OVERPAYMENT_REASON_REQUIRED), client handles via serverWantsReason (L133,178). |
| note               | other | maxLength={500} attr + noteError state                                                              | @MaxLength(500) trimToNull              | same           |                                                                                                                                   |
| occurredAt         | date  | not sent (no date field)                                                                            | @IsOptional @IsDateString               | no-client-rule | Operator cannot backdate a payment; server accepts it.                                                                            |
| expectedUpdatedAt  | date  | opened.updatedAt snapshot                                                                           | @IsDateString required; 409 ORDER_STALE | same           |                                                                                                                                   |

- **Де помилка:** amount/note: inline text via amountError/noteError states; refusal: formError inline in dialog; stale: toast.error then close.
- **Помилка сервера:** record-receipt-action.tsx:166-185: moneyWriteErrorMessage -> formError (inline banner); ORDER_MONEY_OVERPAYMENT_REASON_REQUIRED -> setNoteError/serverWantsReason; stale -> toast. Server amount errors are not routed to the amount field.
- **Маска:** none: plain text input (no money-input component); parseKop tolerant of formatting
- **Асинхронний сид:** Snapshot-at-open via useState(()=>...) (L121-126): kind/amount default from dueKop captured once when dialog mounts; dialog content mounts per open so it is a mount-time seed, not a live seed (acceptable, no stale-after-refetch reset; if money refetches while open the default stays old by design).
- **Дефекти:**
  - Hand-rolled useState validation instead of zod+RHF (not in line with forms.md form standard), and a 409/400 on amount goes to formError rather than amount field.

#### `apps/store-admin/src/features/order-money-payout/ui/record-payout-action.tsx`

- **Маршрут:** —
- **zod:** none (useState; checkMoneyAmount)
- **DTO:** apps/store-api/src/order/dto/order-money.dto.ts RecordMoneyOutDto

| Поле               | Тип   | Клієнт                                                                                 | Сервер                                                                                           | Збіг | Примітка |
| ------------------ | ----- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---- | -------- |
| amount (amountKop) | money | checkMoneyAmount(raw, maxKop): parseKop, >0, <=maxKop (server-provided owed/remaining) | @IsInt @Min(1) @Max(2147483647) + business max (owedKop / outWithoutReturnMaxKop / remainingKop) | same |          |
| reason             | other | required without returnId (reasonRequired), maxLength={500} attr                       | @MaxLength(500) trimToNull; ORDER_MONEY_PAYOUT_REASON_REQUIRED without returnId                  | same |          |
| expectedUpdatedAt  | date  | opened.updatedAt                                                                       | @IsDateString required                                                                           | same |          |

- **Де помилка:** amountError/reasonError inline; server refusals in formError banner; stale -> toast and close.
- **Помилка сервера:** record-payout-action.tsx:205-216 setFormError(moneyWriteErrorMessage) (inline banner), stale -> toast.error; not field-mapped.
- **Маска:** none (plain text money input)
- **Асинхронний сид:** Snapshot at mount via useState lazy init (L135-152): rawAmount seeded from kopToInput(opened.maxKop) once per open; no later sync (documented 'opened' snapshot).
- **Дефекти:**
  - Same hand-rolled validation pattern; no reset/key on money refetch (maxKop snapshot can go stale while open, server 400 then shows as formError).

#### `apps/store-admin/src/features/order-money-reversal/ui/entry-correction-action.tsx`

- **Маршрут:** —
- **zod:** none (useState)
- **DTO:** apps/store-api/src/order/dto/order-money.dto.ts MoneyCorrectionDto

| Поле              | Тип   | Клієнт                                      | Сервер                                      | Збіг | Примітка |
| ----------------- | ----- | ------------------------------------------- | ------------------------------------------- | ---- | -------- |
| reason            | other | required (trim) + maxLength={500} attribute | @Transform trim @IsNotEmpty @MaxLength(500) | same |          |
| expectedUpdatedAt | date  | money.updatedAt snapshot (useState)         | @IsDateString required                      | same |          |

- **Де помилка:** reasonError inline; server refusal formError; success/stale toast.
- **Помилка сервера:** entry-correction-action.tsx:150-160: setFormError / toast.error; no field mapping.
- **Маска:** none
- **Асинхронний сид:** useState(() => money.updatedAt) snapshot at mount (L128).

#### `apps/store-admin/src/features/return-create/ui/return-create-dialog.tsx`

- **Маршрут:** —
- **zod:** none (useState; returnableLines/clampQuantity in entities)
- **DTO:** apps/store-api/src/order/returns/dto/create-return.dto.ts CreateReturnDto + ReturnItemDto

| Поле             | Тип   | Клієнт                                                        | Сервер                                                   | Збіг | Примітка                                   |
| ---------------- | ----- | ------------------------------------------------------------- | -------------------------------------------------------- | ---- | ------------------------------------------ |
| items[].quantity | other | clampQuantity(parseInt, remaining) and filter >0; stepper max | @IsInt @Min(1) each; @ArrayMinSize(1) @ArrayMaxSize(200) | same | client clamps instead of showing an error. |
| reason (comment) | other | maxLength={1000} attribute (COMMENT_MAX_LENGTH), trimmed      | @MaxLength(1000)                                         | same |                                            |
| requestedOutcome | other | radio group                                                   | @IsEnum(ReturnOutcome) optional                          | same |                                            |

- **Де помилка:** single inline <p role=alert> banner (error state, L232/L325) in the dialog; toast.success only.
- **Помилка сервера:** return-create-dialog.tsx:187-206 returnRefusalOf -> setError(refusal.message ?? createFailed) inline banner; no per-field mapping.
- **Маска:** none
- **Асинхронний сид:** n/a (create dialog; lines derived at render from order + GET claims; quantities in useState keyed by orderItemId)
- **Дефекти:**
  - No client rule for the comment overflow beyond maxLength attr, no visible error text for it (attribute truncates).

#### `apps/store-admin/src/features/return-decide/ui/return-decide-form.tsx`

- **Маршрут:** —
- **zod:** apps/store-admin/src/features/return-decide/model/decide-schema.ts (createDecideSchema)
- **DTO:** apps/store-api/src/order/returns/dto/decide-return.dto.ts DecideReturnDto

| Поле     | Тип   | Клієнт                                                                                                   | Сервер                                                                                                  | Збіг | Примітка                               |
| -------- | ----- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------- |
| reason   | other | normalizeReason (trim, strip \p{Cf}); max 1000; required on REJECT or when changing an existing decision | @IsOptional @IsString @MaxLength(1000) trim/Cf-strip->null; required on REJECT / change (RETURN_* code) | same |                                        |
| decision | other | non-empty string                                                                                         | @IsEnum(ReturnDecision)                                                                                 | same | client uses z.string(), no enum check. |

- **Де помилка:** field text under radios/textarea (role=alert); server 400 mapped to field via setError; toast for fieldless.
- **Помилка сервера:** return-decide-form.tsx:157-171 setError(...) for field-named refusals (model/decide-error.ts), toast.error(outcome.message) otherwise.
- **Маска:** none
- **Асинхронний сид:** Rule 2a: values: {decision: rma.decision ?? '', reason: ''} (L94) + form.reset after save (L149); open state useState(!hasDecision).
- **Дефекти:**
  - return-decide-form.tsx:94 values reseeds reason to '' (reason never seeded from rma) - intentional, but with values+no keepDirtyValues a background refetch of rma can reset a half-typed reason (check resetOptions).

#### `apps/store-admin/src/features/return-repair/ui/return-repair-step-form.tsx`

- **Маршрут:** —
- **zod:** apps/store-admin/src/features/return-repair/model/repair-schema.ts (createRepairSchema(step))
- **DTO:** apps/store-api/src/order/returns/dto/add-repair-step.dto.ts AddRepairStepDto

| Поле        | Тип   | Клієнт                                                        | Сервер                                                                           | Збіг | Примітка                                                                                                |
| ----------- | ----- | ------------------------------------------------------------- | -------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------- |
| ttn         | other | free text trim max 64 (REPAIR_TTN_MAX_LENGTH), step-dependent | @MaxLength(64) trimToNull; no waybill validator                                  | same | Unlike the order TTN (14 digits NP rule), the repair ttn accepts anything up to 64 chars on both sides. |
| destination | other | trim max 300                                                  | @MaxLength(300)                                                                  | same |                                                                                                         |
| note        | other | max 2000 (REPAIR_NOTE_MAX_LENGTH)                             | @MaxLength(300)? no: @MaxLength(2000)                                            | same |                                                                                                         |
| result      | other | required on RETURNED_FROM_SERVICE                             | @IsEnum(RepairResult); required only on RETURNED_FROM_SERVICE, refused on others | same |                                                                                                         |

- **Де помилка:** field text under inputs; server field errors setError; toast for fieldless.
- **Помилка сервера:** return-repair-step-form.tsx:117-130 repairErrorOf (model/repair-error.ts, regex on field names) -> form.setError(field,...) else toast.error.
- **Маска:** none
- **Асинхронний сид:** n/a (defaultValues REPAIR_DEFAULT_VALUES; create-style step form, no async seed)

#### `apps/store-admin/src/features/return-credit-reduce/ui/reduce-credit-action.tsx`

- **Маршрут:** —
- **zod:** none (useState; features/return-credit-reduce/model/reduce-credit.ts)
- **DTO:** apps/store-api/src/order/returns/dto/reduce-return-credit.dto.ts ReduceReturnCreditDto

| Поле      | Тип   | Клієнт                                                                      | Сервер                                                              | Збіг | Примітка                                              |
| --------- | ----- | --------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---- | ----------------------------------------------------- |
| creditKop | money | parseKop; bounds between paidOutKop and currentKop (model/reduce-credit.ts) | @IsInt @Min(0) @Max(2147483647); business: <= computed, >= paid out | same | Zero is allowed here (Min(0)) unlike payment dialogs. |
| reason    | other | required, maxLength={500} (REASON_MAX_LENGTH)                               | trim @IsNotEmpty @MaxLength(500)                                    | same |                                                       |

- **Де помилка:** amountError/reasonError inline; refusals via toast.error(refusal.message) (L179) and formError.
- **Помилка сервера:** reduce-credit-action.tsx:171-185 returnRefusalOf -> toast.error / formError; not mapped to the amount field.
- **Маска:** none (plain text money)
- **Асинхронний сид:** useState lazy snapshot of bounds + rawAmount at mount (L118-122).
- **Дефекти:**
  - reduce-credit-action.tsx:179 server refusal about the amount shown as toast, not under the amount field.

#### `apps/store-admin/src/features/return-resolve/ui/return-resolve-form.tsx`

- **Маршрут:** —
- **zod:** apps/store-admin/src/features/return-resolve/model/resolve-schema.ts (resolveReturnSchema)
- **DTO:** apps/store-api/src/order/returns/dto/resolve-return.dto.ts ResolveReturnDto

| Поле          | Тип   | Клієнт                                                           | Сервер                                                                                         | Збіг            | Примітка                                     |
| ------------- | ----- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------- | -------------------------------------------- |
| operatorNotes | other | trim max(2000)                                                   | @IsOptional @IsString @MaxLength(2000) trim->null                                              | same            |                                              |
| status        | other | refine in [RECEIVED]                                             | @IsEnum(ReturnStatus); state machine, APPROVED/REJECTED/REFUNDED refused with codes            | client-stricter | client only offers RECEIVED; fine by design. |
| restock       | other | boolean; sent only if canRestock (RECEIVED and restockedAt null) | @IsBoolean w/ transform; RETURN_STATUS_REQUIRED without status; guarded against double restock | same            |                                              |

- **Де помилка:** operatorNotes: field text under textarea; coded refusals and generic 400 -> toast.error; 409 -> toast + refetch.
- **Помилка сервера:** return-resolve-form.tsx:231-262 onResolveError: 400 with /operatorNotes/ regex -> setEditingNotes + form.setError('operatorNotes'); returnRefusalOf coded -> toast; other 400 -> toast d.resolveBadRequest.
- **Маска:** none
- **Асинхронний сид:** Rule 2a: values: {status:'', operatorNotes: rma.operatorNotes ?? '', restock: rma.restockedAt===null} with resetOptions keepDirtyValues (L188-194).
- **Дефекти:**
  - return-resolve-form.tsx:188-194 `values` is a fresh object literal each render (reseeded from rma on every refetch); relies on keepDirtyValues, but 'status' is forced to '' and restock re-derived on every refetch, which can reset a restock checkbox the operator unticked (restock is dirty so kept) -- verify with a test, low risk.
  - resolve-schema.ts:25 status z.string().refine(...) has no message (silent invalid).

> **Не досліджено / сумнівно:** Customer picker (features/order-create/ui/order-customer-picker.tsx) is a search box, not a form with validation; not mapped further. · NP city/warehouse pickers (NpCityField/NpWarehouseField in order-create/ui/np-address-fields? and widgets) not audited for ref/name sync beyond the schema rules. · Admin return list/order list filter forms (admin-order-list-query.dto.ts, return-list-query.dto.ts) are query filters in other groups; not covered. · Exact line numbers for return-decide-form resetOptions and order-money dialogs' phone-less fields were read via grep, not fully read. · Admin order notes outside order-details-form (user-notes feature belongs to another group) and any payment-link/order-access-link action not inspected.

### Адмінка · товари й каталог (11)

#### `apps/store-admin/src/features/product-form/ui/product-form.tsx`

- **Маршрут:** /products/new, /products/[id] (widgets/product-form-view create-product-view.tsx, edit-product-view.tsx)
- **zod:** apps/store-admin/src/features/product-form/model/product-schema.ts (productSchema)
- **DTO:** apps/store-api/src/product/dto/create-product.dto.ts CreateProductDto (+ update-product.dto.ts)

| Поле                                       | Тип   | Клієнт                                                                                                           | Сервер                                                                 | Збіг            | Примітка                                                                                                                                                                                                   |
| ------------------------------------------ | ----- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| price                                      | money | string.trim.min(1).refine(!isNaN(Number(v))).refine(>0).transform(Number); <input type=number inputMode=decimal> | @Type(Number) @IsNumber() @Min(0.01)                                   | client-looser   | '1e3' and 'Infinity' pass client (Number()), IsNumber rejects Infinity -> 400. No decimal-places cap on either side; no money-input mask, no kopeck handling (plain number in UAH).                        |
| compareAtPrice                             | money | optional string, number, >0, '' -> undefined                                                                     | @IsOptional @Type(Number) @IsNumber @Min(0.01)                         | client-looser   | DTO docs say 'must be greater than price' but neither the zod schema nor the DTO validator enforces compareAtPrice > price (only discountPercent display, product-form.tsx:257). Same Infinity/1e3 caveat. |
| stock                                      | other | /^\d+$/ else 0                                                                                                   | @IsInt @Min(0)                                                         | same            | No max on either side.                                                                                                                                                                                     |
| name                                       | other | trim.min(1).max(255)                                                                                             | @IsString @MaxLength(255) (no IsNotEmpty/MinLength, no trim transform) | client-stricter | Direct API call with '' or ' ' is accepted; only the form blocks it.                                                                                                                                       |
| slug                                       | other | trim.max(255).regex(SLUG_PATTERN).or('')                                                                         | @IsOptional @MaxLength(255) @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)     | same            | Blank dropped on map -> auto slug.                                                                                                                                                                         |
| description                                | other | trim.max(20000) (literal; comment says mirrors MAX_DESCRIPTION_LENGTH)                                           | @MaxLength(MAX_DESCRIPTION_LENGTH) from product.constants              | same            | Hard-coded 20000 on client, no shared constant -> drift risk.                                                                                                                                              |
| sku                                        | other | trim.max(50)                                                                                                     | @MaxLength(50), unique                                                 | same            | Uniqueness conflict is only a server error.                                                                                                                                                                |
| metaTitle/metaDescription/keywords/ogImage | other | seoTextFields(), keywords parsed count/length, ogImageField()                                                    | MaxLength 255/500, @IsKeywordsField, @IsOgImageField                   | same            | Shared via shared/lib/seo-fields-schema; not re-verified field by field.                                                                                                                                   |
| phone / email / date                       | phone | n/a                                                                                                              | n/a                                                                    | no-client-rule  | Form has no phone, email or date fields.                                                                                                                                                                   |

- **Де помилка:** field (client, <p role=alert> under input via fieldError, product-form.tsx:494) + toast (server) + inline banner/failure block in edit view (edit-product-view.tsx:292,339)
- **Помилка сервера:** No setError. productSaveErrorMessage (features/product-form/model/save-error.ts) maps only PRODUCT_CATEGORY_BUSY/GONE and falls back to apiErrorMessage; shown via toast.error (create-product-view.tsx:139, edit-product-view.tsx:176-180). A 400 on price/sku/slug lands in a toast, not under the field.
- **Маска:** none (plain <input type=number>); no money-input component
- **Асинхронний сид:** follows forms.md Rule 2a: useForm({values: defaultValues, resetOptions:{keepDirtyValues:true}}) product-form.tsx:313, reset(getValues(), keepDirtyValues:false) after save (:471), discard resets to loaded (:981)
- **Дефекти:**
  - product-form.tsx:719,735 type=number price inputs: 'Infinity'/exponent not blocked by zod refine (product-schema.ts:63) but API IsNumber rejects Infinity
  - product-schema.ts:67-79 compareAtPrice > price not validated client or server despite DTO docstring
  - product-schema.ts:40 name min(1) client-only; API has no IsNotEmpty
  - product-schema.ts:55 description cap 20000 hard-coded duplicate of MAX_DESCRIPTION_LENGTH
  - edit-product-view.tsx:176 / create-product-view.tsx:139 server 400s shown as toast, never mapped to fields (sku duplicate, slug)
  - product-form.tsx:719 price has no money mask / decimal-places limit

#### `apps/store-admin/src/features/product-addon-delta-panel/ui/product-addon-delta-panel.tsx`

- **Маршрут:** /products/[id], /products/new
- **zod:** none (no zod; ad-hoc check Number(draft))
- **DTO:** apps/store-api/src/addon-service/dto/set-product-delta.dto.ts SetProductDeltaDto (AddonDeltaPriceConstraint)

| Поле               | Тип   | Клієнт                                                     | Сервер                                                                           | Збіг          | Примітка                                                                                                                      |
| ------------------ | ----- | ---------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| price (priceDraft) | money | draft.trim()!=='' && !isNaN(Number) && >=0 (lines 194,220) | type-dependent: REMOVE must be absent; OVERRIDE required; else finite number >=0 | client-looser | 'Infinity' passes client (Number('Infinity') not NaN) but server requires Number.isFinite -> 400 shown only as generic toast. |

- **Де помилка:** toast only (d.toastBadPrice for client, d.toastFailed for server) - no field message
- **Помилка сервера:** none; onError: () => toast.error(d.toastFailed) (lines 164,178); server message discarded
- **Маска:** none (plain Input)
- **Асинхронний сид:** n/a (priceDraft is local useState opened on demand)
- **Дефекти:**
  - product-addon-delta-panel.tsx:194-196,220-222 client validation errors go to toast instead of under the field
  - product-addon-delta-panel.tsx:164,178 server error text dropped for generic toast
  - no zod schema; rule duplicated in two places

#### `apps/store-admin/src/features/product-restore/ui/product-restore-dialog.tsx`

- **Маршрут:** /products (trash view dialog)
- **zod:** in-file makeRestoreConflictSchema(conflict, taken) (product-restore-dialog.tsx ~325)
- **DTO:** apps/store-api/src/product/dto/restore-product.dto.ts RestoreProductDto

| Поле | Тип   | Клієнт                                                        | Сервер                                          | Збіг | Примітка                                                           |
| ---- | ----- | ------------------------------------------------------------- | ----------------------------------------------- | ---- | ------------------------------------------------------------------ |
| slug | other | makeRestoreConflictSchema + maxLength RESTORE_SLUG_MAX_LENGTH | see restore-product.dto.ts (not field-compared) | same | unverified field-by-field; spec exists restore-product.dto.spec.ts |
| sku  | other | maxLength RESTORE_SKU_MAX_LENGTH + 'same as taken' check      | see DTO                                         | same | unverified field-by-field                                          |

- **Де помилка:** field (client) + field (server 409 via setError) + toast on success
- **Помилка сервера:** GOOD: 409 mapped to fields via setError('sku', {type:'server'}) at product-restore-dialog.tsx:371,374; 404 handled separately (:155)
- **Маска:** none
- **Асинхронний сид:** n/a (dialog, seeded from the selected row)
- **Дефекти:**
  - Reference implementation of server-error to field mapping in this group; other forms should copy it

#### `apps/store-admin/src/features/product-group-form/ui/product-group-form.tsx`

- **Маршрут:** /product-groups/new, /product-groups/[id] (widgets/product-group-form-view)
- **zod:** apps/store-admin/src/features/product-group-form/model/product-group-schema.ts (productGroupSchema)
- **DTO:** apps/store-api/src/product-group/dto/create-product-group.dto.ts CreateProductGroupDto + product-group-axis-input.dto.ts

| Поле                   | Тип   | Клієнт                                              | Сервер                                               | Збіг           | Примітка                                                       |
| ---------------------- | ----- | --------------------------------------------------- | ---------------------------------------------------- | -------------- | -------------------------------------------------------------- |
| name                   | other | trim.min(1).max(255)                                | @IsString @MinLength(1) @MaxLength(255)              | same           | Server MinLength(1) does not trim: ' ' passes API.             |
| axes[].name            | other | trim string; blanks dropped on map; sortOrder=index | ProductGroupAxisInputDto nested (not read in detail) | no-client-rule | No max length on client axis name; check axis DTO.             |
| phone/email/money/date | money | n/a                                                 | n/a                                                  | no-client-rule | No such fields on the group form (priceRange is display only). |

- **Де помилка:** field (name error under input, shown only when submitCount>0, product-group-form.tsx:170,207) + toast (server)
- **Помилка сервера:** none; onError: () => toast.error(g.toastCreateFailed/toastUpdateFailed) (create-product-group-view.tsx:50, edit-product-group-view.tsx:78); server message ignored
- **Маска:** none
- **Асинхронний сид:** Rule 2b: useEffect(()=>{ if(id&&defaultValues) reset(...)}, [id]) with eslint-disable exhaustive-deps (:128-133); defaultValues also passed synchronously at useForm. Matches documented Rule 2b, but note id-keyed effect does not re-seed if defaultValues arrive after id is already set.
- **Дефекти:**
  - create/edit-product-group-view onError drops server message (no apiErrorMessage, no setError)
  - product-group-form.tsx:128 effect keyed on [id] only - if defaultValues load after mount with same id the form keeps EMPTY (verify the view renders form only after data is ready)
  - group-positions-section.tsx / add-positions-dialog.tsx contain nested position editors (not separately mapped)

#### `apps/store-admin/src/features/category-form/ui/category-form.tsx`

- **Маршрут:** /categories/new, /categories/[id] (widgets/category-form-view)
- **zod:** apps/store-admin/src/features/category-form/model/category-schema.ts (categorySchema)
- **DTO:** apps/store-api/src/category/dto/create-category.dto.ts CreateCategoryDto (+ update-category.dto.ts)

| Поле                                       | Тип   | Клієнт                                         | Сервер                                             | Збіг            | Примітка                                                                                                                      |
| ------------------------------------------ | ----- | ---------------------------------------------- | -------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| name                                       | other | trim.min(1).max(255)                           | @IsString @MaxLength(255)                          | client-stricter | API accepts '' / whitespace.                                                                                                  |
| slug                                       | other | trim.max(255).regex(SLUG_PATTERN)              | @MaxLength(255) @Matches(slug regex)               | same            |                                                                                                                               |
| description                                | other | trim.max(2000)                                 | @MaxLength(2000)                                   | same            |                                                                                                                               |
| image                                      | other | trim.url().or('')                              | @IsUrl({require_tld:false})                        | different       | zod .url() accepts any scheme (e.g. javascript:, foo://x); class-validator IsUrl defaults to http/https/ftp -> 400 on server. |
| parentId                                   | other | UUID_PATTERN                                   | @IsUUID('loose')                                   | same            |                                                                                                                               |
| icon                                       | other | isCategoryIconKey allow-list                   | @IsCategoryIconField allow-list                    | same            |                                                                                                                               |
| metaTitle/metaDescription/keywords/ogImage | other | seoTextFields / parsed keywords / ogImageField | MaxLength 255/500, IsKeywordsField, IsOgImageField | same            |                                                                                                                               |

- **Де помилка:** field (client, errors.*?.message under each input) + toast (server)
- **Помилка сервера:** none for fields; create-category-view.tsx:44 toast.error(toastCreateFailed) with no server message; edit-category-view.tsx:257-278 multi-step save with toast.error(saveStepFailed...)
- **Маска:** none (no phone/money fields)
- **Асинхронний сид:** Rule 2b: useEffect([id]) reset (category-form.tsx:185-190) with documented rationale at :226 and :180 (earlier values: live-sync dropped parentId, TASK-149); reset(getValues()) after save (:362)
- **Дефекти:**
  - category-schema.ts:image zod .url() vs IsUrl protocols mismatch
  - create-category-view.tsx:44 onError toast drops server message, no field mapping (e.g. slug taken)

#### `apps/store-admin/src/features/brand-form/ui/brand-form.tsx`

- **Маршрут:** /brands/new, /brands/[id] (widgets/brand-form-view)
- **zod:** apps/store-admin/src/features/brand-form/model/brand-schema.ts (brandSchema)
- **DTO:** apps/store-api/src/brand/dto/create-brand.dto.ts CreateBrandDto (+ update-brand.dto.ts)

| Поле | Тип   | Клієнт                            | Сервер                                                      | Збіг            | Примітка                                                                                                                                    |
| ---- | ----- | --------------------------------- | ----------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| name | other | trim.min(1).max(255)              | @IsString @MaxLength(255)                                   | client-stricter | API accepts '' / whitespace.                                                                                                                |
| slug | other | trim.max(255).regex(SLUG_PATTERN) | @MaxLength(255) @Matches                                    | same            |                                                                                                                                             |
| logo | other | trim.url().or('')                 | @IsUrl() default options (require_tld true, http/https/ftp) | client-looser   | http://localhost/logo.png or any non-http scheme passes client, 400 on server. Note: category image uses require_tld:false, brand does not. |

- **Де помилка:** field (client) + toast (server) + role=alert load-error banner in edit-brand-view.tsx:125
- **Помилка сервера:** none; onError toast.error(toastCreateFailed/toastUpdateFailed) (create-brand-view.tsx:41, edit-brand-view.tsx:88)
- **Маска:** none
- **Асинхронний сид:** Rule 2b: useEffect([id]) reset (brand-form.tsx:126-131)
- **Дефекти:**
  - brand-schema.ts:logo url rule looser than IsUrl() default
  - create/edit-brand-view onError drops server message and does not map to field

#### `apps/store-admin/src/features/addon-service-form/ui/addon-service-form.tsx`

- **Маршрут:** /addon-services (dialog create/edit)
- **zod:** apps/store-admin/src/features/addon-service-form/model/addon-service-schema.ts (addonServiceSchemaFor(savedDescription))
- **DTO:** apps/store-api/src/addon-service/dto/create-addon-service.dto.ts CreateAddonServiceDto (+ update-addon-service.dto.ts)

| Поле        | Тип   | Клієнт                                                                                                                    | Сервер                          | Збіг            | Примітка                                                                                                       |
| ----------- | ----- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------- |
| price       | money | string.trim.min(1).refine(!isNaN(Number)).refine(>=0); dto does Number(price); <input inputMode=decimal> with ₴ adornment | @Type(Number) @IsNumber @Min(0) | client-looser   | 'Infinity'/'1e3' pass client; IsNumber rejects Infinity. No decimal-place cap. Free (0) allowed on both sides. |
| description | other | max 300 (ADDON_DESCRIPTION_MAX) unless equals saved value                                                                 | @MaxLength(2000)                | client-stricter | Intentional (comment cites TASK-1083, API alignment is 'an API tail'); legacy text up to 2000 grandfathered.   |
| name        | other | trim.min(1).max(255)                                                                                                      | @IsString @MaxLength(255)       | client-stricter | API accepts blank.                                                                                             |

- **Де помилка:** field (FieldError under input with aria-describedby, error replaces hint) + toast (server, dialog stays open)
- **Помилка сервера:** none; onError: () => toast.error(d.toastCreateFailed/toastUpdateFailed) (addon-service-form-dialog.tsx:81,94); server message discarded
- **Маска:** ₴ adornment only; no money-input component (money-input.ts exists in shared/lib but not used here)
- **Асинхронний сид:** Rule 2b: useEffect([id]) reset(...) (addon-service-form.tsx:145-150); mapAddonServiceToFormValues converts API price string '499.00' -> '499'
- **Дефекти:**
  - addon-service-form-dialog.tsx:81,94 server errors toast-only, message dropped
  - addon-service-schema.ts:price Infinity not rejected
  - description limit 300 client vs 2000 API (known tail)

#### `apps/store-admin/src/features/device-brand-form/ui/device-brand-form.tsx`

- **Маршрут:** /devices (brands grid dialog)
- **zod:** apps/store-admin/src/features/device-brand-form/model/device-brand-schema.ts (deviceBrandSchema)
- **DTO:** apps/store-api/src/device/dto/create-device-brand.dto.ts CreateDeviceBrandDto (+ update-device-brand.dto.ts)

| Поле | Тип   | Клієнт                            | Сервер                    | Збіг            | Примітка           |
| ---- | ----- | --------------------------------- | ------------------------- | --------------- | ------------------ |
| name | other | trim.min(1).max(255)              | @IsString @MaxLength(255) | client-stricter | API accepts blank. |
| slug | other | trim.max(255).regex(SLUG_PATTERN) | @MaxLength(255) @Matches  | same            |                    |

- **Де помилка:** field (FieldError under name/slug) + toast (server)
- **Помилка сервера:** none; toast.error(toastBrandCreateFailed/UpdateFailed) (device-brand-form-dialog.tsx:81,94)
- **Маска:** none
- **Асинхронний сид:** Rule 2b: useEffect([id]) reset (device-brand-form.tsx:118-123); create seeds synchronously via defaultValues, edit starts EMPTY_VALUES
- **Дефекти:**
  - device-brand-form-dialog.tsx:81,94 server message dropped; duplicate slug/name 409 not shown at field

#### `apps/store-admin/src/features/device-model-form/ui/device-model-form.tsx`

- **Маршрут:** /device-models/new, /device-models/[id] (widgets/device-model-form-view)
- **zod:** apps/store-admin/src/features/device-model-form/model/device-model-schema.ts (deviceModelSchema)
- **DTO:** apps/store-api/src/device/dto/create-device-model.dto.ts CreateDeviceModelDto (+ update-device-model.dto.ts)

| Поле                                  | Тип   | Клієнт                                                                                       | Сервер                                                 | Збіг            | Примітка                                              |
| ------------------------------------- | ----- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------- | ----------------------------------------------------- |
| releaseYear                           | date  | optional /^\d{4}$/ and 1990<=n<=2100, '' -> undefined; <input type=number inputMode=numeric> | @IsOptional @Type(Number) @IsInt @Min(1990) @Max(2100) | same            | Only date-like field in the group (year, not a date). |
| deviceBrandId                         | other | trim.regex(UUID_PATTERN)                                                                     | @IsUUID('loose')                                       | same            |                                                       |
| name                                  | other | trim.min(1).max(255)                                                                         | @IsString @MaxLength(255)                              | client-stricter | API accepts blank.                                    |
| slug                                  | other | trim.max(255).regex(SLUG_PATTERN)                                                            | @MaxLength(255) @Matches                               | same            |                                                       |
| series                                | other | trim.max(255)                                                                                | @MaxLength(255)                                        | same            |                                                       |
| metaTitle/metaDescription/description | other | seoTextFields (255/500) + description max 2000                                               | MaxLength 255/500/2000                                 | same            |                                                       |

- **Де помилка:** field (client) + toast (server)
- **Помилка сервера:** none; toast.error(toastModelCreateFailed/UpdateFailed) (create-device-model-view.tsx:43, edit-device-model-view.tsx:87)
- **Маска:** none
- **Асинхронний сид:** Rule 2b: useEffect([id]) reset (device-model-form.tsx:157-162); defaultValues EMPTY_VALUES at useForm
- **Дефекти:**
  - create/edit-device-model-view onError drops server message, no field mapping

#### `apps/store-admin/src/widgets/catalog-import-view/ui/import-dropzone.tsx`

- **Маршрут:** /catalog-import
- **zod:** none (no zod; accept='.xlsx' + wrongType check in import-dropzone.tsx:128,141)
- **DTO:** apps/store-api/src/catalog-import/dto/apply-import.dto.ts ApplyImportDto (excludedSkus string[], excludedFields Record) ; upload via FileInterceptor('file') in catalog-import.controller.ts:98 with MAX_IMPORT_BYTES limit

| Поле                                                   | Тип   | Клієнт                                        | Сервер                                                           | Збіг          | Примітка                                                                                                  |
| ------------------------------------------------------ | ----- | --------------------------------------------- | ---------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------- |
| file (.xlsx)                                           | other | extension/type check only (wrongType message) | multer limits fileSize=MAX_IMPORT_BYTES, files=1 (controller:44) | client-looser | No client-side size check found in the dropzone or view; an oversize file is rejected only by the server. |
| excludedSkus / excludedFields (plan-review checkboxes) | other | checkboxes, no validation                     | @IsArray @IsString each; @IsObject                               | same          | No price/date fields in the form; price changes appear only as read-only diff in plan review.             |

- **Де помилка:** field (wrong-type FieldError under dropzone) + toast (server upload/apply errors)
- **Помилка сервера:** toast.error(apiErrorMessage(error) ?? d.uploadFailed / d.applyFailed) (catalog-import-view.tsx:156-157,198-199) - uses server message but in toast; there is no field to map to
- **Маска:** none
- **Асинхронний сид:** n/a
- **Дефекти:**
  - import-dropzone.tsx: no client size pre-check against MAX_IMPORT_BYTES (server 413 surfaces as toast)

#### `apps/store-admin/src/features/category-delete/ui/category-delete-dialog.tsx`

- **Маршрут:** /categories (dialogs)
- **zod:** in-file zod schema in category-delete-dialog.tsx (~:399 zodResolver(schema)); move-to dialog not read in detail
- **DTO:** apps/store-api/src/category/dto/delete-category.dto.ts DeleteCategoryDto; update-category.dto.ts for move

| Поле                          | Тип   | Клієнт                              | Сервер                     | Збіг | Примітка                    |
| ----------------------------- | ----- | ----------------------------------- | -------------------------- | ---- | --------------------------- |
| newName (NEW_NAME_MAX_LENGTH) | other | maxLength NEW_NAME_MAX_LENGTH + zod | see delete-category.dto.ts | same | not compared field-by-field |

- **Де помилка:** field + toast (results)
- **Помилка сервера:** apiErrorStatus 404 special-case only (:180); results via toastResult; no setError found
- **Маска:** none
- **Асинхронний сид:** n/a
- **Дефекти:**
  - not audited in full: category-delete and move-to dialogs

> **Не досліджено / сумнівно:** apps/store-admin/src/features/product-bulk-color, product-bulk-group, product-bulk-status, product-bulk-compat, product-bulk-undo, product-device-compat (bulk dialogs; DTOs bulk-product-color.dto.ts, bulk-product-group.dto.ts, set-device-compat.dto.ts) - dirs exist but UI files were not mapped · apps/store-admin/src/features/product-specs-editor/ui/product-specs-editor.tsx (spec values -> update-product-specs.dto.ts) - only the toast on save was seen, schema/field rules not compared · apps/store-admin/src/features/attribute-definition-editor (attribute-definition-form.tsx) vs api attribute-definition DTOs - arguably catalog but not in the assigned list, not mapped · apps/store-admin/src/features/product-image-manager (upload / attach-image.dto.ts / upload-images.dto.ts) - file upload validation not examined · apps/store-admin/src/features/category-addon-template-picker + set-category-template.dto.ts - not examined · apps/store-admin/src/features/product-group-form/ui/group-positions-section.tsx and add-positions-dialog.tsx - nested position editing, not examined · apps/store-api update-_.dto.ts variants (update-product, update-category, update-brand, update-device-_, update-addon-service) were not read; assumed PartialType of create DTOs · apps/store-api ProductGroupAxisInputDto (product-group-axis-input.dto.ts) rules not read, so axes[].name length parity is unknown · Whether edit views render forms only after data is loaded (so Rule 2b [id]-keyed reset is safe) was not verified for every edit-*-view

### Адмінка · налаштування (6)

#### `apps/store-admin/src/features/site-contact-form/ui/site-contact-form.tsx`

- **Маршрут:** /settings/contact
- **zod:** apps/store-admin/src/features/site-contact-form/model/site-contact-schema.ts
- **DTO:** apps/store-api/src/site-contact/dto/update-site-contact.dto.ts UpdateSiteContactDto

| Поле                                 | Тип   | Клієнт                                                      | Сервер                                                                  | Збіг          | Примітка                                                                                                                                |
| ------------------------------------ | ----- | ----------------------------------------------------------- | ----------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| phone                                | phone | z.string().trim().min(1).max(50) - required, no shape check | @IsOptional @IsString @MaxLength(50) - no phone validator, no transform | different     | '222фіфів' passes client and server and is stored; client requires it, server optional; no @IsInternationalPhone/@IsUaPhone on this DTO |
| email                                | email | trim.min(1).email(); required                               | @IsOptional @Transform(normalizeEmail) @IsEmail @MaxLength(255)         | client-looser | client has no max(255); client does not lowercase (server does); zod email vs validator.js isEmail edge cases may differ                |
| workingHours                         | other | trim.max(255) optional\|''                                  | @IsOptional @IsString @MaxLength(255)                                   | same          | text built by working-hours-editor.tsx (time inputs, open<close check)                                                                  |
| viberLink/telegramLink/instagramLink | other | trim.url() optional\|'' (any scheme)                        | @IsUrl({protocols:[http,https]}) @MaxLength(500)                        | client-looser | javascript:alert(1) or >500 chars passes client, 400 on server; seo form uses optionalHttpUrl, this one does not                        |

- **Де помилка:** field (client, FieldError under input) + toast (server)
- **Помилка сервера:** site-contact-form.tsx:218 onError -> generic toast.error(toastUpdateFailed); no setError, no apiErrorMessage
- **Маска:** none - plain <Input {...register('phone')}> at site-contact-form.tsx:266-276; only a hint text
- **Асинхронний сид:** follows forms.md Rule 2b: defaultValues + reset() keyed to settings.id (site-contact-form.tsx:140); working-hours state uses render-time guard on settings.id (line 121). OK
- **Дефекти:**
  - site-contact-form.tsx:266 phone unmasked, unvalidated shape (accepts letters) both sides
  - site-contact-schema.ts:36 phone min(1).max(50) only; update-site-contact.dto.ts phone has no phone validator
  - site-contact-schema.ts:41-52 social links accept non-http(s) schemes and have no max(500)
  - site-contact-form.tsx:218 server 400 not mapped to fields
  - phone required on client but optional on server (blank = 'not sent', so cannot be cleared)

#### `apps/store-admin/src/features/pickup-point-form/ui/pickup-point-form-dialog.tsx`

- **Маршрут:** /settings/delivery (dialog from pickup-points-panel.tsx)
- **zod:** apps/store-admin/src/features/pickup-point-form/model/pickup-point-schema.ts
- **DTO:** apps/store-api/src/delivery/dto/pickup-point-admin.dto.ts CreatePickupPointDto / UpdatePickupPointDto

| Поле                           | Тип   | Клієнт                                                                        | Сервер                                                                                       | Збіг | Примітка                                                                                                                                            |
| ------------------------------ | ----- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| phone                          | phone | z.string().trim().max(50) optional, orNull on submit                          | @Transform(trimmedOrNull) @ValidateIf(not null) @IsString @MaxLength(50) - 'Free-form phone' | same | both too loose: '222фіфів' passes client and server (known issue); no digit-count/shape check; server has IsInternationalPhone available but unused |
| mapUrl                         | other | max(2048) + isHttpUrl (http(s), hostname contains '.')                        | @IsUrl({protocols:[http,https],require_protocol:true}) @MaxLength(2048)                      | same | minor: client isHttpUrl uses URL() and differs slightly from validator.js IsUrl (e.g. 'http://a.b_c')                                               |
| name/city/address/workingHours | other | name/city 255, address 500, workingHours 255 (trim, required for first three) | same limits, IsNotEmpty on first three                                                       | same | PICKUP_POINT_LIMITS mirrors DTO constants                                                                                                           |

- **Де помилка:** field (client, aria-invalid + error text) + toast (server)
- **Помилка сервера:** pickup-point-form-dialog.tsx:108 onError = () => toast.error(t.toastSaveFailed) generic; no setError, no apiErrorMessage
- **Маска:** none - textField('phone', t.phone, {type:'tel'}) plain input (line 191)
- **Асинхронний сид:** follows forms.md: defaultValues static EMPTY_PICKUP_POINT, reset() on open keyed to [open, pointId] (lines 89-95). OK
- **Дефекти:**
  - pickup-point-schema.ts:51 phone has no shape/digit validation; accepts '222фіфів' (server pickup-point-admin.dto.ts phone also only IsString/MaxLength(50))
  - pickup-point-form-dialog.tsx:108 server 400 -> generic toast, not field
  - pickup-point-form-dialog.tsx:191 phone unmasked

#### `apps/store-admin/src/features/seo-settings-form/ui/seo-settings-form.tsx`

- **Маршрут:** /settings/seo
- **zod:** apps/store-admin/src/features/seo-settings-form/model/seo-settings-schema.ts (+ shared/lib/seo-fields-schema.ts, shared/lib/http-url.ts)
- **DTO:** apps/store-api/src/seo-settings/dto/update-seo-settings.dto.ts UpdateSeoSettingsDto

| Поле                                                                                       | Тип   | Клієнт                                                             | Сервер                                             | Збіг          | Примітка                                                                                  |
| ------------------------------------------------------------------------------------------ | ----- | ------------------------------------------------------------------ | -------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------- |
| defaultOgImage                                                                             | other | optionalHttpUrl (http(s))                                          | @IsUrl({protocols:[http,https]}) @MaxLength(500)   | client-looser | client has no 500-char cap                                                                |
| additionalSameAsLinks                                                                      | other | textarea, each line isHttpUrl; no count/length cap                 | @ArrayMaxSize(20) @IsUrl each @MaxLength(500) each | client-looser | >20 lines or >500 chars per URL passes client, 400 on server                              |
| siteName/defaultMetaTitle/defaultMetaDescription/titleTemplate/verification/llmsTxtSummary | other | max 120/255/500/255/255/2000; titleTemplate regex /^[^%]_%s[^%]_$/ | identical MaxLength + same Matches regex           | same          | normalizeSiteVerificationValue intentionally duplicated client/server (comment in schema) |

- **Де помилка:** field (client) + toast (server)
- **Помилка сервера:** seo-settings-form.tsx:250 onError -> generic toast.error(toastUpdateFailed); no setError
- **Маска:** none (no phone/money/date fields)
- **Асинхронний сид:** follows forms.md Rule 2b: defaultValues + reset() keyed to settings.id (line 135); post-save reset(submitted). OK
- **Дефекти:**
  - seo-settings-schema.ts: no max(500) on defaultOgImage and sameAs lines, no 20-link cap
  - seo-settings-form.tsx:250 server 400 not mapped to fields
  - no phone/money/date fields in this form

#### `apps/store-admin/src/features/delivery-settings-form/ui/delivery-settings-form.tsx`

- **Маршрут:** /settings/delivery
- **zod:** apps/store-admin/src/features/delivery-settings-form/model/delivery-settings-schema.ts
- **DTO:** apps/store-api/src/delivery/dto/update-delivery-setting.dto.ts UpdateDeliverySettingDto

| Поле                           | Тип   | Клієнт                                                                                             | Сервер                                                    | Збіг          | Примітка                                                                                                            |
| ------------------------------ | ----- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------- |
| courierPrice                   | money | string; superRefine only if courierEnabled: required + parseDecimal(raw,2) (accepts comma, spaces) | @IsNumber({maxDecimalPlaces:2}) @Min(0) @Max(100000)      | client-looser | parseMoney has no 100000 cap check visible in schema (verify lines 32-36); value 999999 may pass client, 400 server |
| courierFreeFrom                | money | optional string; parseMoney when courierEnabled and non-blank                                      | @ValidateIf(not null) @IsNumber(2dp) @Min(0) @Max(100000) | client-looser | same potential missing 100000 cap; validated only while courier switched on                                         |
| defaultWeightKg                | other | parseWeight: decimal ≤3 places, 0.1..30, only when npEnabled                                       | @IsNumber(maxDecimalPlaces:3) @Min(0.1) @Max(30)          | same          |                                                                                                                     |
| courierCityName/senderCityName | other | required if courierEnabled; no max length                                                          | @MaxLength(255) (sender city 255, refs 100)               | client-looser | >255 chars passes client, 400 server                                                                                |

- **Де помилка:** field (client) + toast (server)
- **Помилка сервера:** delivery-settings-form.tsx:199 onError -> generic toast.error(toastUpdateFailed); no setError
- **Маска:** local MoneyInput wrapper (delivery-settings-form.tsx:425) - decimal keyboard + ₴ adornment only, not a real mask; weight is plain Input
- **Асинхронний сид:** RHF values prop + resetOptions keepDirtyValues:true (lines 123-129), post-save reset(mapSettingsToForm(saved)). Follows forms.md values/reset pattern
- **Дефекти:**
  - delivery-settings-schema.ts: no max length on courierCityName/senderCityName (DTO 255)
  - delivery-settings-schema.ts:32 parseMoney - confirm 0..100000 cap vs DTO @Max(100000)
  - delivery-settings-form.tsx:199 server 400 -> generic toast
  - MoneyInput is a private local component (line 419), not shared money-input.ts
  - shared money-input.ts / money-kop.ts not used here (UAH decimals as string->number)

#### `apps/store-admin/src/features/search-synonyms-form/ui/search-synonyms-form.tsx`

- **Маршрут:** /settings/search
- **zod:** apps/store-admin/src/features/search-synonyms-form/model/search-synonyms-schema.ts
- **DTO:** apps/store-api/src/search-synonyms/dto/update-search-synonyms.dto.ts UpdateSearchSynonymsDto / SearchSynonymGroupDto

| Поле           | Тип   | Клієнт                                                                                           | Сервер                                                                                                                                | Збіг | Примітка                                                                             |
| -------------- | ----- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------ |
| groups[].terms | other | comma-separated line; parse trim+lower+dedupe; /^[\p{L}\p{N}]+$/u, ≤40, 2..20 terms, ≤300 groups | normalizeSynonymTerms; @Matches(SYNONYM_TERM_PATTERN same regex) @MaxLength(40) @ArrayMin(2) @ArrayMax(20); groups @ArrayMaxSize(300) | same | limits duplicated (not shared) in client constants; no phone/email/money/date fields |

- **Де помилка:** field (client, per-row error + root message for groups) + toast (server)
- **Помилка сервера:** search-synonyms-form.tsx:164 onError -> toast.error(apiErrorMessage(error) ?? d.toastFailed); message text only, not mapped to row fields
- **Маска:** none
- **Асинхронний сид:** useEffect keyed on [settings] with !isDirty guard and eslint-disable (lines 129-133) - not id-keyed; deliberate comment; deviates from forms.md Rule 2b (reset keyed to id) but guards dirty
- **Дефекти:**
  - search-synonyms-form.tsx:129 reseed keyed on settings object (refetch while pristine resets; relies on isDirty) rather than id/values pattern
  - search-synonyms-form.tsx:164 server error is a toast, not mapped to the offending row
  - regex and limits duplicated client/server by hand

#### `apps/store-admin/src/widgets/notification-settings-view`

- **Маршрут:** /settings/notifications
- **zod:** none (no zod)
- **DTO:** none (apps/store-api/src/notification/dto/telegram-channel-status.dto.ts is response-only; actions are connect/test/disconnect, no input DTO fields)

- **Де помилка:** toast
- **Помилка сервера:** shop-chats-card.tsx:119-123,162 toast.error for test/disconnect failures; no form fields so no field mapping applicable
- **Маска:** none
- **Асинхронний сид:** n/a - no useForm; connect-telegram-dialog.tsx uses useState target only
- **Дефекти:**
  - no data-entry form with phone/email/money/date; only action buttons and a radio-like target choice

> **Не досліджено / сумнівно:** delivery-settings-schema.ts lines 32-36 parseMoney: did not read whether it enforces the 0..100000 cap (DTO @Max(100000)); verify · Whether other forms under /settings exist (only contact, seo, delivery, search, notifications routes found) - none else found · store-api site-contact controller/PUT route not opened; DTO read directly · Staff/permission settings and SEO redirects are outside this group

### Адмінка · персонал і клієнти (11)

#### `apps/store-admin/src/features/admin-auth/ui/login-form.tsx`

- **Маршрут:** /login
- **zod:** apps/store-admin/src/features/admin-auth/ui/login-form.tsx:20 (inline loginSchema)
- **DTO:** apps/store-api/src/auth/dto/login.dto.ts LoginDto

| Поле     | Тип   | Клієнт                                 | Сервер                                | Збіг            | Примітка                                                                                                                                 |
| -------- | ----- | -------------------------------------- | ------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| email    | email | z.string().email() (no trim/lowercase) | @Transform(normalizeEmail) + @IsEmail | client-stricter | ' A@B.com ' with surrounding spaces fails client zod .email() but the server would trim+lowercase it and accept; benign but inconsistent |
| password | other | min(1)                                 | @IsString @MinLength(1)               | same            | presence only on both sides, correct for login                                                                                           |

- **Де помилка:** field (client, FieldError + aria-invalid/describedby) + inline FormAlert block (server 401/generic/not-admin); no toast
- **Помилка сервера:** login-form.tsx:123-134 status 401 -> dict.login.errorInvalid, any other error -> errorGeneric in ONE FormAlert; no setError (intentional: API hides which field is wrong, TASK-274). 400 from DTO email validation shows generic text, not the field.
- **Маска:** none (no phone/money)
- **Асинхронний сид:** n/a (defaultValues from expiredSessionEmail already in context; comment at :87 cites forms.md rule 1 not applicable)
- **Дефекти:**
  - login-form.tsx:21 email zod rule is not shared with a common validator; uses z.string().email() while the API uses class-validator isEmail (different edge cases e.g. quoted locals, IDN)
  - login-form.tsx:129-134 a 400 (malformed email that passed zod) is shown as generic error rather than under the email field

#### `apps/store-admin/src/features/admin-password-change/ui/AdminPasswordChangeForm.tsx`

- **Маршрут:** /profile
- **zod:** none (no zod; hand-rolled validation in handleSubmit, lines 75-83 using shared/lib/password-policy.ts isStaffPassword)
- **DTO:** apps/store-api/src/auth/dto/change-password.dto.ts ChangePasswordDto (POST /api/auth/password/change)

| Поле            | Тип   | Клієнт                                                                                 | Сервер                                                                                                                      | Збіг           | Примітка                                                                                                                                                                                                |
| --------------- | ----- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| currentPassword | other | length>0                                                                               | @IsString @IsNotEmpty                                                                                                       | same           |                                                                                                                                                                                                         |
| newPassword     | other | isStaffPassword: len>=8 + STAFF_PASSWORD_REGEX /^(?=._\p{Ll})(?=._\p{Lu})(?=._\d)._$/u | @IsCustomerPassword() in DTO (lower+digit, min 8), then AuthService.changePassword adds strict staff rule for ADMIN/MANAGER | same           | effective rule same for staff; the DTO alone is looser, so a staff password without uppercase is rejected by the SERVICE with a 400 message that arrives via the form-level path, not under newPassword |
| confirmPassword | other | must equal newPassword                                                                 | none (client-only field)                                                                                                    | no-server-rule | expected                                                                                                                                                                                                |

- **Де помилка:** field (client: current/new/confirm under each field, aria-invalid) ; server: 401 -> field error under current + toast; other errors -> form-level message AND toast (duplicate)
- **Помилка сервера:** AdminPasswordChangeForm.tsx:94-104 onError: 401 -> setErrors({current}) + toast.error (same text twice); other -> setErrors({form: msg}) + toast.error(msg). 400 with newPassword message is NOT mapped to the newPassword field.
- **Маска:** PasswordInput + PasswordRequirements checklist
- **Асинхронний сид:** n/a (no server seed)
- **Дефекти:**
  - AdminPasswordChangeForm.tsx:97 and :103 toast duplicates the inline error already shown (toast must be only for errors without a field)
  - AdminPasswordChangeForm.tsx:100-102 server 400 about newPassword goes to generic form error instead of field 'next'
  - AdminPasswordChangeForm.tsx:54-57 hand-rolled useState instead of RHF+zod, so no shared schema
  - no check that newPassword !== currentPassword (neither client nor server DTO)

#### `apps/store-admin/src/features/staff-create/ui/CreateStaffWizard.tsx`

- **Маршрут:** /staff (dialog wizard: who -> access -> confirmAdmin -> login)
- **zod:** none (no zod; local const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/ at CreateStaffWizard.tsx:53 and isStaffPassword)
- **DTO:** apps/store-api/src/staff/dto/create-staff.dto.ts CreateStaffDto (POST /api/admin/staff); permissions via update-staff-permissions.dto.ts / apply-permission-template.dto.ts

| Поле      | Тип   | Клієнт                                            | Сервер                                                | Збіг          | Примітка                                                                                                                                                                                      |
| --------- | ----- | ------------------------------------------------- | ----------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| email     | email | /^[^\s@]+@[^\s@]+\.[^\s@]+$/ on email.trim()      | @Transform(normalizeEmail) + @IsEmail (no @MaxLength) | client-looser | 'a@b..c' and 'a b@c.d'(no, space blocked) but 'a@-b.c', 'a@b.c.' pass the client regex and fail class-validator isEmail -> 400; no max length on either side (login/other email DTOs use 254) |
| password  | other | isStaffPassword (>=8, lower+upper+digit, Unicode) | @IsStaffPassword() same regex + MinLength 8           | same          | regex duplicated in shared/lib/password-policy.ts and common/validators/password-policy.decorator.ts                                                                                          |
| firstName | other | none (trim only)                                  | @IsOptional @IsString @MaxLength(100)                 | client-looser | 101+ chars pass client, 400 on server                                                                                                                                                         |
| lastName  | other | none (trim only)                                  | @IsOptional @IsString @MaxLength(100)                 | client-looser | same as firstName                                                                                                                                                                             |
| role      | other | Select MANAGER/ADMIN, default MANAGER             | @IsEnum([ADMIN,MANAGER])                              | same          | owner-only for ADMIN enforced in service                                                                                                                                                      |

- **Де помилка:** field (email, password via FieldError) ; 409 -> field under email on step 1 + toast (duplicate); other errors -> FormAlert on last step + toast (duplicate)
- **Помилка сервера:** CreateStaffWizard.tsx:350-363 onError: 409 -> setEmailError(d.emailTaken)+setStep('who')+toast.error; else setFormError(message)+toast.error(message). 400 field messages (name length, email format) not mapped to fields. Partial failure after account creation (permissions/template) -> toast only + redirect, intentional (:305-311).
- **Маска:** none needed (no phone/money); PasswordInput + PasswordRequirements
- **Асинхронний сид:** asyncSeed pieces: templates list for the picker; pickTemplate copies template into granted state on user action (not render seed). Follows forms.md (explicit copy + gridKey remount); no render-time guard needed.
- **Дефекти:**
  - CreateStaffWizard.tsx:53 local EMAIL regex differs from API @IsEmail; no shared validator
  - CreateStaffWizard.tsx:461-475 firstName/lastName have no maxLength / schema while DTO caps at 100
  - CreateStaffWizard.tsx:357 and :362 toast.error duplicates inline error
  - CreateStaffWizard.tsx:276 email sent trimmed but not lowercased (server normalises, so only cosmetic)
  - no staff phone field in the wizard or DTO (CreateStaffDto has no phone)

#### `apps/store-admin/src/features/staff-permissions/ui/StaffPermissionsForm.tsx`

- **Маршрут:** /staff/[id]
- **zod:** none (checkbox grid + template Select, no text validation)
- **DTO:** apps/store-api/src/staff/dto/update-staff-permissions.dto.ts UpdateStaffPermissionsDto (PUT /api/admin/staff/:id/permissions); apply-permission-template.dto.ts ApplyPermissionTemplateDto (template apply)

| Поле        | Тип   | Клієнт                            | Сервер                                                                               | Збіг | Примітка                                  |
| ----------- | ----- | --------------------------------- | ------------------------------------------------------------------------------------ | ---- | ----------------------------------------- |
| permissions | other | Set of keys from server catalogue | @IsArray @IsString each @MaxLength(100) each + assertGrantablePermissions in service | same | non-grantable keys refused by service 400 |

- **Де помилка:** toast only (no field to attach to: list-level error)
- **Помилка сервера:** StaffPermissionsForm.tsx:202-205, 222-224 toast.error(apiErrorMessage ?? fallback). Acceptable (no per-field concept).
- **Маска:** none
- **Асинхронний сид:** Seeded from entity.permissions: follows forms.md Rule 1a, render-time signature guard `${userId}::${permissions}` with setGranted during render (lines 107-117). Caveat: signature change on background refetch overwrites unsaved ticks.
- **Дефекти:**
  - StaffPermissionsForm.tsx:107-117 signature includes server permissions, so a refetch/another tab edit silently discards the operator's unsaved ticks (dirty-check absent)

#### `apps/store-admin/src/features/permission-template-form/ui/PermissionTemplateDialog.tsx`

- **Маршрут:** /staff/templates (create/edit dialog)
- **zod:** none (no zod; handleSubmit lines 159-166 only checks name non-empty)
- **DTO:** apps/store-api/src/permission-template/dto/create-permission-template.dto.ts CreatePermissionTemplateDto; update-permission-template.dto.ts UpdatePermissionTemplateDto

| Поле        | Тип   | Клієнт                   | Сервер                                                        | Збіг          | Примітка                                                                                                             |
| ----------- | ----- | ------------------------ | ------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------- |
| name        | other | trim().length>0          | @IsString @MinLength(2) @MaxLength(100)                       | client-looser | 1-char name or 101+ chars pass client, 400 on server; uniqueness (conflict) also server-only                         |
| description | other | none (trim, empty->null) | @IsOptional @IsString @MaxLength(500)                         | client-looser | 501+ chars pass client, 400 on server; also sending null for description vs @IsOptional string - check null accepted |
| permissions | other | Set of keys              | @IsArray @IsString each @MaxLength(100) each, grantable check | same          |                                                                                                                      |

- **Де помилка:** inline block under whole form (role=alert) + toast (duplicate); name-required error is also the same block, not under the name input
- **Помилка сервера:** PermissionTemplateDialog.tsx:169-173 onError setError(message)+toast.error(message); no field mapping (e.g. 409 duplicate name or 400 name length not placed under name input).
- **Маска:** none
- **Асинхронний сид:** Seeded from template prop: follows forms.md render-time guard (signature `open::id::updatedAt`, lines 105-120), good; caveat: updatedAt refetch while open resets edits.
- **Дефекти:**
  - PermissionTemplateDialog.tsx:233-239 name Input has no aria-invalid / FieldError; error shown in generic block at :260
  - PermissionTemplateDialog.tsx:159-166 no min 2 / max 100 / max 500 client rules
  - PermissionTemplateDialog.tsx:172 toast duplicates inline error

#### `apps/store-admin/src/features/staff-account-actions/ui/TransferOwnershipDialog.tsx`

- **Маршрут:** /staff/[id] (dialog)
- **zod:** none (password.length===0 check at :61)
- **DTO:** apps/store-api/src/staff/dto/transfer-ownership.dto.ts TransferOwnershipDto (POST /api/admin/staff/:id/transfer-ownership)

| Поле     | Тип   | Клієнт   | Сервер                                            | Збіг | Примітка                                                                            |
| -------- | ----- | -------- | ------------------------------------------------- | ---- | ----------------------------------------------------------------------------------- |
| password | other | length>0 | @IsString @IsNotEmpty (presence only, deliberate) | same | empty-client message reuses d.transferWrongPassword (wrong text for an empty field) |

- **Де помилка:** inline role=alert block below input + toast (duplicate); input has no aria-invalid/describedby for the error
- **Помилка сервера:** TransferOwnershipDialog.tsx:98-105 401 -> d.transferWrongPassword, other -> apiErrorMessage; setError + toast.error. Not attached to the field.
- **Маска:** plain Input type=password (not PasswordInput)
- **Асинхронний сид:** n/a
- **Дефекти:**
  - TransferOwnershipDialog.tsx:61-63 empty password shows 'wrong password' message instead of 'required'
  - TransferOwnershipDialog.tsx:104 toast duplicates inline error
  - TransferOwnershipDialog.tsx:149-155 Input lacks aria-invalid and the error block is not linked via aria-describedby

#### `apps/store-admin/src/features/user-account-actions/ui/UserPasswordResetDialog.tsx`

- **Маршрут:** /staff/[id] (dialog; component lives in user-account-actions, calls useSetStaffPassword)
- **zod:** none (isStaffPassword at :56)
- **DTO:** apps/store-api/src/staff/dto/set-staff-password.dto.ts SetStaffPasswordDto (POST /api/admin/staff/:id/password)

| Поле        | Тип   | Клієнт                                           | Сервер                        | Збіг | Примітка                      |
| ----------- | ----- | ------------------------------------------------ | ----------------------------- | ---- | ----------------------------- |
| newPassword | other | isStaffPassword (>=8, lower+upper+digit Unicode) | @IsStaffPassword() same regex | same | regex duplicated in two files |

- **Де помилка:** inline role=alert block + toast (duplicate); weak-password message is also the generic block not under input
- **Помилка сервера:** UserPasswordResetDialog.tsx:76-82 setError(message)+toast.error; no field mapping, input has no aria-invalid
- **Маска:** plain Input type=password; no PasswordInput, no PasswordRequirements checklist (unlike wizard and profile form)
- **Асинхронний сид:** n/a
- **Дефекти:**
  - UserPasswordResetDialog.tsx:112-118 plain Input without aria-invalid/FieldError, no PasswordInput/show-hide, no requirements list
  - UserPasswordResetDialog.tsx:81 toast duplicates inline error

#### `apps/store-admin/src/features/user-account-actions/ui/ChangeUserEmailDialog.tsx`

- **Маршрут:** /users/[id] (owner-only dialog)
- **zod:** apps/store-admin/src/features/user-account-actions/model/change-user-email-schema.ts (buildChangeUserEmailSchema)
- **DTO:** apps/store-api/src/auth/dto/email-change.dto.ts OperatorEmailChangeDto (POST /api/users/:id/email)

| Поле     | Тип   | Клієнт                                                               | Сервер                                                              | Збіг | Примітка                                                                                                                  |
| -------- | ----- | -------------------------------------------------------------------- | ------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------- |
| newEmail | email | z.string().trim().toLowerCase().email().max(254) + refine != current | @Transform(normalizeEmail) @IsEmail @MaxLength(254)                 | same | same-as-current check is client-only (server also refuses via service); zod .email() vs isEmail edge differences possible |
| reason   | other | trim().min(5).max(500) (max has no message)                          | @Transform trim @IsString @IsNotEmpty @MinLength(5) @MaxLength(500) | same | client .max(500) without message plus textarea maxLength=500                                                              |

- **Де помилка:** field (client errors under each field via role=alert) ; server errors: inline block + toast (duplicate)
- **Помилка сервера:** ChangeUserEmailDialog.tsx:100-107 onError setServerError(message)+toast.error(message); 409 'already registered' is not mapped to newEmail field, 400 on reason not mapped to reason field
- **Маска:** none
- **Асинхронний сид:** n/a (empty form; reset on close)
- **Дефекти:**
  - ChangeUserEmailDialog.tsx:105-106 409 email-taken and DTO 400s shown as generic block + toast instead of under the newEmail/reason field
  - ChangeUserEmailDialog.tsx:105 toast duplicates inline error
  - schema file hand-parsed with safeParse into local useState instead of RHF; zod messages not shared

#### `apps/store-admin/src/features/user-notes/ui/user-notes-panel.tsx`

- **Маршрут:** /users/[id] (notes tab)
- **zod:** none (const USER_NOTE_MAX_LENGTH=2000 duplicated at user-notes-panel.tsx:31)
- **DTO:** apps/store-api/src/user-note/dto/create-user-note.dto.ts CreateUserNoteDto (POST /api/admin/users/:userId/notes)

| Поле | Тип   | Клієнт                                                  | Сервер                                                   | Збіг | Примітка                                                                                                                                                                                        |
| ---- | ----- | ------------------------------------------------------- | -------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| body | other | trim non-empty, length<=2000 (counter, button disabled) | @Transform trim @IsString @MinLength(1) @MaxLength(2000) | same | limit constant duplicated; client counts untrimmed body.length for tooLong while server trims first, so a 2001-char body with trailing spaces is blocked client-side though server would accept |

- **Де помилка:** field (counter turns red + aria-invalid); server failure -> toast only with generic text
- **Помилка сервера:** user-notes-panel.tsx:101 onError: toast.error(d.notesToastFailed) generic, server message ignored; no field mapping
- **Маска:** none (Textarea)
- **Асинхронний сид:** n/a (plain useState, always starts empty; documented at :59-64)
- **Дефекти:**
  - user-notes-panel.tsx:101 server error text discarded (no apiErrorMessage), toast only
  - user-notes-panel.tsx:82 tooLong uses untrimmed body.length vs trimmed length validated on server
  - user-notes-panel.tsx:31 duplicated 2000 constant

#### `apps/store-admin/src/features/user-account-actions/ui/UserRoleChange.tsx`

- **Маршрут:** /users/[id] and /staff/[id] (role Select + confirm dialog)
- **zod:** none (Select of enum)
- **DTO:** apps/store-api/src/staff/dto/update-staff-role.dto.ts UpdateStaffRoleDto (PATCH /api/admin/staff/:id/role)

| Поле | Тип   | Клієнт                                | Сервер                                        | Збіг | Примітка |
| ---- | ----- | ------------------------------------- | --------------------------------------------- | ---- | -------- |
| role | other | Select options CUSTOMER/ADMIN/MANAGER | @IsEnum(UserRole); assertMayAssign in service | same |          |

- **Де помилка:** toast only (select action, no text field)
- **Помилка сервера:** UserRoleChange.tsx:146-148 toast.error(apiErrorMessage ?? fallback)
- **Маска:** none
- **Асинхронний сид:** Seeded from currentRole prop with render-time guard (syncedRole state at :101-102), follows forms.md.

#### `apps/store-admin/src/features/staff-account-actions/ui/StaffStatusToggle.tsx`

- **Маршрут:** /staff/[id], /users/[id] (confirm dialogs)
- **zod:** none (no input fields)
- **DTO:** apps/store-api/src/staff/dto/update-staff-status.dto.ts UpdateStaffStatusDto {isActive:boolean} for status; delete/ban have no body DTO

| Поле     | Тип   | Клієнт              | Сервер     | Збіг | Примітка                                  |
| -------- | ----- | ------------------- | ---------- | ---- | ----------------------------------------- |
| isActive | other | boolean from button | @IsBoolean | same | no text inputs, no email/phone/money/date |

- **Де помилка:** toast (action buttons, no field)
- **Помилка сервера:** toast with apiErrorMessage; acceptable, no field exists
- **Маска:** none
- **Асинхронний сид:** n/a

> **Не досліджено / сумнівно:** Admin /users customer CRM has NO profile edit form: UserDetailView.tsx only displays phone (customerPhone); no admin screen edits customer name/phone, so no phone field exists in this group (staff DTOs have no phone either; admin shared/lib/phone.ts unused here) · widgets/admin-profile/ui/AdminProfileView.tsx: only embeds AdminPasswordChangeForm, no editable name/phone/email profile form found · staff-list/user-list filter sheets (StaffFilterSheet.tsx, UserFilterSheet.tsx, search inputs bound to StaffListQueryDto/UserListQueryDto) not audited as forms; search maxLength 200 server-side, client not checked · ApplyPermissionTemplateDto and UpdatePermissionTemplateDto exist but not read line by line; UpdatePermissionTemplateDto assumed same constraints as Create · Backend password change (AuthService.changePassword) strict staff re-check message path not read; inferred from DTO comment · Email-change request/confirm for customers (RequestEmailChangeDto) is storefront, not in this group · Whether user.controller operator email route is mounted at /api/users/:id/email (OwnerOnly at line ~370/431) not confirmed against the generated hook

### Адмінка · контент і маркетинг (12)

#### `apps/store-admin/src/features/discount-form/ui/discount-form.tsx`

- **Маршрут:** /discounts/new, /discounts/[id]
- **zod:** apps/store-admin/src/features/discount-form/model/discount-schema.ts
- **DTO:** apps/store-api/src/discount/dto/create-discount.dto.ts CreateDiscountDto (+update-discount.dto.ts)

| Поле                          | Тип   | Клієнт                                                                                                        | Сервер                                                                                                                                             | Збіг | Примітка                                                                                                                                                                                                                    |
| ----------------------------- | ----- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| value (amount / percent)      | money | string trim min1, Number>0, <=2 decimals via /[.,]\d{3,}/, PERCENT 1..100 refine; input type=number step=0.01 | @Type(Number) @IsNumber({maxDecimalPlaces:2}) @Min(0.01); PERCENT 1..100 checked in service assertValidDefinition (discount.service.ts:380) as 400 | same | Number('Infinity') or '1e400' passes client >0 and is refused by server; type=number input mostly blocks it. No money mask/component (plain type=number), money-input.ts not used. Money is sent as UAH float, not kopecks. |
| minSpend                      | money | optional string, ''\|Number>=0, <=2 decimals                                                                  | @ValidateIf(!==undefined) @Type(Number) @IsNumber({maxDecimalPlaces:2}) @Min(0)                                                                    | same | On update client sends null to clear; check UpdateDiscountDto accepts null (ValidateIf) - not verified.                                                                                                                     |
| startsAt                      | date  | string trim optional, type=date; windowInOrder startsAt<=expiresAt (YYYY-MM-DD)                               | @IsOptional @IsDateString; service: startsAt must be before expiresAt (strict >, 400)                                                              | same | Client converts Kyiv day start -> ISO (fromKyivDateStart). Client allows same-day start/expiry, server compares instants 00:00 vs 23:59:59.999 so OK.                                                                       |
| expiresAt                     | date  | string trim optional, type=date, order refine                                                                 | @IsOptional @IsDateString                                                                                                                          | same | Kyiv day end ISO.                                                                                                                                                                                                           |
| maxRedemptions / perUserLimit | other | optional int string >=1, 0 has own message                                                                    | @IsOptional @Type(Number) @IsInt @Min(1)                                                                                                           | same | Server DTO has no @Max; client none either.                                                                                                                                                                                 |
| code                          | other | trim min1 max64 toUpperCase                                                                                   | @IsNotEmpty @MaxLength(64) trim+upper                                                                                                              | same | Duplicate code is BadRequest 400 'A discount with code ... already exists' (discount.service.ts:290,333), no code/field.                                                                                                    |

- **Де помилка:** field (client, FieldError + aria-invalid) + toast (server)
- **Помилка сервера:** No setError. create-discount-view.tsx:62 / edit-discount-view.tsx onError -> toast.error(apiErrorMessage(error) ?? fallback). Server 'code already exists' / percent range / date order 400s land in toast, not under the code/value/date field.
- **Маска:** none (type=number for value/minSpend, type=date for dates)
- **Асинхронний сид:** follows forms.md Rule 2b: reset({...EMPTY_VALUES,...defaultValues}) in useEffect keyed to [id] (discount-form.tsx:~280, eslint-disable exhaustive-deps); create/duplicate seed via sync defaultValues. Read-only branch for no discounts:write.
- **Дефекти:**
  - apps/store-admin/src/widgets/discount-form-view/ui/edit-discount-view.tsx onError and create-discount-view.tsx:62: server 400 for duplicate code goes only to toast; should setError('code').
  - apps/store-admin/src/features/discount-form/ui/discount-form.tsx:436-446: money input is raw type=number, not the shared money-input mask; locale comma input blocked/inconsistent.
  - discount-schema.ts: Number('Infinity') passes value>0 (minor).

#### `apps/store-admin/src/features/page-form/ui/page-form.tsx`

- **Маршрут:** /pages/new, /pages/[id]
- **zod:** apps/store-admin/src/features/page-form/model/page-schema.ts
- **DTO:** apps/store-api/src/pages/dto/create-page.dto.ts CreatePageDto extends PublishFieldsDto (publishing/dto/publish-fields.dto.ts)

| Поле                                       | Тип   | Клієнт                                                                                                           | Сервер                                                                                                       | Збіг            | Примітка                                                                                                 |
| ------------------------------------------ | ----- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------- | -------------------------------------------------------------------------------------------------------- |
| scheduledAt                                | date  | string optional, required when status=SCHEDULED; type=datetime-local, converted via fromKyivDateTimeLocal -> ISO | @IsOptional @IsDateString (PublishFieldsDto); past or absent collapses to PUBLISHED in resolve-publish-state | client-stricter | Client does not reject a past scheduledAt (home-block form does); server silently publishes immediately. |
| title                                      | other | trim min1 max255                                                                                                 | @IsString @MaxLength(255) (no min)                                                                           | client-stricter | '' accepted by API.                                                                                      |
| slug                                       | other | SLUG_PATTERN max255, optional; HUB requires known hub slug                                                       | @Matches same regex @MaxLength(255); HUB slug check in service                                               | same            | regex duplicated in two places, not shared.                                                              |
| content                                    | other | non-empty text after strip tags; <=100000 chars                                                                  | @IsString @MaxLength(MAX_RICH_TEXT_CONTENT_LENGTH) + sanitize; no non-empty rule                             | client-stricter | Client limit hardcoded 100_000 (page-schema.ts); must equal server constant - verify.                    |
| keywords/ogImage/metaTitle/metaDescription | other | <=20 tags of <=60; optionalHttpUrl; meta 255/500                                                                 | @IsKeywordsField (20/60) @IsOgImageField (IsUrl require_tld:false, 2048) meta 255/500                        | client-looser   | ogImage client has no 2048 max; client accepts only http/https, fine.                                    |

- **Де помилка:** field (client) + toast (server)
- **Помилка сервера:** No setError. create-page-view.tsx:37 / edit-page-view.tsx:133 toast.error(pageSaveConflictMessage(error,kind) ?? generic); only 409 PAGE_SLUG_TAKEN is worded, as a toast instead of a slug field error. Other 400s are generic toast.
- **Маска:** none
- **Асинхронний сид:** follows Rule 2b: reset in useEffect keyed to id (page-form.tsx:~215); after save reset(getValues()).
- **Дефекти:**
  - apps/store-admin/src/widgets/page-form-view/ui/create-page-view.tsx:37 and edit-page-view.tsx:133: slug-taken 409 is a toast; should be setError('slug').
  - page-schema.ts scheduledAt: no past-date check, server silently publishes now.

#### `apps/store-admin/src/features/banner-form/ui/banner-form.tsx`

- **Маршрут:** /banners/new, /banners/[id]
- **zod:** apps/store-admin/src/features/banner-form/model/banner-schema.ts
- **DTO:** apps/store-api/src/banners/dto/create-banner.dto.ts CreateBannerDto extends PublishFieldsDto

| Поле           | Тип   | Клієнт                                                                             | Сервер                                                                                                     | Збіг            | Примітка                                                                               |
| -------------- | ----- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------------------------------------- |
| scheduledAt    | date  | required when SCHEDULED; datetime-local, Kyiv -> ISO                               | PublishFieldsDto @IsOptional @IsDateString                                                                 | client-stricter | no past check on client.                                                               |
| scheduledUntil | date  | optional; until > scheduledAt (only when both set); sent only when status != DRAFT | @IsOptional @IsDateString @Validate(PublicationWindowConstraint) end>start (only when scheduledAt present) | same            | For PUBLISHED banners client does not send scheduledAt so server never compares; fine. |
| ctaHref        | other | trim max2048; required if ctaLabel set                                             | @IsString @MaxLength(2048), no required-with-label                                                         | client-stricter | client rule only.                                                                      |
| imageUrl       | other | trim max2048, no URL check                                                         | @IsString @MaxLength(2048)                                                                                 | same            | neither validates URL/relative path.                                                   |

- **Де помилка:** field (client) + toast (server)
- **Помилка сервера:** No setError. create-banner-view.tsx:52 / edit-banner-view.tsx:99 toast.error(bannerWriteErrorMessage(error) ?? generic). Only 409 BANNER_PROMO_TILE_LIMIT worded (entities/banner/lib/write-error.ts), as toast.
- **Маска:** none
- **Асинхронний сид:** follows Rule 2b: reset keyed to id (banner-form.tsx:~187).
- **Дефекти:**
  - banner-form: 400s from server (e.g. title/subtitle) go to generic toast, not fields; apiErrorMessage not used in edit-banner-view.tsx:99 fallback.

#### `apps/store-admin/src/features/blog-post-form/ui/blog-post-form.tsx`

- **Маршрут:** /blog/new, /blog/[id]
- **zod:** apps/store-admin/src/features/blog-post-form/model/blog-post-schema.ts
- **DTO:** apps/store-api/src/blog/dto/create-blog-post.dto.ts CreateBlogPostDto extends PublishFieldsDto

| Поле                                        | Тип   | Клієнт                                                   | Сервер                                                                                                                                                 | Збіг            | Примітка                                                                                        |
| ------------------------------------------- | ----- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | ----------------------------------------------------------------------------------------------- |
| scheduledAt                                 | date  | required when SCHEDULED; datetime-local Kyiv->ISO        | @IsOptional @IsDateString                                                                                                                              | client-stricter | no past check; server collapses to publish-now.                                                 |
| readingMinutes                              | other | /^\d+$/ optional (0 passes)                              | @Type(Number) @IsInt @Min(1)                                                                                                                           | client-looser   | '0' passes client, 400 on server 'at least 1'; error then only a toast.                         |
| coverImageUrl                               | other | zod .url() (any scheme, e.g. mailto:/javascript:)        | @IsUrl({require_tld:false}) @MaxLength(2048)                                                                                                           | client-looser   | client has no max 2048; 'ftp://' fine on both; 'mailto:a@b.c' passes zod url, refused by IsUrl. |
| categoryId                                  | other | min1 string                                              | @IsUUID('loose')                                                                                                                                       | client-looser   | select-driven so low risk.                                                                      |
| title/excerpt/authorName/slug/content/meta* | other | title<=255 excerpt min1<=500 author min1<=120 slug regex | title<=255 excerpt<=500 author<=120 slug regex; metaDescription no max on server blog DTO (create-blog-post.dto.ts metaDescription has only @IsString) | client-stricter | client caps metaDescription at 500, server blog has no cap (mismatch harmless).                 |

- **Де помилка:** field (client) + toast (server)
- **Помилка сервера:** No setError, no apiErrorMessage. create-blog-post-view.tsx:39 toast.error(dict.blogPosts.toastCreateFailed); edit-blog-post-view.tsx:95 toast.error(d.toastUpdateFailed). Server 409 'Slug is already taken' (blog.service.ts:249,312) is lost behind a generic toast.
- **Маска:** none
- **Асинхронний сид:** follows Rule 2b: reset keyed to id (blog-post-form.tsx:~228); category select guards reset order (line ~408); post-save reset(getValues()).
- **Дефекти:**
  - apps/store-admin/src/widgets/blog-post-form-view/ui/create-blog-post-view.tsx:39 and edit-blog-post-view.tsx:95: generic toast hides slug conflict and any 400; map to field via setError.
  - blog-post-schema.ts readingMinutes accepts 0 but API @Min(1).
  - blog-post-schema.ts coverImageUrl uses zod .url() not isHttpUrl; differs from ogImage rule and server IsUrl.

#### `apps/store-admin/src/features/blog-category-form/ui/blog-category-form.tsx`

- **Маршрут:** /blog (categories dialog)
- **zod:** apps/store-admin/src/features/blog-category-form/model/blog-category-schema.ts
- **DTO:** apps/store-api/src/blog/dto/create-blog-category.dto.ts CreateBlogCategoryDto

| Поле | Тип   | Клієнт                       | Сервер                              | Збіг            | Примітка                               |
| ---- | ----- | ---------------------------- | ----------------------------------- | --------------- | -------------------------------------- |
| name | other | trim min1 max120             | @IsString @MaxLength(120)           | client-stricter | empty only blocked client side.        |
| slug | other | SLUG_PATTERN max255 optional | @Matches same regex @MaxLength(255) | same            | 409 'Slug is already taken' on server. |

- **Де помилка:** field (client) + toast (server)
- **Помилка сервера:** No setError. blog-category-form-dialog.tsx:101 and :149 toast.error(c.toastCreateFailed/UpdateFailed) generic; slug conflict not shown at slug field.
- **Маска:** none
- **Асинхронний сид:** follows Rule 2b: reset keyed to id (blog-category-form.tsx:60-65).
- **Дефекти:**
  - apps/store-admin/src/widgets/blog-category-form-view/ui/blog-category-form-dialog.tsx:101,149: slug 409 as generic toast.

#### `apps/store-admin/src/features/carousel-form/ui/carousel-form.tsx`

- **Маршрут:** /carousels/new, /carousels/[id]
- **zod:** apps/store-admin/src/features/carousel-form/model/carousel-schema.ts
- **DTO:** apps/store-api/src/carousels/dto/create-carousel.dto.ts CreateCarouselDto extends PublishFieldsDto

| Поле        | Тип   | Клієнт                                            | Сервер                                              | Збіг            | Примітка                     |
| ----------- | ----- | ------------------------------------------------- | --------------------------------------------------- | --------------- | ---------------------------- |
| scheduledAt | date  | required when SCHEDULED; datetime-local Kyiv->ISO | @IsOptional @IsDateString                           | client-stricter | no past check.               |
| itemLimit   | other | /^\d+$/ and 1..24                                 | @IsInt @Min(1) @Max(24)                             | same            |                              |
| categoryId  | other | required when source=CATEGORY (string)            | @ValidateIf(source=CATEGORY) @IsUUID('loose')       | same            |                              |
| title       | other | trim min1 max255                                  | @Transform(trim) @IsString @MaxLength(255) (no min) | client-stricter | empty title accepted by API. |

- **Де помилка:** field (client) + toast (server)
- **Помилка сервера:** No setError. create-carousel-view.tsx:48 toast dict.carousels.toastCreateFailed; edit-carousel-view.tsx:115 toast.error(d.toastUpdateFailed); items-save failures separate toast (:59,:127). apiErrorMessage not used.
- **Маска:** none
- **Асинхронний сид:** follows Rule 2b: reset keyed to id (carousel-form.tsx:~169).
- **Дефекти:**
  - create-carousel-view.tsx:48 / edit-carousel-view.tsx:115: generic toasts, server 400 text discarded.

#### `apps/store-admin/src/features/faq-form/ui/faq-form.tsx`

- **Маршрут:** /faq (dialog)
- **zod:** apps/store-admin/src/features/faq-form/model/faq-schema.ts
- **DTO:** apps/store-api/src/faq/dto/create-faq-item.dto.ts CreateFaqItemDto (+update-faq-item.dto.ts)

| Поле     | Тип   | Клієнт            | Сервер                     | Збіг            | Примітка                                               |
| -------- | ----- | ----------------- | -------------------------- | --------------- | ------------------------------------------------------ |
| question | other | trim min1 max500  | @IsString @MaxLength(500)  | client-stricter | server allows empty.                                   |
| answer   | other | trim min1 max5000 | @IsString @MaxLength(5000) | client-stricter | server allows empty. No phone/email/money/date fields. |

- **Де помилка:** field (client) + toast (server)
- **Помилка сервера:** No setError. faq-form-dialog.tsx:75 and :88 generic toast.error(dict.faq.toastUpdateFailed/CreateFailed).
- **Маска:** none
- **Асинхронний сид:** follows Rule 2b: reset keyed to id (faq-form.tsx:~128).
- **Дефекти:**
  - faq-form-dialog.tsx:75,88: generic toast, apiErrorMessage not used.

#### `apps/store-admin/src/features/home-block-editor/ui/home-block-dialog.tsx`

- **Маршрут:** /home (dialog)
- **zod:** apps/store-admin/src/features/home-block-editor/model/home-block-form.ts (hand-written validateDraft, no zod, no RHF; useState draft)
- **DTO:** apps/store-api/src/home-block/dto/create-home-block.dto.ts CreateHomeBlockDto (+HomeBlockPublishFieldsDto, update-home-block.dto.ts)

| Поле         | Тип   | Клієнт                                                                                   | Сервер                                                                                    | Збіг            | Примітка                                  |
| ------------ | ----- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------- | ----------------------------------------- |
| scheduledAt  | date  | show=schedule: required and must be in future (scheduleError) ; datetime-local Kyiv->ISO | @ValidateIf(whenSent) @IsDateString @OnlyWithScheduledStatus; past collapses to PUBLISHED | client-stricter | only form that checks past on client.     |
| title (TABS) | other | trim non-empty (no max)                                                                  | @MinLength(1) @MaxLength(255)                                                             | client-looser   | 256+ chars passes client, 400 on server.  |
| tabs         | other | 1..20 entries                                                                            | @ArrayMinSize(1) @ArrayMaxSize(20) @ArrayUnique @IsUUID each                              | same            | uniqueness presumably enforced by picker. |

- **Де помилка:** field (client, errors state) + toast (server)
- **Помилка сервера:** No setError equivalent. home-block-dialog.tsx:195 toast.error(t.toastFailed) generic.
- **Маска:** none
- **Асинхронний сид:** useState draft reset on open (home-block-dialog.tsx:~135, draftFromBlock) - dialog-lifetime seed, edit mode seeded from entity at open; no refetch guard (dialog is modal, acceptable); not RHF.
- **Дефекти:**
  - home-block-form.ts validateDraft: title has no 255 max (server @MaxLength(255)).
  - home-block-dialog.tsx:195: generic toast discards server text; not on RHF/zod like other forms.

#### `apps/store-admin/src/features/home-block-editor/ui/schedule-home-block-dialog.tsx`

- **Маршрут:** /home (dialog)
- **zod:** none (zod) - scheduleError() in home-block-form.ts
- **DTO:** apps/store-api/src/home-block/dto/update-home-block.dto.ts (HomeBlockPublishFieldsDto: status, scheduledAt)

| Поле        | Тип  | Клієнт                                                      | Сервер                                 | Збіг | Примітка                                                    |
| ----------- | ---- | ----------------------------------------------------------- | -------------------------------------- | ---- | ----------------------------------------------------------- |
| scheduledAt | date | required + future, datetime-local, sent as at.toISOString() | @IsDateString @OnlyWithScheduledStatus | same | Kyiv conversion via fromKyivDateTimeLocal in scheduleError. |

- **Де помилка:** field (single error state) + toast (server)
- **Помилка сервера:** schedule-home-block-dialog.tsx:93 generic toast.error(t.toastFailed).
- **Маска:** none
- **Асинхронний сид:** n/a (empty local state).
- **Дефекти:**
  - schedule-home-block-dialog.tsx:90 uses at.toISOString() of a value parsed elsewhere; verify same Kyiv conversion as create dialog.

#### `apps/store-admin/src/features/carousel-to-home/ui/add-carousel-to-home-dialog.tsx`

- **Маршрут:** /carousels (dialog)
- **zod:** none (zod); apps/store-admin/src/features/carousel-to-home/model/add-to-home.ts
- **DTO:** apps/store-api/src/home-block/dto/create-home-block.dto.ts (type CAROUSEL, position, status)

| Поле     | Тип   | Клієнт                    | Сервер                       | Збіг | Примітка                         |
| -------- | ----- | ------------------------- | ---------------------------- | ---- | -------------------------------- |
| position | other | select of positionOptions | @Type(Number) @IsInt @Min(0) | same | No phone/email/money/date input. |

- **Де помилка:** toast only (select-driven)
- **Помилка сервера:** add-carousel-to-home-dialog.tsx:129 generic toast.error(t.toastFailed).
- **Маска:** none
- **Асинхронний сид:** n/a (home blocks list read when opened).

#### `apps/store-admin/src/features/review-reply/ui/review-reply-action.tsx`

- **Маршрут:** /reviews (dialog)
- **zod:** none (zod) - inline RHF, REPLY_MAX_LENGTH=1000 constant
- **DTO:** apps/store-api/src/review/dto/create-review-reply.dto.ts CreateReviewReplyDto

| Поле | Тип   | Клієнт                                                                                | Сервер                            | Збіг | Примітка                                                                          |
| ---- | ----- | ------------------------------------------------------------------------------------- | --------------------------------- | ---- | --------------------------------------------------------------------------------- |
| body | other | textarea maxLength=1000 attr; empty trimmed blocked by disabled button / early return | trim @IsNotEmpty @MaxLength(1000) | same | constant duplicated on client (comment says mirrors DTO); not generated from DTO. |

- **Де помилка:** toast (server); client has disabled button + counter, no field message
- **Помилка сервера:** review-reply-action.tsx:228 toast.error(apiErrorMessage(error) ?? d.replyError) - server text surfaced but as toast, body has no setError.
- **Маска:** none
- **Асинхронний сид:** follows Rule 2a: values:{body: existing} + keepDirtyValues, form disposed with dialog (documented in file header :165-185).
- **Дефекти:**
  - review-reply-action.tsx: no zod schema; empty body silently returns in onSubmit (line ~213) with no message.

#### `apps/store-admin/src/widgets/message-inbox/ui/message-detail-sheet.tsx`

- **Маршрут:** /messages (sheet)
- **zod:** none (zod) - inline RHF NoteFormValues
- **DTO:** apps/store-api/src/contact/dto/update-contact-message.dto.ts UpdateContactMessageDto

| Поле      | Тип   | Клієнт                          | Сервер                                      | Збіг          | Примітка                                                                                                                                        |
| --------- | ----- | ------------------------------- | ------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| adminNote | other | no maxLength found in component | @IsOptional trim @IsString @MaxLength(2000) | client-looser | 2001+ chars: no client check, 400 on server then generic toast. Not a reply to customer (no email sending in this form); no phone/email fields. |

- **Де помилка:** toast only
- **Помилка сервера:** message-detail-sheet.tsx:164 toast.error(d.updateError) generic; apiErrorMessage not used.
- **Маска:** none
- **Асинхронний сид:** follows Rule 2a: values:{adminNote} + resetOptions keepDirtyValues (line ~139).
- **Дефекти:**
  - apps/store-admin/src/widgets/message-inbox/ui/message-detail-sheet.tsx:139-164: no 2000 max on client; server 400 shown as generic toast.

> **Не досліджено / сумнівно:** subscribers (apps/store-admin/src/widgets/subscriber-list): no form found, only list/filter; newsletter DTOs (subscribe.dto.ts, unsubscribe.dto.ts) are storefront-facing - not mapped here · reviews moderation (widgets/review-moderation): bulk approve/reject actions only, no input form found besides ReplyForm; bulk-review-moderation.dto.ts not mapped · media metadata field (features/media-picker/ui/media-metadata-field.tsx) and content-image-field.tsx: alt-text inputs, not traced to DTO · features/site-preview/ui/site-preview-button.tsx Input (preview-token, create-preview-token.dto.ts): not traced · update-discount.dto.ts null-clearing (ValidateIf for null on minSpend/maxRedemptions/startsAt) not verified · promo tiles: handled inside banner-form (PROMO_TILE placement, promo-tile-slots.ts), no separate form · carousel items editor (set-carousel-items.dto.ts) not traced as a form · reorder DTOs (drag and drop) are not forms · seo-settings-form and site-contact-form belong to settings group, not mapped here
