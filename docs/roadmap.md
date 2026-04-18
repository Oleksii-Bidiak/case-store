# Project Roadmap

## Overview

This roadmap outlines the phased development of the Mobile Accessories E-Commerce Store. Each phase builds on the previous one, delivering incremental value.

---

## Phase 1: Foundation (MVP Core)

**Goal:** Set up the monorepo, database, and core backend APIs.

| Area | Deliverables |
|------|-------------|
| **Infrastructure** | Monorepo setup (npm workspaces), Docker Compose (PostgreSQL, Redis), CI/CD pipeline |
| **Database** | Prisma schema for core entities (User, Product, Category, Cart, Order), seed data |
| **Backend Core** | Auth module (register, login, refresh tokens), User module, Product module (CRUD), Category module |
| **API Contract** | Swagger/OpenAPI spec, Orval configuration, generated typed hooks |
| **Frontend Scaffold** | Next.js App Router setup (store-client, store-admin), FSD folder structure, shared UI kit (shadcn/ui) |

**Exit Criteria:** Can register/login, browse products via API, Swagger docs available.

---

## Phase 2: Storefront & Cart

**Goal:** Functional storefront where users can browse, add to cart, and prepare for checkout.

| Area | Deliverables |
|------|-------------|
| **Cart Backend** | Cart module (add/remove/update items, calculate totals with discounts), CartRepository, CartService (TDD) |
| **Storefront Pages** | Home page, product listing, product detail, cart page |
| **Frontend Features** | AddToCart, CartWidget, ProductCard, CategoryNav |
| **Search** | Basic product search (database-level), category filtering |
| **State Management** | TanStack Query setup, cart state with optimistic updates |

**Exit Criteria:** Users can browse products, add them to cart, see totals with discounts applied.

---

## Phase 3: Checkout & Orders

**Goal:** Complete purchase flow from cart to order confirmation.

| Area | Deliverables |
|------|-------------|
| **Order Backend** | Order module (create from cart, status transitions), OrderRepository, OrderService (TDD) |
| **Payment Integration** | Payment gateway stub (Stripe or similar), webhook handler |
| **Checkout Frontend** | Checkout form (address, shipping, payment), order confirmation page |
| **Email** | Order confirmation email (Nodemailer or similar service) |

**Exit Criteria:** User can complete a purchase, receive order confirmation.

---

## Phase 4: Admin Panel

**Goal:** Admin users can manage products, categories, orders, and users.

| Area | Deliverables |
|------|-------------|
| **Admin Auth** | Admin login, role-based access control (RBAC) |
| **Product Management** | CRUD for products, categories, image upload |
| **Order Management** | View orders, update status (processing, shipped, delivered) |
| **User Management** | View users, ban/unban accounts |
| **Dashboard** | Revenue metrics, order counts, popular products |

**Exit Criteria:** Admin can manage the entire catalog and order flow.

---

## Phase 5: Polish & Production

**Goal:** Production readiness — performance, security, SEO, monitoring.

| Area | Deliverables |
|------|-------------|
| **Performance** | Redis caching for product listings, CDN for images, pagination optimization |
| **SEO** | Dynamic sitemap.xml, Schema.org microdata, meta tags, SSR for product pages |
| **Security** | Rate limiting, CSRF protection, input sanitization audit,Helmet headers |
| **Monitoring** | Pino structured logging, Sentry error tracking, request duration logging |
| **Abandoned Carts** | Detection + email follow-up (cron job) |
| **Analytics** | Google Analytics 4 e-commerce events, Facebook Pixel integration |

**Exit Criteria:** Application passes security audit, loads fast, SEO-optimized, fully monitored.

---

## How to Use This Roadmap

1. **Start a phase:** Use `/plan Phase N: <description>` to generate a detailed plan.
2. **Track progress:** Check `BACKLOG.md` for current task status.
3. **Continue work:** Say "What's next?" and the agent will read BACKLOG.md and suggest the next task.
4. **Complete a phase:** All tasks in BACKLOG.md marked as ✅ before moving to the next phase.

## Phase Dependencies

```
Phase 1 (Foundation)
    ↓
Phase 2 (Storefront & Cart)
    ↓
Phase 3 (Checkout & Orders)
    ↓
Phase 4 (Admin Panel)
    ↓
Phase 5 (Polish & Production)
```

Each phase depends on the previous one being substantially complete before starting.