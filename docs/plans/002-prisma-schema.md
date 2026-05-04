# Plan: Prisma Schema Design (User, Product, Category + Core Entities)

> **Status:** ✅ Done
> **Phase:** Phase 1 — Foundation (MVP Core)
> **Created:** 2026-04-27
> **Last Updated:** 2026-04-27

## Overview

Design and implement the complete Prisma schema for the Mobile Accessories E-Commerce Store. This defines the foundational data model that all backend modules, API endpoints, and frontend features will depend on. The schema covers core entities needed for Phase 1 (User, Product, Category) plus related entities required for proper relational integrity (Cart, Order, Address, Review, and supporting models).

## Scope

### In Scope

- Prisma schema with all core models: User, Category, Product, ProductVariant, ProductImage, Cart, CartItem, Order, OrderItem, Address, Review
- Enum types: UserRole, OrderStatus, PaymentStatus, AddressType
- Proper relations, indexes, and constraints
- Soft-delete support via `isActive` flags where appropriate
- Slug fields for SEO-friendly URLs
- Self-referential category hierarchy
- Initial `npx prisma migrate dev` execution
- Seed data script for development

### Out of Scope

- Coupon/Discount models — Phase 2 (Cart module)
- Payment transaction models — Phase 3 (Checkout & Orders)
- Full-text search index — Phase 5 (Polish & Production)
- Image upload/storage logic — Phase 4 (Admin Panel)

## User Stories

1. **As a customer**, I want to create an account with my email and password, so that I can place orders and track my purchase history.
2. **As a customer**, I want to browse products organized by categories, so that I can find the mobile accessories I need.
3. **As a customer**, I want to see product variants (color, model compatibility) with different prices and stock levels, so that I can choose the right option.
4. **As an admin**, I want to manage categories in a hierarchy (e.g., Cases → iPhone Cases), so that the store navigation is organized.
5. **As an admin**, I want to manage products with multiple images and variants, so that customers have complete product information.
6. **As a customer**, I want to save shipping addresses, so that checkout is faster for repeat purchases.
7. **As a customer**, I want to leave reviews on products I purchased, so that I can share my experience with other shoppers.

## Technical Design

### Data Model

The complete Prisma schema for the core e-commerce domain:

