# TASK-012: Implement Product Module (CRUD, Filtering)

## Overview

Implement the Product module following Clean Architecture (Controller → Service → Repository) with TDD. The Product module provides public product browsing (list, detail, search) and admin product management (create, update, activate/deactivate).

## Prisma Schema Reference

```prisma
model Product {
  id              String   @id @default(uuid())
  name            String
  slug            String   @unique
  description     String?
  price           Decimal  @db.Decimal(10, 2)
  compareAtPrice  Decimal? @map("compare_at_price") @db.Decimal(10, 2)
  sku             String?  @unique
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
```

## Architecture

### File Structure

```
apps/store-api/src/product/
  product.module.ts
  product.controller.ts
  product.service.ts
  product.repository.ts
  index.ts
  dto/
    create-product.dto.ts
    update-product.dto.ts
    product-list-query.dto.ts
    index.ts
  entities/
    product.entity.ts
    index.ts
```

### API Endpoints

#### Public (authenticated or anonymous)

| Method | Route               | Description                                  |
| ------ | ------------------- | -------------------------------------------- |
| GET    | /api/products       | List active products (paginated, filterable) |
| GET    | /api/products/:slug | Get product by slug (with variants & images) |

#### Admin (ADMIN role required)

| Method | Route                        | Description          |
| ------ | ---------------------------- | -------------------- |
| POST   | /api/products                | Create a new product |
| PUT    | /api/products/:id            | Update a product     |
| PATCH  | /api/products/:id/deactivate | Deactivate a product |
| PATCH  | /api/products/:id/activate   | Activate a product   |

### Sub-tasks

| Sub-task   | Description                                                                   | Status |
| ---------- | ----------------------------------------------------------------------------- | ------ |
| TASK-012-A | Create Product DTOs (CreateProductDto, UpdateProductDto, ProductListQueryDto) | ✅     |
| TASK-012-B | Create ProductEntity with fromPrisma() static method                          | ✅     |
| TASK-012-C | Implement ProductRepository with CRUD + filtering                             | ✅     |
| TASK-012-D | Write failing unit tests for ProductService (TDD Red)                         | ✅     |
| TASK-012-E | Implement ProductService (TDD Green)                                          | ✅     |
| TASK-012-F | Implement ProductController with endpoints                                    | ✅     |
| TASK-012-G | Register ProductModule in AppModule                                           | ✅     |
| TASK-012-H | Write E2E tests for Product endpoints                                         | ✅     |

## Design Decisions

1. **Public listing only shows active products** — `findAll` (public) filters by `isActive: true` by default; admin listing can show all.
2. **Slug-based public detail** — Public product detail uses slug (SEO-friendly URLs). Admin detail uses ID.
3. **Price as Decimal** — Prisma `Decimal` maps to `string` in TypeScript to avoid floating-point issues. The entity exposes `price` and `compareAtPrice` as strings.
4. **Category relation** — Products include their category name in responses (via `include`).
5. **Variants & images** — Product detail includes related variants and images.
6. **Slug auto-generation** — If slug is not provided during creation, it's generated from the name (lowercase, spaces→hyphens, strip special chars).
7. **Unique constraints** — slug and sku must be unique. Service validates before creating.
