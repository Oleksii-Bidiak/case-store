import { plainToInstance } from 'class-transformer';
import { normalizeSiteVerificationValue, UpdateSeoSettingsDto } from './update-seo-settings.dto';

describe('normalizeSiteVerificationValue (TASK-280)', () => {
  it('passes a bare token through unchanged', () => {
    expect(normalizeSiteVerificationValue('AbCdEfGh1234567890')).toBe('AbCdEfGh1234567890');
  });

  it('trims surrounding whitespace off a bare token', () => {
    expect(normalizeSiteVerificationValue('  AbCdEfGh1234567890 \n')).toBe('AbCdEfGh1234567890');
  });

  it('extracts the token from a full double-quoted Google meta tag', () => {
    expect(
      normalizeSiteVerificationValue('<meta name="google-site-verification" content="XYZ" />'),
    ).toBe('XYZ');
  });

  it('extracts the token from a single-quoted content attribute', () => {
    expect(normalizeSiteVerificationValue("<meta name='msvalidate.01' content='ABC'>")).toBe('ABC');
  });

  it('is meta-name-agnostic — a Bing tag normalizes the same way as a Google one', () => {
    expect(normalizeSiteVerificationValue('<meta name="msvalidate.01" content="BING123">')).toBe(
      'BING123',
    );
  });

  it('extracts the token from a whitespace-padded pasted tag', () => {
    expect(
      normalizeSiteVerificationValue('  <meta name="google-site-verification" content="P4D" />  '),
    ).toBe('P4D');
  });

  it('normalizes a whitespace-only input to an empty string', () => {
    expect(normalizeSiteVerificationValue('   ')).toBe('');
  });
});

describe('UpdateSeoSettingsDto @Transform normalization (TASK-280)', () => {
  it('normalizes a pasted full meta tag on both verification fields', () => {
    const dto = plainToInstance(UpdateSeoSettingsDto, {
      googleSiteVerification: '<meta name="google-site-verification" content="G-TOKEN" />',
      bingSiteVerification: '<meta name="msvalidate.01" content="B-TOKEN" />',
    });

    expect(dto.googleSiteVerification).toBe('G-TOKEN');
    expect(dto.bingSiteVerification).toBe('B-TOKEN');
  });

  it('leaves bare tokens untouched and non-string values for the type validator', () => {
    const dto = plainToInstance(UpdateSeoSettingsDto, {
      googleSiteVerification: 'BARE-TOKEN',
      bingSiteVerification: 42,
    });

    expect(dto.googleSiteVerification).toBe('BARE-TOKEN');
    expect(dto.bingSiteVerification).toBe(42);
  });
});
