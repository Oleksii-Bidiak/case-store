import { ValidationOptions, registerDecorator } from 'class-validator';

/**
 * The characters the catalogue's `?specs=` wire format reserves (TASK-514):
 * `key:v1,v2;key2:v3` — `;` between facets, `,` between the values of one
 * facet. Both parsers split on them blindly (`parseSpecFilters` in the API,
 * `parseSpecParam` on the storefront) and the format has no escape, so an
 * option «Силікон, м'який» would be cut into two values that exist nowhere and
 * the facet would silently stop finding the product.
 *
 * Owner-side decision (option (a) of TASK-514): such an option is refused where
 * it is written rather than encoded where it is read. The rule sits on the
 * definition's OPTIONS because that is the one place a facet value is
 * authored — a SELECT spec value must be one of these options
 * (`ProductService.validateSpecValue`), and a BOOLEAN is `true`/`false`, so
 * guarding the options covers every value a facet can carry. Free-text (TEXT)
 * values are never facets and keep their commas (see `UpdateProductSpecsDto`).
 *
 * `:` is NOT reserved: the parser splits a chunk on its FIRST colon only, and
 * keys (`ATTRIBUTE_KEY_PATTERN`) cannot contain one, so a value may.
 */
export const SPEC_VALUE_SEPARATORS = /[,;]/;

/** Shown to the content manager in the admin panel when an option is refused. */
export const SPEC_OPTION_SEPARATOR_MESSAGE =
  'Варіант характеристики не може містити «,» або «;» — ці символи розділяють значення у фільтрі каталогу. Замініть їх, напр. «Силікон — мʼякий» або «Силікон (мʼякий)».';

/** True when a facet option would be split by the `?specs=` parsers. */
export function hasSpecValueSeparator(value: string): boolean {
  return SPEC_VALUE_SEPARATORS.test(value);
}

/**
 * Rejects an options array in which any string contains a `?specs=` separator.
 * Non-string members are left to `@IsString({ each: true })`, which reports
 * them with its own message.
 */
export function NoSpecValueSeparators(validationOptions?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'noSpecValueSeparators',
      target: target.constructor,
      propertyName: String(propertyName),
      options: { message: SPEC_OPTION_SEPARATOR_MESSAGE, ...validationOptions },
      validator: {
        validate(value: unknown): boolean {
          if (!Array.isArray(value)) return true;
          return value.every(
            (option) => typeof option !== 'string' || !hasSpecValueSeparator(option),
          );
        },
      },
    });
  };
}
