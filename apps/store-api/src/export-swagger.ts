import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';

/**
 * Standalone entry point that boots the NestJS application context (without
 * `listen()`), builds the OpenAPI document, and writes it to `swagger.json`.
 *
 * Orval (store-client / store-admin) consumes this static file so hook
 * generation works offline and in CI without a running server.
 *
 * The DocumentBuilder configuration MUST stay in sync with `main.ts` — that
 * file is the source of truth. Any new Swagger-decorated module is picked up
 * automatically; only the tag list and security schemes need manual parity.
 *
 * Run with: `npm run swagger:export -w apps/store-api` (requires a reachable DB,
 * since AppModule's PrismaService connects on init — but no port is opened).
 */
async function exportSwagger(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
    abortOnError: false,
  });
  app.setGlobalPrefix('api', { exclude: ['health'] });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Mobile Accessories Store API')
    .setDescription('B2C e-commerce platform for mobile accessories')
    .setVersion('0.1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .addCookieAuth(
      'refreshToken',
      { type: 'apiKey', in: 'cookie', name: 'refreshToken' },
      'refresh-token',
    )
    .addCookieAuth('cartToken', { type: 'apiKey', in: 'cookie', name: 'cartToken' }, 'cart-token')
    .addTag('Health', 'Health check endpoints')
    .addTag('Auth', 'Authentication and authorization')
    .addTag('Users', 'User profile and admin user management')
    .addTag('Products', 'Product catalog browsing and admin management')
    .addTag('Categories', 'Category browsing and admin management')
    .addTag('Pages', 'Static / service page browsing and admin management')
    .addTag('Cart', 'Shopping cart management')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  const outputPath = join(process.cwd(), 'swagger.json');
  writeFileSync(outputPath, JSON.stringify(document, null, 2));

  console.log(`OpenAPI spec written to ${outputPath}`);

  await app.close();
  process.exit(0);
}

exportSwagger().catch((err) => {
  console.error('Failed to export OpenAPI spec:', err);
  process.exit(1);
});
