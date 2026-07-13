---
name: nextjs-app-router
description: Create Next.js pages, layouts, and components using App Router with Server/Client Components, data fetching, and FSD integration.
---

## What I Do

I create Next.js App Router pages, layouts, and components with proper Server/Client Component separation, data fetching patterns, and FSD layer integration.

## When to Use Me

Use me when creating new pages, layouts, middleware, or data-fetching patterns in `apps/store-client/src/` or `apps/store-admin/src/`. This includes: route handlers, server actions, loading/error states, and SEO metadata.

## Server vs Client Components Decision

### Use Server Components (default, no directive)

- Data fetching directly in the component
- Accessing backend resources (databases, APIs)
- Keeping sensitive information on the server (tokens, secrets)
- Large dependencies that don't need interactivity
- SEO-critical content (metadata, structured data)

### Use Client Components (`'use client'` directive)

- Interactivity (onClick, onChange, form submission)
- State management (useState, useReducer)
- Lifecycle effects (useEffect)
- Browser-only APIs (localStorage, window, geolocation)
- Custom hooks that depend on state/effects
- Orval-generated mutation/query hooks (TanStack Query)

### Decision Flow

```
Does it need interactivity or browser APIs?
  YES → 'use client'
  NO → Does it need data fetching?
    YES → Server Component with async/await
    NO → Server Component (static render)
```

## App Router Conventions

### Route Groups

```
src/app/
  (shop)/              — Public storefront routes
    (home)/
      page.tsx
    products/
      [slug]/
        page.tsx
    cart/
      page.tsx
    checkout/
      page.tsx
  (auth)/
    login/
      page.tsx
    register/
      page.tsx
  (admin)/             — Admin panel routes
    dashboard/
      page.tsx
    products/
      page.tsx
```

### Layout Hierarchy

```typescript
// src/app/layout.tsx — Root layout (always Server Component)
import { QueryProvider } from '@/shared/providers/query-provider';
import '@/shared/styles/globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
```

```typescript
// src/app/(shop)/layout.tsx — Shop layout with Header/Footer
import { Header } from '@/widgets/header';
import { Footer } from '@/widgets/footer';

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main>{children}</main>
      <Footer />
    </>
  );
}
```

### Loading States

```typescript
// src/app/(shop)/products/loading.tsx
export default function ProductsLoading() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-lg border p-4">
          <div className="h-48 bg-muted rounded" />
          <div className="mt-4 h-4 bg-muted rounded w-3/4" />
          <div className="mt-2 h-4 bg-muted rounded w-1/2" />
        </div>
      ))}
    </div>
  );
}
```

### Error Boundaries

```typescript
// src/app/(shop)/products/error.tsx
'use client';

export default function ProductsError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <h2 className="text-xl font-semibold text-destructive">Failed to load products</h2>
      <p className="mt-2 text-muted-foreground">{error.message}</p>
      <button onClick={reset} className="mt-4 rounded-md bg-primary px-4 py-2 text-primary-foreground">
        Try again
      </button>
    </div>
  );
}
```

### Not Found

```typescript
// src/app/not-found.tsx
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="mt-2 text-muted-foreground">Page not found</p>
      <Link href="/" className="mt-4 text-primary hover:underline">Go home</Link>
    </div>
  );
}
```

## Data Fetching Patterns

### Server Component — Direct Fetch

```typescript
// src/app/(shop)/products/[slug]/page.tsx
import { ProductDetail } from '@/widgets/product-detail';
import { prefetchProductBySlug } from '@/entities/product/api/product-hooks';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { getQueryClient } from '@/shared/lib/query-client';

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery(prefetchProductBySlug(params.slug));

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ProductDetail slug={params.slug} />
    </HydrationBoundary>
  );
}
```

### Client Component — TanStack Query

```typescript
// src/features/product-detail/ui/product-detail.tsx
'use client';

import { useGetProductBySlug } from '@/shared/api/generated/product/product';

export function ProductDetail({ slug }: { slug: string }) {
  const { data: product, isLoading, error } = useGetProductBySlug(slug);

  if (isLoading) return <ProductDetailSkeleton />;
  if (error) return <ProductDetailError error={error} />;

  return (
    <article>
      <h1 className="text-2xl font-bold">{product.name}</h1>
      <p className="text-lg font-semibold text-primary">{formatCurrency(product.price)}</p>
    </article>
  );
}
```

### Server Actions

```typescript
// src/features/cart/actions/add-to-cart-action.ts
"use server";

import { revalidateTag } from "next/cache";
import { cartApi } from "@/shared/api/generated/cart/cart";

export async function addToCartAction(productId: string, quantity: number) {
  await cartApi.addToCart({ productId, quantity });
  revalidateTag("cart");
}
```

## SEO & Metadata

```typescript
// src/app/(shop)/products/[slug]/page.tsx
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const product = await getProductBySlug(params.slug);
  return {
    title: `${product.name} | Store`,
    description: product.description,
    openGraph: {
      title: product.name,
      description: product.description,
      images: product.images[0],
    },
  };
}

export async function generateStaticParams() {
  const products = await getAllProducts();
  return products.map((p) => ({ slug: p.slug }));
}
```

## Middleware (Auth Protection)

```typescript
// src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const protectedRoutes = ["/checkout", "/account", "/orders"];
const adminRoutes = ["/admin"];

export function middleware(request: NextRequest) {
  const token = request.cookies.get("access_token")?.value;
  const { pathname } = request.nextUrl;

  if (protectedRoutes.some((route) => pathname.startsWith(route)) && !token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (adminRoutes.some((route) => pathname.startsWith(route))) {
    const role = request.cookies.get("user_role")?.value;
    if (role !== "admin") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/checkout/:path*",
    "/account/:path*",
    "/orders/:path*",
    "/admin/:path*",
  ],
};
```

## Query Provider Setup

```typescript
// src/shared/providers/query-provider.tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

## Rules

- ALWAYS use Server Components by default. Add `'use client'` only when necessary.
- ALWAYS handle loading, error, and empty states for data-fetching components.
- ALWAYS use `generateMetadata` for SEO on dynamic pages.
- ALWAYS use `HydrationBoundary` + `prefetchQuery` for server-side data fetching with TanStack Query.
- NEVER fetch data on the client when it can be fetched on the server.
- NEVER use `useEffect` for data fetching — use TanStack Query hooks instead.
- NEVER expose API secrets in Client Components — keep them in Server Components or Server Actions.
- ALWAYS use route groups `(shop)`, `(auth)`, `(admin)` to organize layouts.
- ALWAYS use semantic design tokens from `@theme inline` in `apps/store-client/src/app/globals.css` (storefront) / `apps/store-admin/src/app/globals.css` (admin) — never raw hex values, and never look for a `tailwind.config.ts` (Tailwind v4 is CSS-first; the file does not exist).
