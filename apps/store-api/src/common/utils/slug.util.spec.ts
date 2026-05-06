import { generateSlug } from './slug.util';

describe('generateSlug', () => {
  it('should convert a simple name to a slug', () => {
    expect(generateSlug('Hello World')).toBe('hello-world');
  });

  it('should handle special characters', () => {
    expect(generateSlug('iPhone 15 Pro Max!')).toBe('iphone-15-pro-max');
  });

  it('should replace underscores with hyphens', () => {
    expect(generateSlug('my_category_name')).toBe('my-category-name');
  });

  it('should collapse multiple hyphens', () => {
    expect(generateSlug('hello   world')).toBe('hello-world');
  });

  it('should trim leading and trailing hyphens', () => {
    expect(generateSlug('--hello world--')).toBe('hello-world');
  });

  it('should handle mixed case', () => {
    expect(generateSlug('Samsung Galaxy S24 Ultra')).toBe('samsung-galaxy-s24-ultra');
  });

  it('should handle empty string', () => {
    expect(generateSlug('')).toBe('');
  });

  it('should handle string with only special characters', () => {
    expect(generateSlug('!@#$%')).toBe('');
  });

  it('should trim whitespace', () => {
    expect(generateSlug('  hello world  ')).toBe('hello-world');
  });
});
