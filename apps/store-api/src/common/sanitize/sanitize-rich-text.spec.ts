import { sanitizeRichText } from './sanitize-rich-text';

describe('sanitizeRichText', () => {
  it('strips <script> tags and their contents', () => {
    const result = sanitizeRichText('<p>Hello</p><script>alert(1)</script>');

    expect(result).toContain('<p>Hello</p>');
    expect(result).not.toContain('script');
    expect(result).not.toContain('alert(1)');
  });

  it('strips inline event handlers (onerror, onclick, …)', () => {
    const result = sanitizeRichText('<img src="https://x/y.png" onerror="alert(1)" alt="x" />');

    expect(result).not.toContain('onerror');
    expect(result).not.toContain('alert(1)');
    expect(result).toContain('src="https://x/y.png"');
  });

  it('strips javascript: URLs from links', () => {
    const result = sanitizeRichText('<a href="javascript:alert(1)">click</a>');

    expect(result).not.toContain('javascript:');
    expect(result).not.toContain('alert(1)');
  });

  it('preserves allowed formatting tags', () => {
    const html =
      '<h2>Title</h2><p><strong>bold</strong> <em>italic</em></p>' +
      '<ul><li>one</li></ul><blockquote>quote</blockquote><pre><code>x</code></pre>';

    const result = sanitizeRichText(html);

    expect(result).toContain('<h2>Title</h2>');
    expect(result).toContain('<strong>bold</strong>');
    expect(result).toContain('<em>italic</em>');
    expect(result).toContain('<ul><li>one</li></ul>');
    expect(result).toContain('<blockquote>quote</blockquote>');
    expect(result).toContain('<pre><code>x</code></pre>');
  });

  it('preserves allowed table markup', () => {
    const html =
      '<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>D</td></tr></tbody></table>';

    expect(sanitizeRichText(html)).toBe(html);
  });

  it('forces rel="noopener noreferrer nofollow" on links', () => {
    const result = sanitizeRichText('<a href="https://example.com" target="_blank">link</a>');

    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('rel="noopener noreferrer nofollow"');
    expect(result).toContain('target="_blank"');
  });

  it('keeps http/https/mailto link schemes', () => {
    expect(sanitizeRichText('<a href="https://a.co">a</a>')).toContain('href="https://a.co"');
    expect(sanitizeRichText('<a href="mailto:x@a.co">a</a>')).toContain('href="mailto:x@a.co"');
  });

  it('allows data: URIs on images but not on links', () => {
    const img = sanitizeRichText('<img src="data:image/png;base64,AAAA" alt="a" />');
    expect(img).toContain('data:image/png;base64,AAAA');

    const link = sanitizeRichText('<a href="data:text/html,<b>x</b>">a</a>');
    expect(link).not.toContain('data:text/html');
  });

  it('strips <style> and <iframe> entirely', () => {
    const result = sanitizeRichText(
      '<style>body{display:none}</style><iframe src="https://evil"></iframe><p>ok</p>',
    );

    expect(result).not.toContain('style');
    expect(result).not.toContain('iframe');
    expect(result).toContain('<p>ok</p>');
  });

  it('returns an empty string for empty input', () => {
    expect(sanitizeRichText('')).toBe('');
  });
});
