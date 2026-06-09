---
name: tdd
description: Test-Driven Development workflow for critical e-commerce modules. Enforces Red-Green-Refactor cycle with NestJS/Jest patterns.
license: MIT
compatibility: claude-code
metadata:
  audience: developers
  workflow: testing
---

## What I Do

I guide the implementation of features using the Test-Driven Development (TDD) methodology. I enforce a strict Red-Green-Refactor cycle for all critical modules in this e-commerce project.

## When to Use Me

Use me when implementing or modifying:

- Cart calculation logic (totals, discounts, bundles)
- Discount system (coupon validation, percentage/flat discounts, stacking)
- Inventory management (stock reservation, oversell prevention)
- Authentication flows (JWT, refresh tokens, password hashing)
- Order processing (state transitions, payment validation)

Only use me when the user specifically asks for TDD or uses the `/test` command with a TDD focus.

## TDD Workflow

### Step 1: RED вЂ” Write a Failing Test

1. Understand the requirement precisely.
2. Identify the module under test (Service layer for NestJS).
3. Write a test that clearly describes the expected behavior.
4. Run the test вЂ” it MUST fail. If it passes, the test is wrong.

```typescript
// Example: cart.service.spec.ts
describe("CartService.calculateTotal", () => {
  it("should apply percentage discount to cart total", () => {
    const items: CartItem[] = [{ productId: "1", quantity: 2, unitPrice: 100 }];
    const discount: Discount = { type: "percentage", value: 10 };

    const result = service.calculateTotal(items, discount);

    expect(result).toBe(180); // 200 - 10%
  });
});
```

### Step 2: GREEN вЂ” Write Minimum Code

1. Implement only what's needed to pass the test.
2. No gold-plating, no extra features.
3. Run the test вЂ” it MUST pass.

```typescript
// Example: minimal implementation
calculateTotal(items: CartItem[], discount?: Discount): number {
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  if (!discount) return subtotal;
  if (discount.type === 'percentage') {
    return subtotal * (1 - discount.value / 100);
  }
  return subtotal;
}
```

### Step 3: REFACTOR вЂ” Improve Quality

1. Improve code while keeping all tests green.
2. Extract reusable logic, improve naming, remove duplication.
3. Run the FULL test suite to confirm nothing broke.

## NestJS Testing Patterns

### Unit Tests (Jest)

```typescript
import { Test, TestingModule } from "@nestjs/testing";
import { CartService } from "./cart.service";
import { CartRepository } from "./cart.repository";

describe("CartService", () => {
  let service: CartService;

  const mockCartRepository = {
    findById: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: CartRepository, useValue: mockCartRepository },
      ],
    }).compile();

    service = module.get<CartService>(CartService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
});
```

### E2E Tests (Supertest)

```typescript
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { AppModule } from "../app.module";

describe("CartController (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });
});
```

## Test Commands

```bash
# All tests
npm run test

# Workspace-specific
npm run test -w apps/store-api

# E2E tests
npm run test:e2e

# Single file
npx jest -- apps/store-api/src/cart/cart.service.spec.ts

# With coverage
npm run test:cov -w apps/store-api
```

## Rules

- NEVER skip the RED phase. A test that doesn't fail first is invalid.
- NEVER write production code without a failing test.
- Each test must focus on a single behavior.
- Use `describe`/`it` blocks with clear, descriptive names.
- Mock external dependencies (repository, external APIs) but NEVER mock the unit under test.
- Always run the relevant test suite after changes.
