---
name: frontend-testing
description: Test React/Next.js components and hooks using React Testing Library, Vitest, and MSW. Covers component testing, hook testing, and integration patterns for FSD architecture.
license: MIT
compatibility: claude-code
metadata:
  audience: developers
  workflow: scaffolding
---

## What I Do

I provide testing patterns for React/Next.js frontend components and hooks using React Testing Library, Vitest, and MSW (Mock Service Worker), following FSD architecture conventions.

## When to Use Me

Use me when writing tests for components, hooks, or pages in `apps/store-client/src/` or `apps/store-admin/src/`.

## Testing Stack

| Tool                                 | Purpose                                                  |
| ------------------------------------ | -------------------------------------------------------- |
| **Vitest**                           | Test runner (Jest-compatible API, native ESM)            |
| **React Testing Library**            | Component testing (render, query, interact)              |
| **@testing-library/jest-dom**        | Custom DOM matchers (`toBeVisible`, `toHaveTextContent`) |
| **MSW**                              | API mocking for integration tests                        |
| **@tanstack/react-query** test utils | Query hook testing                                       |

## Setup

### Vitest Config

```typescript
// apps/store-client/vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/shared/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/shared/api/generated/**", "src/**/*.d.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

### Test Setup

```typescript
// src/shared/test/setup.ts
import "@testing-library/jest-dom";
import { server } from "./msw-server";

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### MSW Server

```typescript
// src/shared/test/msw-server.ts
import { setupServer } from "msw/node";
import { handlers } from "./msw-handlers";

export const server = setupServer(...handlers);
```

```typescript
// src/shared/test/msw-handlers.ts
import { http, HttpResponse } from "msw";

export const handlers = [
  http.get("*/products", () => {
    return HttpResponse.json({
      data: [
        { id: "1", name: "iPhone Case", price: 29.99, inStock: true },
        { id: "2", name: "Samsung Case", price: 24.99, inStock: true },
      ],
      meta: { page: 1, limit: 12, total: 2, totalPages: 1 },
    });
  }),

  http.get("*/products/:id", ({ params }) => {
    return HttpResponse.json({
      data: { id: params.id, name: "iPhone Case", price: 29.99, inStock: true },
    });
  }),

  http.post("*/auth/login", async ({ request }) => {
    const body = await request.json();
    if (body.email === "user@example.com" && body.password === "password") {
      return HttpResponse.json({ data: { accessToken: "mock-token" } });
    }
    return HttpResponse.json(
      { error: "Invalid credentials", statusCode: 401 },
      { status: 401 },
    );
  }),
];
```

## Testing Patterns by FSD Layer

### Shared Layer вЂ” UI Components

```typescript
// src/shared/ui/button/button.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './button';

describe('Button', () => {
  it('renders with text', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click me</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Click me</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('applies variant styles', () => {
    render(<Button variant="destructive">Delete</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-destructive');
  });
});
```

### Entities Layer вЂ” API Hooks

```typescript
// src/entities/product/api/product-hooks.test.tsx
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGetProducts } from '@/shared/api/generated/product/product';
import { server } from '@/shared/test/msw-server';
import { http, HttpResponse } from 'msw';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useGetProducts', () => {
  it('fetches products successfully', async () => {
    const { result } = renderHook(() => useGetProducts({ limit: 12 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.data).toHaveLength(2);
  });

  it('handles server error', async () => {
    server.use(
      http.get('*/products', () => HttpResponse.json({ error: 'Server error' }, { status: 500 }))
    );

    const { result } = renderHook(() => useGetProducts({ limit: 12 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
```

### Features Layer вЂ” Business Interactions

