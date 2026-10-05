import { escapeHtml } from './telegram-html';

describe('escapeHtml (Telegram HTML parse mode)', () => {
  it.each([
    ['&', '&amp;'],
    ['<', '&lt;'],
    ['>', '&gt;'],
    ['"', '&quot;'],
  ])('escapes %s', (input, expected) => {
    expect(escapeHtml(input)).toBe(expected);
  });

  it('escapes & first, so an existing entity is not double-decoded into markup', () => {
    expect(escapeHtml('&lt;b&gt;')).toBe('&amp;lt;b&amp;gt;');
  });

  it('neutralises markup a customer could type into a name or message', () => {
    expect(escapeHtml('<b>Олена</b> & "Ко" <a href="x">')).toBe(
      '&lt;b&gt;Олена&lt;/b&gt; &amp; &quot;Ко&quot; &lt;a href=&quot;x&quot;&gt;',
    );
  });

  it('leaves ordinary text, Cyrillic and apostrophes alone', () => {
    expect(escapeHtml("Замовлення №42 — п'ять позицій")).toBe("Замовлення №42 — п'ять позицій");
  });
});
