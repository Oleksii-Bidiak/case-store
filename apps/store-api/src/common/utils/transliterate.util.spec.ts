import { transliterate } from './transliterate.util';
import { generateSlug } from './slug.util';

describe('transliterate', () => {
  it('leaves Latin text untouched', () => {
    expect(transliterate('iPhone 15 Pro Max!')).toBe('iPhone 15 Pro Max!');
    expect(transliterate('')).toBe('');
  });

  it('applies the word-initial forms of є / ї / й / ю / я', () => {
    expect(transliterate('Яблуко')).toBe('Yabluko');
    expect(transliterate('Юрій')).toBe('Yurii');
    expect(transliterate('Їжак')).toBe('Yizhak');
    expect(transliterate('Європа')).toBe('Yevropa');
  });

  it('applies the non-initial forms mid-word', () => {
    expect(transliterate('мяч')).toBe('miach');
    expect(transliterate('малий')).toBe('malyi');
  });

  it('renders the зг digraph as zgh so it stays distinct from ж', () => {
    expect(transliterate('Згурівка')).toBe('Zghurivka');
    expect(transliterate('жук')).toBe('zhuk');
  });

  it('drops the soft sign rather than inventing a character for it', () => {
    expect(transliterate('день')).toBe('den');
  });

  it('treats a letter after punctuation or a space as word-initial', () => {
    expect(transliterate('Кабелі / ялина')).toBe('Kabeli / yalyna');
  });
});

// The real driver for the transliteration work: every category in the supplier
// catalogue is named in Ukrainian, and `Category.slug` is UNIQUE.
describe('generateSlug — Ukrainian names (TASK-360)', () => {
  it.each([
    ['Чохли', 'chokhly'],
    ['Захисне скло', 'zakhysne-sklo'],
    ['Кабелі / перехідники', 'kabeli-perekhidnyky'],
    ['Зарядні пристрої', 'zariadni-prystroi'],
    ['Аксесуари для автомобіля', 'aksesuary-dlia-avtomobilia'],
    ['Плотери та плівки', 'plotery-ta-plivky'],
    ['Для дому та офісу', 'dlia-domu-ta-ofisu'],
    ['Геймінг', 'heiminh'],
    ['Освітлення', 'osvitlennia'],
    ['Дитячі товари', 'dytiachi-tovary'],
  ])('slugifies %p to %p', (input, expected) => {
    expect(generateSlug(input)).toBe(expected);
  });

  it('no longer collapses distinct Ukrainian names onto the same empty slug', () => {
    const slugs = ['Чохли', 'Аудіо', 'Освітлення'].map(generateSlug);
    expect(new Set(slugs).size).toBe(3);
    expect(slugs).not.toContain('');
  });

  it('handles a mixed Latin/Cyrillic product name', () => {
    expect(generateSlug('Чохол Armor Magnetic Samsung Galaxy A35')).toBe(
      'chokhol-armor-magnetic-samsung-galaxy-a35',
    );
  });
});
