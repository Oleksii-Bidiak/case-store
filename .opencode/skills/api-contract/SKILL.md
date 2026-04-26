---
name: api-contract
description: Configure and maintain the OpenAPI (Swagger) to Orval pipeline for generating typed API hooks. Covers Swagger decorators, Orval config, and generation workflow.
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: scaffolding
---

## What I Do

I configure and maintain the API contract pipeline: NestJS Swagger decorators generate an OpenAPI spec, and Orval reads that spec to generate typed React Query hooks for both `store-client` and `store-admin`.

## When to Use Me

Use me when:
- Setting up Swagger/OpenAPI in a new NestJS module
- Configuring Orval for a new frontend workspace
- Adding new endpoints that need typed API hooks
- Debugging API contract generation issues

## Pipeline Overview

```
NestJS Controllers + Swagger Decorators
        ↓ (npm run swagger:generate)
OpenAPI JSON/YAML Spec (apps/store-api/swagger.json)
        ↓ (npm run generate-api)
Orval → Typed React Query Hooks
        ↓
store-client/src/shared/api/generated/
store-admin/src/shared/api/generated/
```

## Step 1: Swagger Setup (Backend)

### Main.ts Configuration

```typescript
// apps/store-api/src/main.ts
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('Store API')
    .setDescription('Mobile Accessories E-Commerce API')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication')
    .addTag('users', 'User management')
    .addTag('products', 'Product catalog')
    .addTag('categories', 'Category management')
    .addTag('cart', 'Shopping cart')
    .addTag('orders', 'Order management')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Also save to file for Orval
  const fs = await import('fs');
  const path = await import('path');
  fs.writeFileSync(
    path.join(__dirname, '..', 'swagger.json'),
    JSON.stringify(document, null, 2),
  );

  await app.listen(3000);
}
bootstrap();
```

### Controller Decorators (Per Module)

Every controller and endpoint MUST have Swagger decorators:

```typescript
// src/product/product.controller.ts
import { ApiTags, ApiOperation, ApiBearerAuth, ApiOkResponse, ApiNotFoundResponse, ApiQuery } from '@nestjs/swagger';
import { ProductEntity } from './entities/product.entity';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';

@ApiTags('products')
@Controller('products')
export class ProductController {
  @Get()
  @ApiOperation({ summary: 'List products with pagination and filtering' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'categoryId', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiOkResponse({ type: PaginatedResponseDto<ProductEntity> })
  async findMany(@Query() query: FindProductsQuery) {
    const { data, meta } = await this.productService.findMany(query);
    return { data, meta };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product by ID' })
  @ApiOkResponse({ type: ProductEntity })
  @ApiNotFoundResponse({ description: 'Product not found' })
  async findById(@Param('id') id: string) {
    const data = await this.productService.findById(id);
    return { data };
  }

  @Post()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a product' })
  @ApiOkResponse({ type: ProductEntity })
  async create(@Body() dto: CreateProductDto) {
    const data = await this.productService.create(dto);
    return { data };
  }
}
```

### Entity Decorators for Swagger

```typescript
// src/product/entities/product.entity.ts
import { ApiProperty } from '@nestjs/swagger';

export class ProductEntity {
  @ApiProperty({ example: 'clx123abc' })
  id: string;

  @ApiProperty({ example: 'iPhone 15 Case' })
  name: string;

  @ApiProperty({ example: 'iphone-15-case' })
  slug: string;

  @ApiProperty({ example: 29.99 })
  price: number;

  @ApiProperty({ example: 39.99, required: false })
  compareAtPrice?: number;

  @ApiProperty({ example: ['https://cdn.store.com/img.jpg'], type: [String] })
  images: string[];

  @ApiProperty({ example: true })
  inStock: boolean;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  createdAt: Date;
}
```

### Common DTOs for Pagination

