---
name: nestjs-module
description: Create a new NestJS feature module following Clean Architecture (Controller-Service-Repository pattern) with DTOs, entities, and proper module registration.
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: scaffolding
---

## What I Do

I create complete NestJS feature modules following Clean Architecture with the Controller-Service-Repository pattern. Each module includes DTOs, entities, and proper NestJS module registration.

## When to Use Me

Use me when creating a new feature module in `apps/store-api/src/`. Typical features include: products, orders, users, categories, reviews, promotions, shipping, etc.

## Module Structure

Every feature module MUST follow this structure:

```
src/
  feature/
    feature.controller.ts       — Routes, DTO validation, HTTP responses ONLY
    feature.service.ts           — Business logic ONLY
    feature.repository.ts        — Database access through Prisma ONLY
    feature.module.ts            — Module registration
    dto/
      create-feature.dto.ts      — class-validator + class-transformer
      update-feature.dto.ts      — PartialType + class-validator
    entities/
      feature.entity.ts          — Domain entity (not Prisma model)
```

## Implementation Order

Always implement in this order:

### 1. Prisma Schema

First, define the data model in `apps/store-api/prisma/schema.prisma`:

```prisma
model Feature {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // fields...

  @@map("features")
}
```

Then run: `npx prisma generate`

### 2. Entity (Domain Model)

Create the domain entity — this is NOT the Prisma model:

```typescript
// src/feature/entities/feature.entity.ts
export class FeatureEntity {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### 3. Repository

Encapsulate all Prisma queries:

```typescript
// src/feature/feature.repository.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureEntity } from './entities/feature.entity';

@Injectable()
export class FeatureRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<FeatureEntity | null> {
    const record = await this.prisma.feature.findUnique({ where: { id } });
    return record ? this.toEntity(record) : null;
  }

  async findMany(params: { skip?: number; take?: number }): Promise<FeatureEntity[]> {
    const records = await this.prisma.feature.findMany(params);
    return records.map(this.toEntity);
  }

  async create(data: CreateFeatureDto): Promise<FeatureEntity> {
    const record = await this.prisma.feature.create({ data });
    return this.toEntity(record);
  }

  private toEntity(record: any): FeatureEntity {
    const entity = new FeatureEntity();
    Object.assign(entity, record);
    return entity;
  }
}
```

### 4. DTOs

```typescript
// src/feature/dto/create-feature.dto.ts
import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateFeatureDto {
  @ApiProperty()
  @IsString()
  name: string;
}

// src/feature/dto/update-feature.dto.ts
import { PartialType } from '@nestjs/swagger';
import { CreateFeatureDto } from './create-feature.dto';

export class UpdateFeatureDto extends PartialType(CreateFeatureDto) {}
```

### 5. Service (Business Logic)

```typescript
// src/feature/feature.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { FeatureRepository } from './feature.repository';
import { CreateFeatureDto } from './dto/create-feature.dto';
import { UpdateFeatureDto } from './dto/update-feature.dto';
import { FeatureEntity } from './entities/feature.entity';

@Injectable()
export class FeatureService {
  constructor(private readonly featureRepository: FeatureRepository) {}

  async create(dto: CreateFeatureDto): Promise<FeatureEntity> {
    return this.featureRepository.create(dto);
  }

  async findById(id: string): Promise<FeatureEntity> {
    const entity = await this.featureRepository.findById(id);
    if (!entity) throw new NotFoundException(`Feature #${id} not found`);
    return entity;
  }

  async findMany(params: { skip?: number; take?: number }): Promise<FeatureEntity[]> {
    return this.featureRepository.findMany(params);
  }

  async update(id: string, dto: UpdateFeatureDto): Promise<FeatureEntity> {
    await this.findById(id);
    return this.featureRepository.update(id, dto);
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.featureRepository.remove(id);
  }
}
```

### 6. Controller

```typescript
// src/feature/feature.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { FeatureService } from './feature.service';
import { CreateFeatureDto } from './dto/create-feature.dto';
import { UpdateFeatureDto } from './dto/update-feature.dto';

@ApiTags('features')
@Controller('features')
export class FeatureController {
  constructor(private readonly featureService: FeatureService) {}

  @Post()
  @ApiOperation({ summary: 'Create a feature' })
  async create(@Body() dto: CreateFeatureDto) {
    const data = await this.featureService.create(dto);
    return { data };
  }

  @Get()
  @ApiOperation({ summary: 'List features' })
  async findMany(@Query('skip') skip?: number, @Query('take') take?: number) {
    const data = await this.featureService.findMany({ skip, take });
    return { data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a feature by ID' })
  async findById(@Param('id') id: string) {
    const data = await this.featureService.findById(id);
    return { data };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a feature' })
  async update(@Param('id') id: string, @Body() dto: UpdateFeatureDto) {
    const data = await this.featureService.update(id, dto);
    return { data };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a feature' })
  async remove(@Param('id') id: string) {
    await this.featureService.remove(id);
  }
}
```

### 7. Module

```typescript
// src/feature/feature.module.ts
import { Module } from '@nestjs/common';
import { FeatureController } from './feature.controller';
import { FeatureService } from './feature.service';
import { FeatureRepository } from './feature.repository';

@Module({
  controllers: [FeatureController],
  providers: [FeatureService, FeatureRepository],
  exports: [FeatureService],
})
export class FeatureModule {}
```

## Rules

- Controllers MUST NOT contain business logic — only routing, validation, and response formatting.
- Services MUST NOT import PrismaClient — use Repository instead.
- Repositories MUST return domain entities, not raw Prisma objects.
- All API responses MUST follow the envelope: `{ data }` or `{ data, meta }` for lists.
- All DTOs MUST use `class-validator` decorators for input validation.
- All endpoints MUST have Swagger decorators (`@ApiTags`, `@ApiOperation`).
- Every new module MUST be registered in `AppModule`.