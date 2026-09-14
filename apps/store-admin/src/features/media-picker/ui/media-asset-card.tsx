"use client";

import type { MediaAssetEntity } from "@/entities/media";
import { Badge } from "@/shared/ui";
import { dict } from "@/shared/config";

const t = dict.mediaLibrary;

/**
 * What to call an asset that has no alt text yet — the tail of its URL.
 *
 * Not a nicety: the card's accessible name is the only way a screen-reader user
 * tells one thumbnail from the next, and a library of freshly dropped photos has
 * no alt text on ANY of them by definition. «Відкрити зображення «a7f3….webp»»
 * is poor, but it is distinct; fourteen buttons all named «Відкрити зображення»
 * are unusable.
 */
function fileNameFrom(url: string): string {
  const withoutQuery = url.split("?")[0];
  return withoutQuery.slice(withoutQuery.lastIndexOf("/") + 1) || url;
}

interface MediaAssetCardProps {
  asset: MediaAssetEntity;
  onOpen: (asset: MediaAssetEntity) => void;
  /**
   * Builds the tile's accessible name. Defaults to «Відкрити зображення «…»»,
   * which is what the `/media` screen does; the picker overrides it with
   * «Обрати…», because the same tile there does a different thing and the
   * accessible name is the only place a screen-reader user learns which.
   */
  label?: (name: string) => string;
}

/**
 * One tile in the library grid — the `/media` screen's and the picker's, the
 * same component (TASK-441).
 *
 * The whole tile is a single `<button>`, so there is exactly one tab stop per
 * asset and Enter/Space do what a click does. Everything inside is therefore
 * presentational: the `<img>` carries an empty `alt` because the button's own
 * name already says which picture this is, and repeating it would have a screen
 * reader announce the same words twice.
 */
export function MediaAssetCard({
  asset,
  onOpen,
  label = t.openCardAria,
}: MediaAssetCardProps) {
  const name = asset.alt?.trim() || fileNameFrom(asset.url);

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(asset)}
        aria-label={label(name)}
        className="flex w-full flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-colors outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <span className="block aspect-square w-full overflow-hidden bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={asset.url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </span>

        <span className="flex flex-col gap-1.5 p-2">
          <span className="truncate text-sm font-medium">
            {asset.alt?.trim() || (
              <span className="text-muted-foreground">{t.noAlt}</span>
            )}
          </span>

          <span className="flex flex-wrap items-center gap-1">
            <Badge variant={asset.usedInCount > 0 ? "default" : "secondary"}>
              {asset.usedInCount > 0
                ? t.usedInBadge(asset.usedInCount)
                : t.unusedBadge}
            </Badge>
            {asset.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </span>
        </span>
      </button>
    </li>
  );
}
