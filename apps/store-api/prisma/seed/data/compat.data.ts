import { slugify } from '../lib/slug';

// Base entry slug (matches all colour/pack positions of a group) → device
// model slugs (as produced by seedDevices' slugify).
export const compatPlan: { productSlugPrefix: string; deviceSlugs: string[] }[] = [
  {
    productSlugPrefix: slugify('Silicone Case for iPhone 15'),
    deviceSlugs: ['iphone-15', 'iphone-15-plus'],
  },
  {
    productSlugPrefix: slugify('Clear MagSafe Case for iPhone 15 Pro'),
    deviceSlugs: ['iphone-15-pro', 'iphone-15-pro-max'],
  },
  {
    productSlugPrefix: slugify('Tempered Glass Screen Protector for iPhone 15'),
    deviceSlugs: ['iphone-15', 'iphone-15-plus'],
  },
  {
    productSlugPrefix: slugify('15W Qi Wireless Charging Pad'),
    deviceSlugs: ['iphone-15', 'iphone-15-pro', 'iphone-14', 'iphone-13'],
  },
  {
    productSlugPrefix: slugify('20W USB-C Wall Charger'),
    deviceSlugs: ['iphone-15', 'iphone-15-pro', 'iphone-14'],
  },
];
