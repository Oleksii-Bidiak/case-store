import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CartIdentityInterceptor } from './interceptors';

/**
 * Contract guard for the cart response envelope (TASK-825).
 *
 * `CartResponseEnvelope.data` had no `@ApiProperty`, so the envelope was published as
 * `{ "type": "object", "properties": {} }` and Orval materialised it as
 * `{ [key: string]: unknown }` — every one of the seven cart routes answered an untyped
 * bag with an optional `data` bolted on. The honest proof is the REAL OpenAPI document
 * built from the real controller (reading the decorator metadata back would only assert
 * the annotation at itself, and swagger.json is produced by a separate command).
 *
 * Local schema shape on purpose — `@nestjs/swagger` exports only `OpenAPIObject` from its
 * package root (see uploaded-image.entity.spec.ts).
 */
interface SchemaLike {
  type?: string;
  required?: string[];
  $ref?: string;
  allOf?: SchemaLike[];
  properties?: Record<string, SchemaLike>;
}

const CART_OPERATIONS = [
  'getCart',
  'addToCart',
  'updateCartItem',
  'removeCartItem',
  'selectCartItemAddon',
  'deselectCartItemAddon',
  'clearCart',
];

describe('CartController (OpenAPI contract, TASK-825)', () => {
  let document: OpenAPIObject;
  let schemas: Record<string, SchemaLike>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CartController],
      providers: [
        { provide: CartService, useValue: {} },
        { provide: ConfigService, useValue: { get: () => undefined } },
        CartIdentityInterceptor,
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('probe').setVersion('1').build(),
    );
    schemas = (document.components?.schemas ?? {}) as Record<string, SchemaLike>;
    await app.close();
  });

  it('publishes CartResponseEnvelope.data as a REQUIRED CartEntity', () => {
    const envelope = schemas.CartResponseEnvelope;

    expect(envelope.properties?.data?.$ref).toBe('#/components/schemas/CartEntity');
    expect(envelope.required).toContain('data');
  });

  it.each(CART_OPERATIONS)('%s answers the typed cart envelope', (operationId) => {
    const operation = Object.values(document.paths)
      .flatMap((path) => Object.values(path) as Array<Record<string, unknown>>)
      .find((op) => op?.operationId === operationId) as
      | { responses: Record<string, { content?: Record<string, { schema: SchemaLike }> }> }
      | undefined;
    expect(operation).toBeDefined();

    const success = operation!.responses['200'] ?? operation!.responses['201'];
    const schema = success.content!['application/json'].schema;
    const refs = [schema.$ref, ...(schema.allOf ?? []).map((part) => part.$ref)];

    expect(refs).toContain('#/components/schemas/CartResponseEnvelope');
  });
});