```typescript
// src/features/add-to-cart/ui/add-to-cart-button.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AddToCartButton } from './add-to-cart-button';
import { server } from '@/shared/test/msw-server';
import { http, HttpResponse } from 'msw';

const product = { id: '1', name: 'iPhone Case', price: 29.99, inStock: true };

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('AddToCartButton', () => {
  it('adds product to cart on click', async () => {
    render(<AddToCartButton product={product} />, { wrapper: createWrapper() });

    const button = screen.getByRole('button', { name: /add.*cart/i });
    await userEvent.click(button);

    expect(screen.getByRole('button')).toHaveTextContent('Adding...');
  });

  it('shows "Out of stock" when product is unavailable', () => {
    render(<AddToCartButton product={{ ...product, inStock: false }} />, {
      wrapper: createWrapper(),
    });
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button')).toHaveTextContent('Out of stock');
  });

  it('shows error state on API failure', async () => {
    server.use(
      http.post('*/cart/items', () => HttpResponse.json({ error: 'Cart full' }, { status: 400 }))
    );

    render(<AddToCartButton product={product} />, { wrapper: createWrapper() });

    await userEvent.click(screen.getByRole('button'));
    // Error handling UI assertion
  });
});
```

### Widgets Layer вЂ” Composite Blocks

```typescript
// src/widgets/product-card/ui/product-card.test.tsx
import { render, screen } from '@testing-library/react';
import { ProductCard } from './product-card';

const product = {
  id: '1',
  name: 'iPhone Case',
  slug: 'iphone-case',
  price: 29.99,
  compareAtPrice: 39.99,
  images: ['/img.jpg'],
  inStock: true,
  categoryId: 'cat1',
};

describe('ProductCard', () => {
  it('renders product name and price', () => {
    render(<ProductCard product={product} />);
    expect(screen.getByText('iPhone Case')).toBeInTheDocument();
    expect(screen.getByText('$29.99')).toBeInTheDocument();
  });

  it('shows compare-at price when available', () => {
    render(<ProductCard product={product} />);
    expect(screen.getByText('$39.99')).toBeInTheDocument();
  });

  it('has accessible add-to-cart button', () => {
    render(<ProductCard product={product} />);
    expect(screen.getByRole('button', { name: /add iphone case to cart/i })).toBeInTheDocument();
  });
});
```

## Zod Validation Testing

```typescript
// src/features/checkout/model/checkout-schema.test.ts
import { checkoutSchema } from "./checkout-schema";

describe("checkoutSchema", () => {
  it("validates a correct checkout form", () => {
    const result = checkoutSchema.safeParse({
      firstName: "Ivan",
      lastName: "Petrenko",
      email: "ivan@example.com",
      phone: "+380991234567",
      address: "Kyiv, Khreshchatyk 1",
      paymentMethod: "card",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = checkoutSchema.safeParse({
      firstName: "Ivan",
      lastName: "Petrenko",
      email: "not-an-email",
      phone: "+380991234567",
      address: "Kyiv, Khreshchatyk 1",
      paymentMethod: "card",
    });
    expect(result.success).toBe(false);
    expect(result.error.issues[0].path).toContain("email");
  });

  it("rejects missing required fields", () => {
    const result = checkoutSchema.safeParse({});
    expect(result.success).toBe(false);
    expect(result.error.issues.length).toBeGreaterThan(0);
  });
});
```

## Test Commands

```bash
# All frontend tests
npm run test -w apps/store-client
npm run test -w apps/store-admin

# Watch mode
npx vitest --config apps/store-client/vitest.config.ts --watch

# Single file
npx vitest run src/features/add-to-cart/ui/add-to-cart-button.test.tsx

# Coverage
npx vitest run --coverage
```

## Rules

- ALWAYS test user behavior, not implementation details.
- ALWAYS use `screen.getByRole()` and `screen.getByText()` over `getByTestId()`.
- ALWAYS mock API calls with MSW вЂ” never mock fetch/axios directly.
- ALWAYS wrap hook tests with `QueryClientProvider` when testing TanStack Query hooks.
- ALWAYS test loading, error, and empty states.
- ALWAYS test accessibility: keyboard navigation, ARIA attributes, screen-reader text.
- NEVER test internal component state вЂ” test what the user sees and does.
- NEVER import from `shared/api/generated/` in test files вЂ” use MSW handlers instead.
- ALWAYS use `vi.fn()` for mock callbacks, not `jest.fn()`.
- ALWAYS place test files next to the source file: `button.tsx` в†’ `button.test.tsx`.
