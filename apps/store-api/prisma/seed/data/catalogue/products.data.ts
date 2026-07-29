import { slugify } from '../../lib/slug';
import { STORE_NAME } from '../../lib/store';
import type { ProductSeed } from '../../types';

/**
 * The seeded catalogue. One flat array for now — WT-B splits it per category.
 * Takes the category map because every entry carries a resolved `categoryId`.
 */
export function buildProductsData(categories: Record<string, { id: string }>): ProductSeed[] {
  return [
    // ── iPhone Cases ──
    {
      name: 'Silicone Case for iPhone 15',
      slug: slugify('Silicone Case for iPhone 15'),
      description:
        'Premium silicone case with soft-touch finish. Fits iPhone 15 perfectly with precise cutouts for camera and buttons.',
      price: 12.99,
      compareAtPrice: 19.99,
      sku: 'CASE-IP15-SIL',
      categoryId: categories['iphone-cases'].id,
      brandSlug: 'spigen',
      variants: [
        {
          name: 'Black',
          sku: 'CASE-IP15-SIL-BK',
          price: 12.99,
          stock: 50,
          attributes: { color: 'Black' },
        },
        {
          name: 'White',
          sku: 'CASE-IP15-SIL-WH',
          price: 12.99,
          stock: 35,
          attributes: { color: 'White' },
        },
        {
          name: 'Blue',
          sku: 'CASE-IP15-SIL-BL',
          price: 12.99,
          stock: 25,
          attributes: { color: 'Blue' },
        },
        {
          name: 'Red',
          sku: 'CASE-IP15-SIL-RD',
          price: 14.99,
          stock: 15,
          attributes: { color: 'Red' },
        },
      ],
      images: [
        {
          url: '/images/products/case-iphone15-1.jpg',
          alt: 'Silicone Case for iPhone 15 - Front',
          sortOrder: 0,
        },
        {
          url: '/images/products/case-iphone15-2.jpg',
          alt: 'Silicone Case for iPhone 15 - Side',
          sortOrder: 1,
        },
      ],
    },
    {
      name: 'Clear MagSafe Case for iPhone 15 Pro',
      slug: slugify('Clear MagSafe Case for iPhone 15 Pro'),
      description:
        'Crystal clear case with built-in MagSafe magnet ring. Shows off your iPhone while providing military-grade drop protection.',
      price: 24.99,
      compareAtPrice: 34.99,
      sku: 'CASE-IP15P-MAG',
      categoryId: categories['iphone-cases'].id,
      brandSlug: 'spigen',
      variants: [
        {
          name: 'Clear',
          sku: 'CASE-IP15P-MAG-CL',
          price: 24.99,
          stock: 40,
          attributes: { color: 'Clear' },
        },
        {
          name: 'Frosted Black',
          sku: 'CASE-IP15P-MAG-FB',
          price: 26.99,
          stock: 20,
          attributes: { color: 'Frosted Black' },
        },
      ],
      images: [
        {
          url: '/images/products/case-magsafe-1.jpg',
          alt: 'Clear MagSafe Case - Front',
          sortOrder: 0,
        },
        {
          url: '/images/products/case-magsafe-2.jpg',
          alt: 'Clear MagSafe Case - Back',
          sortOrder: 1,
        },
        {
          url: '/images/products/case-magsafe-3.jpg',
          alt: 'Clear MagSafe Case - MagSafe Ring',
          sortOrder: 2,
        },
      ],
    },
    // ── Samsung Cases ──
    {
      name: 'Armor Case for Samsung Galaxy S24',
      slug: slugify('Armor Case for Samsung Galaxy S24'),
      description:
        'Rugged dual-layer armor case with kickstand. Designed for maximum protection against drops and impacts.',
      price: 18.99,
      compareAtPrice: 29.99,
      sku: 'CASE-SGS24-ARM',
      categoryId: categories['samsung-cases'].id,
      brandSlug: 'spigen',
      variants: [
        {
          name: 'Black',
          sku: 'CASE-SGS24-ARM-BK',
          price: 18.99,
          stock: 45,
          attributes: { color: 'Black' },
        },
        {
          name: 'Navy Blue',
          sku: 'CASE-SGS24-ARM-NB',
          price: 18.99,
          stock: 30,
          attributes: { color: 'Navy Blue' },
        },
      ],
      images: [
        {
          url: '/images/products/case-samsung-armor-1.jpg',
          alt: 'Armor Case Samsung Galaxy S24',
          sortOrder: 0,
        },
        {
          url: '/images/products/case-samsung-armor-2.jpg',
          alt: 'Armor Case Samsung Galaxy S24 - Kickstand',
          sortOrder: 1,
        },
      ],
    },
    // ── Xiaomi Cases ──
    {
      name: 'TPU Case for Xiaomi 14',
      slug: slugify('TPU Case for Xiaomi 14'),
      description:
        'Flexible TPU case with matte finish. Lightweight and slim design that preserves the phone profile.',
      price: 8.99,
      sku: 'CASE-XI14-TPU',
      categoryId: categories['xiaomi-cases'].id,
      brandSlug: 'baseus',
      variants: [
        {
          name: 'Black',
          sku: 'CASE-XI14-TPU-BK',
          price: 8.99,
          stock: 60,
          attributes: { color: 'Black' },
        },
        {
          name: 'Transparent',
          sku: 'CASE-XI14-TPU-TR',
          price: 7.99,
          stock: 55,
          attributes: { color: 'Transparent' },
        },
      ],
      images: [
        { url: '/images/products/case-xiaomi-tpu-1.jpg', alt: 'TPU Case Xiaomi 14', sortOrder: 0 },
      ],
    },
    // ── Wall Chargers ──
    {
      name: '20W USB-C Wall Charger',
      slug: slugify('20W USB-C Wall Charger'),
      description:
        'Compact 20W PD fast charger with USB-C port. Perfect for iPhone and Android fast charging.',
      price: 15.99,
      compareAtPrice: 22.99,
      sku: 'CHG-WALL-20W',
      categoryId: categories['wall-chargers'].id,
      brandSlug: 'anker',
      variants: [
        {
          name: 'White',
          sku: 'CHG-WALL-20W-WH',
          price: 15.99,
          stock: 80,
          attributes: { color: 'White' },
        },
        {
          name: 'Black',
          sku: 'CHG-WALL-20W-BK',
          price: 15.99,
          stock: 70,
          attributes: { color: 'Black' },
        },
      ],
      images: [
        {
          url: '/images/products/charger-wall-20w-1.jpg',
          alt: '20W USB-C Wall Charger',
          sortOrder: 0,
        },
        {
          url: '/images/products/charger-wall-20w-2.jpg',
          alt: '20W USB-C Wall Charger - USB-C Port',
          sortOrder: 1,
        },
      ],
    },
    {
      name: '65W GaN Wall Charger',
      slug: slugify('65W GaN Wall Charger'),
      description:
        'Gallium Nitride 65W charger with 2 USB-C and 1 USB-A ports. Charges laptop, phone, and tablet simultaneously.',
      price: 39.99,
      compareAtPrice: 54.99,
      sku: 'CHG-WALL-65W',
      categoryId: categories['wall-chargers'].id,
      brandSlug: 'anker',
      variants: [
        {
          name: 'White',
          sku: 'CHG-WALL-65W-WH',
          price: 39.99,
          stock: 30,
          attributes: { color: 'White' },
        },
        {
          name: 'Black',
          sku: 'CHG-WALL-65W-BK',
          price: 39.99,
          stock: 25,
          attributes: { color: 'Black' },
        },
      ],
      images: [
        {
          url: '/images/products/charger-gan-65w-1.jpg',
          alt: '65W GaN Wall Charger',
          sortOrder: 0,
        },
      ],
    },
    // ── Car Chargers ──
    {
      name: '30W Dual USB Car Charger',
      slug: slugify('30W Dual USB Car Charger'),
      description:
        'Compact car charger with USB-C PD and USB-A ports. Fast charges two devices simultaneously on the road.',
      price: 12.99,
      sku: 'CHG-CAR-30W',
      categoryId: categories['car-chargers'].id,
      brandSlug: 'baseus',
      variants: [
        {
          name: 'Black',
          sku: 'CHG-CAR-30W-BK',
          price: 12.99,
          stock: 50,
          attributes: { color: 'Black' },
        },
        {
          name: 'Silver',
          sku: 'CHG-CAR-30W-SL',
          price: 13.99,
          stock: 35,
          attributes: { color: 'Silver' },
        },
      ],
      images: [
        {
          url: '/images/products/charger-car-30w-1.jpg',
          alt: '30W Dual USB Car Charger',
          sortOrder: 0,
        },
      ],
    },
    // ── Wireless Chargers ──
    {
      name: '15W Qi Wireless Charging Pad',
      slug: slugify('15W Qi Wireless Charging Pad'),
      description:
        'Slim Qi-certified wireless charging pad. Supports up to 15W fast wireless charging for compatible devices.',
      price: 19.99,
      compareAtPrice: 27.99,
      sku: 'CHG-WRLS-15W',
      categoryId: categories['wireless-chargers'].id,
      brandSlug: 'baseus',
      variants: [
        {
          name: 'Black',
          sku: 'CHG-WRLS-15W-BK',
          price: 19.99,
          stock: 40,
          attributes: { color: 'Black' },
        },
        {
          name: 'White',
          sku: 'CHG-WRLS-15W-WH',
          price: 19.99,
          stock: 40,
          attributes: { color: 'White' },
        },
      ],
      images: [
        {
          url: '/images/products/charger-wireless-15w-1.jpg',
          alt: '15W Qi Wireless Charging Pad',
          sortOrder: 0,
        },
        {
          url: '/images/products/charger-wireless-15w-2.jpg',
          alt: '15W Qi Wireless Charging Pad - Top View',
          sortOrder: 1,
        },
        {
          url: '/images/products/charger-wireless-15w-3.jpg',
          alt: '15W Qi Wireless Charging Pad - In Use',
          sortOrder: 2,
        },
      ],
    },
    // ── Lightning Cables ──
    {
      name: 'Lightning to USB-C Cable',
      slug: slugify('Lightning to USB-C Cable'),
      description:
        'MFi-certified Lightning to USB-C cable. Supports fast charging and data transfer up to 480Mbps.',
      price: 9.99,
      compareAtPrice: 14.99,
      sku: 'CAB-LTG-USBC',
      categoryId: categories['lightning-cables'].id,
      brandSlug: 'anker',
      variants: [
        {
          name: '1m / White',
          sku: 'CAB-LTG-USBC-1W',
          price: 9.99,
          stock: 100,
          attributes: { length: '1m', color: 'White' },
        },
        {
          name: '2m / White',
          sku: 'CAB-LTG-USBC-2W',
          price: 12.99,
          stock: 75,
          attributes: { length: '2m', color: 'White' },
        },
        {
          name: '3m / Black',
          sku: 'CAB-LTG-USBC-3B',
          price: 15.99,
          stock: 40,
          attributes: { length: '3m', color: 'Black' },
        },
      ],
      images: [
        {
          url: '/images/products/cable-lightning-1.jpg',
          alt: 'Lightning to USB-C Cable',
          sortOrder: 0,
        },
      ],
    },
    // ── USB-C Cables ──
    {
      name: 'USB-C to USB-C Cable',
      slug: slugify('USB-C to USB-C Cable'),
      description:
        'Braided USB-C to USB-C cable with 100W PD and 10Gbps data transfer. Durable nylon braiding for long life.',
      price: 11.99,
      compareAtPrice: 16.99,
      sku: 'CAB-USBC-USBC',
      categoryId: categories['usb-c-cables'].id,
      brandSlug: 'anker',
      variants: [
        {
          name: '1m / Black',
          sku: 'CAB-USBC-USBC-1B',
          price: 11.99,
          stock: 90,
          attributes: { length: '1m', color: 'Black' },
        },
        {
          name: '2m / Black',
          sku: 'CAB-USBC-USBC-2B',
          price: 14.99,
          stock: 65,
          attributes: { length: '2m', color: 'Black' },
        },
        {
          name: '3m / Gray',
          sku: 'CAB-USBC-USBC-3G',
          price: 17.99,
          stock: 35,
          attributes: { length: '3m', color: 'Gray' },
        },
      ],
      images: [
        { url: '/images/products/cable-usbc-1.jpg', alt: 'USB-C to USB-C Cable', sortOrder: 0 },
      ],
    },
    // ── Micro-USB Cables ──
    {
      name: 'Micro-USB Cable',
      slug: slugify('Micro-USB Cable'),
      description:
        'Standard Micro-USB to USB-A cable for charging and data sync. Compatible with older Android devices and accessories.',
      price: 5.99,
      sku: 'CAB-MUSB',
      categoryId: categories['micro-usb-cables'].id,
      variants: [
        {
          name: '1m / Black',
          sku: 'CAB-MUSB-1B',
          price: 5.99,
          stock: 120,
          attributes: { length: '1m', color: 'Black' },
        },
        {
          name: '2m / White',
          sku: 'CAB-MUSB-2W',
          price: 7.99,
          stock: 80,
          attributes: { length: '2m', color: 'White' },
        },
      ],
      images: [
        { url: '/images/products/cable-microusb-1.jpg', alt: 'Micro-USB Cable', sortOrder: 0 },
      ],
    },
    // ── Screen Protectors ──
    {
      name: 'Tempered Glass Screen Protector for iPhone 15',
      slug: slugify('Tempered Glass Screen Protector for iPhone 15'),
      description:
        '9H hardness tempered glass with oleophobic coating. Full coverage edge-to-edge protection with easy install frame.',
      price: 8.99,
      compareAtPrice: 12.99,
      sku: 'SP-IP15-TG',
      categoryId: categories['screen-protectors'].id,
      variants: [
        {
          name: 'Single Pack',
          sku: 'SP-IP15-TG-1',
          price: 8.99,
          stock: 100,
          attributes: { pack: '1' },
        },
        {
          name: 'Double Pack',
          sku: 'SP-IP15-TG-2',
          price: 13.99,
          stock: 60,
          attributes: { pack: '2' },
        },
      ],
      images: [
        {
          url: '/images/products/sp-iphone15-1.jpg',
          alt: 'Tempered Glass iPhone 15',
          sortOrder: 0,
        },
        {
          url: '/images/products/sp-iphone15-2.jpg',
          alt: 'Tempered Glass iPhone 15 - Install Frame',
          sortOrder: 1,
        },
      ],
    },
    {
      name: 'PET Film Screen Protector for Samsung Galaxy S24',
      slug: slugify('PET Film Screen Protector for Samsung Galaxy S24'),
      description:
        'Ultra-thin PET film protector with self-healing properties. Maintains touch sensitivity and display clarity.',
      price: 5.99,
      sku: 'SP-SGS24-PET',
      categoryId: categories['screen-protectors'].id,
      variants: [
        {
          name: 'Single Pack',
          sku: 'SP-SGS24-PET-1',
          price: 5.99,
          stock: 80,
          attributes: { pack: '1' },
        },
        {
          name: 'Triple Pack',
          sku: 'SP-SGS24-PET-3',
          price: 11.99,
          stock: 45,
          attributes: { pack: '3' },
        },
      ],
      images: [
        { url: '/images/products/sp-samsung-s24-1.jpg', alt: 'PET Film Samsung S24', sortOrder: 0 },
        {
          url: '/images/products/sp-samsung-s24-2.jpg',
          alt: 'PET Film Samsung S24 - Applied',
          sortOrder: 1,
        },
      ],
    },
    // ── iPhones (Brand = Apple, category = iPhone) ──
    // Multi-axis group: storage × color (variant-as-position, TASK-142). UA
    // content; realistic ₴ prices. Cyrillic variant names slugify to the same
    // token, so the position slug falls back to the (latin) SKU — see the
    // uniqueness pre-pass below.
    {
      name: 'Apple iPhone 15 Pro',
      slug: slugify('Apple iPhone 15 Pro'),
      description:
        'Флагман Apple з корпусом із титану, чипом A17 Pro та потрійною камерою 48 Мп. Дисплей Super Retina XDR ProMotion 120 Гц, роз’єм USB-C, кнопка «Дія».',
      price: 42999,
      compareAtPrice: 47999,
      sku: 'IP15PRO',
      categoryId: categories['iphone'].id,
      brandSlug: 'apple',
      metaTitle: `Купити Apple iPhone 15 Pro — ціна в Україні | ${STORE_NAME}`,
      metaDescription:
        'Apple iPhone 15 Pro у титановому корпусі: A17 Pro, камера 48 Мп, USB-C. Офіційна гарантія, доставка Новою Поштою.',
      variants: [
        {
          name: '128 ГБ / Натуральний титан',
          sku: 'IP15PRO-128-NT',
          price: 42999,
          stock: 12,
          attributes: { storage: '128 ГБ', color: 'Натуральний титан' },
        },
        {
          name: '128 ГБ / Блакитний титан',
          sku: 'IP15PRO-128-BT',
          price: 42999,
          stock: 8,
          attributes: { storage: '128 ГБ', color: 'Блакитний титан' },
        },
        {
          name: '256 ГБ / Натуральний титан',
          sku: 'IP15PRO-256-NT',
          price: 46999,
          stock: 6,
          attributes: { storage: '256 ГБ', color: 'Натуральний титан' },
        },
        {
          name: '256 ГБ / Блакитний титан',
          sku: 'IP15PRO-256-BT',
          price: 46999,
          stock: 5,
          attributes: { storage: '256 ГБ', color: 'Блакитний титан' },
        },
        {
          name: '512 ГБ / Натуральний титан',
          sku: 'IP15PRO-512-NT',
          price: 52999,
          stock: 3,
          attributes: { storage: '512 ГБ', color: 'Натуральний титан' },
        },
        {
          name: '512 ГБ / Блакитний титан',
          sku: 'IP15PRO-512-BT',
          price: 52999,
          stock: 2,
          attributes: { storage: '512 ГБ', color: 'Блакитний титан' },
        },
      ],
      images: [
        { url: 'placeholder', alt: 'Apple iPhone 15 Pro — вигляд спереду', sortOrder: 0 },
        { url: 'placeholder', alt: 'Apple iPhone 15 Pro — вигляд ззаду', sortOrder: 1 },
      ],
    },
    {
      name: 'Apple iPhone 14',
      slug: slugify('Apple iPhone 14'),
      description:
        'Надійний смартфон Apple з чипом A15 Bionic, подвійною камерою 12 Мп та дисплеєм Super Retina XDR 6.1". Аварійний виклик через супутник.',
      price: 29999,
      compareAtPrice: 33999,
      sku: 'IP14-128',
      categoryId: categories['iphone'].id,
      brandSlug: 'apple',
      metaTitle: `Купити Apple iPhone 14 — ціна в Україні | ${STORE_NAME}`,
      metaDescription:
        'Apple iPhone 14: чип A15 Bionic, камера 12 Мп, дисплей 6.1". Офіційна гарантія, оплата у гривні.',
      variants: [
        {
          name: 'Apple iPhone 14',
          sku: 'IP14-128',
          price: 29999,
          stock: 10,
          attributes: {},
        },
      ],
      images: [
        { url: 'placeholder', alt: 'Apple iPhone 14 — вигляд спереду', sortOrder: 0 },
        { url: 'placeholder', alt: 'Apple iPhone 14 — вигляд ззаду', sortOrder: 1 },
      ],
    },
    {
      name: 'Apple iPhone 13',
      slug: slugify('Apple iPhone 13'),
      description:
        'Популярний iPhone 13 з чипом A15 Bionic, подвійною камерою та яскравим OLED-дисплеєм. Чудовий баланс ціни та можливостей.',
      price: 24999,
      compareAtPrice: 27999,
      sku: 'IP13-128',
      categoryId: categories['iphone'].id,
      brandSlug: 'apple',
      metaTitle: `Купити Apple iPhone 13 — ціна в Україні | ${STORE_NAME}`,
      metaDescription:
        'Apple iPhone 13: A15 Bionic, подвійна камера 12 Мп, OLED 6.1". Офіційна гарантія, доставка по Україні.',
      variants: [
        {
          name: 'Apple iPhone 13',
          sku: 'IP13-128',
          price: 24999,
          stock: 7,
          attributes: {},
        },
      ],
      images: [
        { url: 'placeholder', alt: 'Apple iPhone 13 — вигляд спереду', sortOrder: 0 },
        { url: 'placeholder', alt: 'Apple iPhone 13 — вигляд ззаду', sortOrder: 1 },
      ],
    },
    // ── Standalone positions (no group — single buyable unit, TASK-142) ──
    {
      name: 'Universal Phone Holder for Car Dashboard',
      slug: slugify('Universal Phone Holder for Car Dashboard'),
      description:
        'Adjustable dashboard mount with a strong suction cup and 360° rotation. Fits phones 4.7"–7".',
      price: 16.99,
      compareAtPrice: 24.99,
      sku: 'ACC-CAR-HOLDER',
      categoryId: categories['car-chargers'].id,
      variants: [
        {
          name: 'Universal Phone Holder for Car Dashboard',
          sku: 'ACC-CAR-HOLDER',
          price: 16.99,
          stock: 40,
          attributes: {},
        },
      ],
      images: [
        {
          url: '/images/products/acc-car-holder-1.jpg',
          alt: 'Car Dashboard Phone Holder',
          sortOrder: 0,
        },
        {
          url: '/images/products/acc-car-holder-2.jpg',
          alt: 'Car Dashboard Phone Holder - Mounted',
          sortOrder: 1,
        },
      ],
    },
    {
      name: 'Braided USB-C to USB-C Cable 2m',
      slug: slugify('Braided USB-C to USB-C Cable 2m'),
      description:
        'Durable nylon-braided 100W USB-C cable, 2 metres. Currently sold out — restock incoming.',
      price: 11.99,
      sku: 'CABLE-USBC-2M',
      categoryId: categories['usb-c-cables'].id,
      variants: [
        {
          name: 'Braided USB-C to USB-C Cable 2m',
          sku: 'CABLE-USBC-2M',
          price: 11.99,
          stock: 0,
          attributes: {},
        },
      ],
      images: [
        {
          url: '/images/products/cable-usbc-2m-1.jpg',
          alt: 'Braided USB-C Cable 2m',
          sortOrder: 0,
        },
      ],
    },
  ];
}