```prisma
// Enums

enum UserRole {
  CUSTOMER
  ADMIN
}

enum OrderStatus {
  PENDING
  CONFIRMED
  PROCESSING
  SHIPPED
  DELIVERED
  CANCELLED
  REFUNDED
}

enum PaymentStatus {
  PENDING
  PAID
  FAILED
  REFUNDED
}

enum AddressType {
  SHIPPING
  BILLING
}

// Models

model User {
  id            String    @id @default(uuid())
  email         String    @unique
  passwordHash  String    @map("password_hash")
  firstName     String?   @map("first_name")
  lastName      String?   @map("last_name")
  phone         String?
  role          UserRole  @default(CUSTOMER)
  isActive      Boolean   @default(true) @map("is_active")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  cart          Cart?
  orders        Order[]
  addresses     Address[]
  reviews       Review[]

  @@map("users")
}

model Category {
  id          String     @id @default(uuid())
  name        String
  slug        String     @unique
  description String?
  image       String?
  parentId    String?    @map("parent_id")
  parent      Category?  @relation("CategoryHierarchy", fields: [parentId], references: [id])
  children    Category[] @relation("CategoryHierarchy")
  isActive    Boolean    @default(true) @map("is_active")
  sortOrder   Int        @default(0) @map("sort_order")
  createdAt   DateTime   @default(now()) @map("created_at")
  updatedAt   DateTime   @updatedAt @map("updated_at")

  products    Product[]

  @@index([slug])
  @@index([parentId])
  @@map("categories")
}

model Product {
  id              String   @id @default(uuid())
  name            String
  slug            String   @unique
  description     String?
  price           Decimal  @db.Decimal(10, 2)
  compareAtPrice  Decimal? @map("compare_at_price") @db.Decimal(10, 2)
  sku             String?
  categoryId      String   @map("category_id")
  category        Category @relation(fields: [categoryId], references: [id])
  isActive        Boolean  @default(true) @map("is_active")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  variants        ProductVariant[]
  images          ProductImage[]
  reviews         Review[]
  orderItems      OrderItem[]
  cartItems       CartItem[]

  @@index([slug])
  @@index([categoryId])
  @@index([isActive])
  @@map("products")
}

model ProductVariant {
  id        String   @id @default(uuid())
  productId String   @map("product_id")
  product   Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  name      String   // e.g., "Black / iPhone 15 Pro"
  sku       String?
  price     Decimal  @db.Decimal(10, 2)
  stock     Int      @default(0)
  attributes Json?   // e.g., {"color": "black", "model": "iPhone 15 Pro"}
  isActive  Boolean  @default(true) @map("is_active")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  orderItems  OrderItem[]
  cartItems   CartItem[]

  @@index([productId])
  @@index([sku])
  @@map("product_variants")
}

model ProductImage {
  id        String   @id @default(uuid())
  productId String   @map("product_id")
  product   Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  url       String
  alt       String?
  sortOrder Int      @default(0) @map("sort_order")
  createdAt DateTime @default(now()) @map("created_at")

  @@index([productId])
  @@map("product_images")
}

model Cart {
  id        String   @id @default(uuid())
  userId    String   @unique @map("user_id")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  items     CartItem[]

  @@map("carts")
}

model CartItem {
  id        String   @id @default(uuid())
  cartId    String   @map("cart_id")
  cart      Cart     @relation(fields: [cartId], references: [id], onDelete: Cascade)
  productId String   @map("product_id")
  product   Product  @relation(fields: [productId], references: [id])
  variantId String?  @map("variant_id")  // Optional - some products have no variants
  variant   ProductVariant? @relation(fields: [variantId], references: [id])
  quantity  Int      @default(1)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@unique([cartId, productId, variantId])
  @@index([cartId])
  @@map("cart_items")
}

model Order {
  id              String        @id @default(uuid())
  userId          String        @map("user_id")
  user            User          @relation(fields: [userId], references: [id])
  status          OrderStatus   @default(PENDING)
  paymentStatus   PaymentStatus @default(PENDING) @map("payment_status")
  subtotal        Decimal       @db.Decimal(10, 2)
  discount        Decimal       @default(0) @db.Decimal(10, 2)
  shippingCost    Decimal       @default(0) @map("shipping_cost") @db.Decimal(10, 2)
  tax             Decimal       @default(0) @db.Decimal(10, 2)
  total           Decimal       @db.Decimal(10, 2)
  shippingAddress Json?         @map("shipping_address") // {city, warehouse, address, ref}
  billingAddress  Json?         @map("billing_address")  // Same structure
  notes           String?
  createdAt       DateTime      @default(now()) @map("created_at")
  updatedAt       DateTime      @updatedAt @map("updated_at")

  items           OrderItem[]

  @@index([userId])
  @@index([status])
  @@index([createdAt(sort: Desc)])
  @@map("orders")
}

model OrderItem {
  id        String   @id @default(uuid())
  orderId   String   @map("order_id")
  order     Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  productId String   @map("product_id")
  product   Product  @relation(fields: [productId], references: [id])
  quantity  Int
  price     Decimal  @db.Decimal(10, 2) // Price at time of purchase
  createdAt DateTime @default(now()) @map("created_at")

  @@index([orderId])
  @@map("order_items")
}

model Address {
  id          String      @id @default(uuid())
  userId      String      @map("user_id")
  user        User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  type        AddressType
  firstName   String      @map("first_name")
  lastName    String      @map("last_name")
  company     String?
  address1    String      @map("address_line_1")
  address2    String?     @map("address_line_2")
  city        String
  state       String?
  postalCode  String      @map("postal_code")
  country     String      @default("UA")
  phone       String?
  isDefault   Boolean     @default(false) @map("is_default")
  createdAt   DateTime    @default(now()) @map("created_at")
  updatedAt   DateTime    @updatedAt @map("updated_at")

  @@index([userId])
  @@map("addresses")
}

model Review {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  productId String   @map("product_id")
  product   Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  rating    Int      // 1-5
  comment   String?
  isActive  Boolean  @default(false) @map("is_active") // Requires admin approval
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@unique([userId, productId]) // One review per user per product
  @@index([productId])
  @@index([isActive])
  @@map("reviews")
}
```

