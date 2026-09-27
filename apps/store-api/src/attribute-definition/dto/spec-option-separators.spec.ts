import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateAttributeDefinitionDto } from './create-attribute-definition.dto';
import { UpdateAttributeDefinitionDto } from './update-attribute-definition.dto';
import { SPEC_OPTION_SEPARATOR_MESSAGE, hasSpecValueSeparator } from './spec-option-separators';

/**
 * TASK-514: a facet option containing a `?specs=` separator is refused where it
 * is written. «Силікон, м'який» would otherwise be split by both parsers into
 * two values no product carries, and the facet would silently find nothing.
 */
const optionErrors = async (
  dto: typeof CreateAttributeDefinitionDto | typeof UpdateAttributeDefinitionDto,
  options: unknown,
) => {
  const errors = await validate(
    plainToInstance(dto, { key: 'material', label: 'Матеріал', type: 'SELECT', options }),
  );
  return errors.filter((error) => error.property === 'options');
};

describe('facet option separators (TASK-514)', () => {
  describe('hasSpecValueSeparator', () => {
    it.each([
      ['a comma', "Силікон, м'який", true],
      ['a semicolon', 'TPU;PC', true],
      ['a plain value', 'Силікон', false],
      ['a colon — only the first one splits key from values', 'USB-C: 20 Вт', false],
      ['a dash and parentheses', 'Силікон — мʼякий (soft touch)', false],
    ])('%s → %s', (_label, value, expected) => {
      expect(hasSpecValueSeparator(value)).toBe(expected);
    });
  });

  describe.each([
    ['CreateAttributeDefinitionDto', CreateAttributeDefinitionDto],
    ['UpdateAttributeDefinitionDto', UpdateAttributeDefinitionDto],
  ] as const)('%s.options', (_name, dto) => {
    it('accepts options without separators', async () => {
      expect(await optionErrors(dto, ['Силікон', 'Шкіра', 'USB-C: 20 Вт'])).toHaveLength(0);
    });

    it.each([
      ['a comma', ['Силікон', "Силікон, м'який"]],
      ['a semicolon', ['TPU;PC']],
    ])('refuses an option with %s, in Ukrainian', async (_label, options) => {
      const errors = await optionErrors(dto, options);

      expect(errors).toHaveLength(1);
      expect(Object.values(errors[0].constraints ?? {})).toContain(SPEC_OPTION_SEPARATOR_MESSAGE);
    });

    it('leaves a non-string member to the @IsString message', async () => {
      const errors = await optionErrors(dto, ['Силікон', 5]);

      expect(errors).toHaveLength(1);
      expect(errors[0].constraints).toHaveProperty('isString');
      expect(errors[0].constraints).not.toHaveProperty('noSpecValueSeparators');
    });

    it('does not require options at all', async () => {
      expect(await optionErrors(dto, undefined)).toHaveLength(0);
    });
  });
});