```typescript
// src/common/dto/paginated-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() total: number;
  @ApiProperty() totalPages: number;
}

export class PaginatedResponseDto<T> {
  @ApiProperty({ isArray: true })
  data: T[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
```

## Step 2: Orval Configuration (Frontend)

### store-client Orval Config

```typescript
// apps/store-client/orval.config.ts
import { defineConfig } from 'orval';

export default defineConfig({
  store: {
    input: '../store-api/swagger.json',
    output: {
      target: './src/shared/api/generated/store-client.ts',
      client: '@tanstack/react-query',
      httpClient: 'axios',
      override: {
        mutator: {
          path: './src/shared/api/axios-instance.ts',
          name: 'axiosInstance',
        },
      },
      mode: 'tags-split',
      workspace: './src/shared/api/generated',
    },
  },
});
```

### store-admin Orval Config

```typescript
// apps/store-admin/orval.config.ts
import { defineConfig } from 'orval';

export default defineConfig({
  store: {
    input: '../store-api/swagger.json',
    output: {
      target: './src/shared/api/generated/store-admin.ts',
      client: '@tanstack/react-query',
      httpClient: 'axios',
      override: {
        mutator: {
          path: './src/shared/api/axios-instance.ts',
          name: 'axiosInstance',
        },
      },
      mode: 'tags-split',
      workspace: './src/shared/api/generated',
    },
  },
});
```

### Axios Instance

```typescript
// apps/store-client/src/shared/api/axios-instance.ts
import axios from 'axios';

export const axiosInstance = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  withCredentials: true,
});

axiosInstance.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const { data } = await axiosInstance.post('/auth/refresh');
        localStorage.setItem('access_token', data.data.accessToken);
        originalRequest.headers.Authorization = `Bearer ${data.data.accessToken}`;
        return axiosInstance(originalRequest);
      } catch {
        localStorage.removeItem('access_token');
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);
```

## Step 3: Generation Workflow

### NPM Scripts

```json
// Root package.json scripts
{
  "swagger:generate": "npm run swagger:generate -w apps/store-api",
  "generate-api": "npm run generate-api -w apps/store-client && npm run generate-api -w apps/store-admin"
}

// apps/store-api/package.json
{
  "swagger:generate": "nest build && node dist/main.js swagger && kill $!"
}

// apps/store-client/package.json
{
  "generate-api": "orval --config orval.config.ts"
}

// apps/store-admin/package.json
{
  "generate-api": "orval --config orval.config.ts"
}
```

### Full Generation Flow

```bash
# 1. Start the API server temporarily to generate swagger.json
npm run swagger:generate

# 2. Generate typed hooks for both frontends
npm run generate-api
```

## Step 4: Using Generated Hooks

```typescript
// entities/product/api/product-hooks.ts (AUTO-GENERATED by Orval)
// DO NOT EDIT — run `npm run generate-api` to update

// features/product-list/ui/product-list.tsx
'use client';

import { useGetProducts } from '@/shared/api/generated/product/product';

export function ProductList({ categoryId }: { categoryId?: string }) {
  const { data, isLoading, error } = useGetProducts({
    categoryId,
    limit: 12,
  });

  if (isLoading) return <ProductListSkeleton />;
  if (error) return <ProductListError error={error} />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {data?.data?.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
```

## Rules

- ALWAYS add Swagger decorators to every controller and endpoint.
- ALWAYS use `@ApiBearerAuth()` on protected endpoints.
- ALWAYS use `@ApiProperty()` on entity classes for proper OpenAPI spec generation.
- ALWAYS use Orval-generated hooks in frontend code — NEVER write manual `fetch` or `axios` calls.
- ALWAYS run `npm run generate-api` after adding or changing backend endpoints.
- NEVER edit files in `src/shared/api/generated/` — they are auto-generated.
- ALWAYS use the `axiosInstance` mutator for auth token injection and refresh logic.
- ALWAYS use `mode: 'tags-split'` in Orval config to organize hooks by API tag.