### Design Decisions

| Decision                                                    | Rationale                                                                            |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `Decimal` type for prices                                   | Avoids floating-point precision issues in financial calculations                     |
| `isActive` flags instead of soft-delete                     | Simpler queries, easier to toggle visibility without orphaned relations              |
| One cart per user (`userId @unique`)                        | Simplifies cart logic; anonymous carts not needed for MVP                            |
| `CartItem` optionally links to `ProductVariant`             | Supports variant selection while allowing products without variants                  |
| `OrderItem` stores `price` snapshot                         | Preserves historical price at time of purchase, independent of current product price |
| `attributes` as JSON on `ProductVariant`                    | Flexible schema for variant properties (color, size, model) without rigid columns    |
| `shippingAddress`/`billingAddress` as Json on `Order`       | Structured storage for Novaposhta pickup points                                      |
| Review requires admin approval (`isActive @default(false)`) | Prevents spam; admin moderates before reviews go public                              |
| Self-referential `Category` hierarchy                       | Supports unlimited nesting (Cases → Phone Cases → iPhone Cases)                      |

### Backend (NestJS — Clean Architecture)

No new modules are created by this task. The schema enables future modules:

| Future Module       | Depends On Models                               |
| ------------------- | ----------------------------------------------- |
| Auth (TASK-010)     | User                                            |
| User (TASK-011)     | User, Address                                   |
| Product (TASK-012)  | Product, ProductVariant, ProductImage, Category |
| Category (TASK-013) | Category                                        |
| Cart (TASK-021)     | Cart, CartItem, Product, ProductVariant         |
| Order (TASK-031)    | Order, OrderItem, User, Product                 |

### API Contract

No endpoints are created by this task. The schema defines the data shapes that future Swagger decorators and Orval hooks will use.

### Frontend (Next.js — FSD)

No frontend components are created by this task. The generated Prisma Client types will be used by Orval to generate typed API hooks in subsequent tasks.

## Tasks

### TASK-006-A: Define Prisma Schema Models

**Type:** feat
**Scope:** store-api
**Complexity:** M
**TDD Required:** No
**Depends on:** TASK-009-B (Prisma ORM configured)

**Acceptance Criteria:**

- [ ] `apps/store-api/prisma/schema.prisma` contains all models: User, Category, Product, ProductVariant, ProductImage, Cart, CartItem, Order, OrderItem, Address, Review
- [ ] All enums defined: UserRole, OrderStatus, PaymentStatus, AddressType
- [ ] All relations properly configured with `@relation` attributes
- [ ] Indexes defined on frequently queried fields (slug, categoryId, userId, status)
- [ ] Unique constraints on: User.email, Category.slug, Product.slug, Cart.userId, CartItem(cartId+productId+variantId), Review(userId+productId)
- [ ] `npx prisma validate` passes with zero errors
- [ ] `npx prisma generate` succeeds and produces typed Prisma Client

**Files to create/modify:**

- `apps/store-api/prisma/schema.prisma` — Complete schema with all models, enums, relations, and indexes

---

### TASK-006-B: Create Initial Prisma Migration

**Type:** feat
**Scope:** store-api
**Complexity:** S
**TDD Required:** No
**Depends on:** TASK-006-A

**Acceptance Criteria:**

- [ ] Migration file created in `apps/store-api/prisma/migrations/`
- [ ] Migration name follows convention: `YYYYMMDDHHMMSS_init_core_schema`
- [ ] `npx prisma migrate dev` executes successfully against the development database
- [ ] All tables created in PostgreSQL (verify with `npx prisma db pull` or Prisma Studio)
- [ ] Database tables match the schema exactly (column names, types, constraints, indexes)

**Files to create/modify:**

- `apps/store-api/prisma/migrations/[timestamp]_init_core_schema/migration.sql` — Auto-generated by Prisma

---

