import {
  BatteryCharging,
  Cable,
  Camera,
  Gamepad2,
  Headphones,
  Keyboard,
  Laptop,
  Package,
  ShieldCheck,
  Smartphone,
  Speaker,
  Tablet,
  Tv,
  Watch,
  type LucideIcon,
} from "lucide-react";

// Categories carry no icon of their own, so we pick a lucide icon by matching
// keywords in the name/slug (same idea as the homepage CategoryNav) and derive a
// token-driven oklch gradient per tile index — no invented data, no raw hex.

const ICON_RULES: { match: RegExp; icon: LucideIcon }[] = [
  { match: /tablet|планшет/i, icon: Tablet },
  { match: /phone|смартфон|телефон/i, icon: Smartphone },
  { match: /laptop|ноут|моноблок|пк|монітор/i, icon: Laptop },
  { match: /watch|годинник|браслет|band|ремін/i, icon: Watch },
  { match: /headph|навуш|гарнітур/i, icon: Headphones },
  { match: /speaker|колонк|аудіо|audio/i, icon: Speaker },
  { match: /tv|телевізор/i, icon: Tv },
  { match: /gam|ігр|консол|геймпад/i, icon: Gamepad2 },
  { match: /cable|кабел|перехідник/i, icon: Cable },
  { match: /charg|заряд|батар|power|павербанк/i, icon: BatteryCharging },
  { match: /screen|glass|скло|плівк|захис/i, icon: ShieldCheck },
  { match: /keyboard|клавіат/i, icon: Keyboard },
  { match: /camera|фото|штатив|селфі/i, icon: Camera },
];

/** Pick an icon for a category by keyword (fallback: a generic box). */
export function pickCategoryIcon(name: string, slug: string): LucideIcon {
  const haystack = `${slug} ${name}`;
  return ICON_RULES.find((rule) => rule.match.test(haystack))?.icon ?? Package;
}

// Cycled hues for the tile cover gradients (token-driven oklch, theme-following).
const GRADIENT_HUES = [265, 200, 40, 150, 320, 25, 285, 175, 235, 305, 120, 90];

/** Token-driven cover gradient for a tile at `index`. */
export function categoryGradient(index: number): string {
  const hue = GRADIENT_HUES[index % GRADIENT_HUES.length];
  return `linear-gradient(140deg, oklch(0.7 0.16 ${hue}), oklch(0.55 0.19 ${hue}))`;
}
