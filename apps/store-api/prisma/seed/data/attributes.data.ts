export const definitionsData: {
  key: string;
  label: string;
  type: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'SELECT';
  unit?: string;
  options?: string[];
  isFilterable: boolean;
}[] = [
  { key: 'screen', label: 'Екран', type: 'TEXT', isFilterable: false },
  {
    key: 'memory',
    label: "Пам'ять",
    type: 'SELECT',
    options: ['128 ГБ', '256 ГБ', '512 ГБ', '1 ТБ'],
    isFilterable: true,
  },
  { key: 'camera', label: 'Камера', type: 'TEXT', isFilterable: false },
  { key: 'battery', label: 'Акумулятор', type: 'NUMBER', unit: 'мА·год', isFilterable: false },
];

// Per-model fixed specs (screen/camera/battery); memory comes from the
// position's own `storage` variant axis (or a default for standalone models).
export const modelSpecs = (
  slug: string,
): { screen: string; camera: string; battery: number } | null => {
  if (slug.startsWith('apple-iphone-15-pro')) {
    return {
      screen: '6.1" OLED Super Retina XDR ProMotion 120 Гц',
      camera: 'Потрійна 48 Мп + 12 Мп + 12 Мп',
      battery: 3274,
    };
  }
  if (slug.startsWith('apple-iphone-14')) {
    return {
      screen: '6.1" OLED Super Retina XDR',
      camera: 'Подвійна 12 Мп + 12 Мп',
      battery: 3279,
    };
  }
  if (slug.startsWith('apple-iphone-13')) {
    return {
      screen: '6.1" OLED Super Retina XDR',
      camera: 'Подвійна 12 Мп + 12 Мп',
      battery: 3240,
    };
  }
  return null;
};