### TASK-006-C: Create Seed Data Script

**Type:** chore
**Scope:** store-api
**Complexity:** M
**TDD Required:** No
**Depends on:** TASK-006-B

**Acceptance Criteria:**

- [ ] Seed script at `apps/store-api/prisma/seed.ts` exists
- [ ] Seed script is idempotent (can be run multiple times without duplicating data)
- [ ] `npx prisma db seed` executes successfully
- [ ] Seeded data is visible in Prisma Studio

**Seed Data Requirements:**

**Users:**

- `admin@store.com` — ADMIN role
- `customer@store.com` — CUSTOMER role

**Categories:**

- **Cases** (with subcategories: iPhone, Samsung, Xiaomi)
- **Chargers** (with subcategories: Wall, Car, Wireless)
- **Cables** (with subcategories: Lightning, USB-C, Micro-USB)
- **Screen Protectors**

**Products:**

- Phone cases with color variants (Black, White, Blue, Red)
- Chargers: 20W, 30W, 65W power options
- Cables: 1m, 2m, 3m length options
- Screen protectors (tempered glass, film)

**Files to create/modify:**

- `apps/store-api/prisma/seed.ts` — Seed script with sample data
- `apps/store-api/package.json` — Add `"prisma": { "seed": "tsx prisma/seed.ts" }` configuration

## Migration Steps

1. **Write the schema** — Replace the placeholder content in `schema.prisma` with the full schema from the Technical Design section
2. **Validate** — Run `npx prisma validate` to check for syntax and relation errors
3. **Generate client** — Run `npx prisma generate` to produce the typed Prisma Client
4. **Create migration** — Run `npx prisma migrate dev --name init_core_schema` to create and apply the migration
5. **Verify tables** — Open Prisma Studio (`npx prisma studio`) to confirm all tables, columns, and relations are correct
6. **Create seed script** — Write `prisma/seed.ts` with sample data for development
7. **Run seed** — Execute `npx prisma db seed` to populate the database
8. **Verify seed data** — Confirm seeded records appear in Prisma Studio

## Risks & Mitigations

| Risk                                                  | Mitigation                                                                                                                                                                               |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration fails on existing database                  | This is the first migration — no existing data to conflict. If Docker container was previously used with a different schema, reset with `docker compose down -v && docker compose up -d` |
| Decimal precision issues in calculations              | Using `@db.Decimal(10, 2)` for all monetary fields; application layer will handle Decimal ↔ number conversion carefully                                                                  |
| CartItem linking to Product instead of ProductVariant | Acceptable for MVP; Phase 2 cart module can add variant-level tracking via a migration                                                                                                   |
| JSON attributes on ProductVariant lose type safety    | Document expected attribute shapes; add Zod validation at the service layer when reading/writing variants                                                                                |
| Seed script not idempotent                            | Use `upsert` operations instead of `create` for all seed data                                                                                                                            |
| Category hierarchy depth causes N+1 queries           | Limit UI to 2-3 levels; use Prisma's `include` with depth control; add caching in Phase 5                                                                                                |

## Notes

- This schema is designed for the **MVP scope**. Future phases will extend it:
  - **Phase 2:** Add Coupon, Discount, and potentially CartItem.variantId
  - **Phase 3:** Add PaymentTransaction, ShippingMethod, TaxRule
  - **Phase 4:** Add AdminActivityLog, MediaAsset (for image management)
  - **Phase 5:** Add SearchIndex, AnalyticsEvent
- The `Decimal` type from Prisma requires careful handling in NestJS services. Use `Number()` conversion for JSON serialization, but keep `Decimal` for calculations to avoid precision loss.
- All `id` fields use UUID (`@default(uuid())`) for security (non-sequential, non-guessable IDs).
- The `Cart` model uses a 1:1 relation with `User` — one cart per user. Anonymous/guest carts are out of scope for MVP.
- `Review.isActive @default(false)` means reviews are hidden until an admin approves them — this is a moderation safeguard.
- The `Order` model stores addresses as serialized strings rather than FK references. This preserves the exact address at time of purchase even if the user later modifies their saved addresses.
