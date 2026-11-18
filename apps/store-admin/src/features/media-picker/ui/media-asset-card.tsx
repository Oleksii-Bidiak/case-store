"use client";

import { useId } from "react";
import type { MediaAssetEntity } from "@/entities/media";
import { Badge } from "@/shared/ui";
import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import { isImportedAsset, mediaCardMeta } from "../model/media-asset-meta";

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
  /** Uploaded since this screen opened — the «Нове» badge (МТ1). */
  isNew?: boolean;
  /**
   * Whether this operator may write the alt text. An empty description is then
   * a call to action («Без опису — додайте»); for a read-only operator it is
   * only a fact («Без опису») — asking someone to add what they cannot is noise.
   */
  canWrite?: boolean;
  /**
   * Marks the tile as the current choice (the picker's select-then-confirm,
   * БЛ11). `undefined` = the tile is not a toggle at all, and announces no
   * pressed state — on `/media` a tile opens a dialog, it does not select.
   */
  selected?: boolean;
}

/**
 * One tile in the library grid — the `/media` screen's and the picker's, the
 * same component (TASK-441).
 *
 * THREE LINES UNDER THE PICTURE (wave 198, МТ1): the description, where the
 * file came from, and what it is (dimensions · weight · date). The second line
 * is the honest one for the catalogue backfill — «з каталогу (імпорт)» rather
 * than «невідомо · невідомо». For an upload it is the ORIGINAL file name the
 * operator picked (TASK-1731); where that is unknown (rows from before it was
 * recorded) the line is simply absent rather than a hashed storage key nobody
 * chose.
 *
 * The whole tile is a single `<button>`, so there is exactly one tab stop per
 * asset and Enter/Space do what a click does. Everything inside is therefore
 * presentational: the `<img>` carries an empty `alt` because the button's own
 * name already says which picture this is.
 *
 * NAME VS DESCRIPTION (TASK-1746): `aria-label` replaces the button's content,
 * so on its own it hides every line under the picture — a screen-reader user
 * would learn about a missing alt only inside the dialog. The name therefore
 * stays short (action + which picture) and the visible state lines are the
 * button's DESCRIPTION, by `aria-describedby` pointing at those same elements:
 * read right after the name, never duplicated as hidden text. The alt line is
 * referenced only when it is empty — a filled alt is already the name.
 */
export function MediaAssetCard({
  asset,
  onOpen,
  label = t.openCardAria,
  isNew = false,
  canWrite = false,
  selected,
}: MediaAssetCardProps) {
  const alt = asset.alt?.trim();
  const name = alt || fileNameFrom(asset.url);
  const imported = isImportedAsset(asset);
  const hasSourceLine = imported || Boolean(asset.originalFilename);

  const id = useId();
  const ids = {
    alt: `${id}-alt`,
    source: `${id}-source`,
    meta: `${id}-meta`,
    usage: `${id}-usage`,
    tag: (index: number) => `${id}-tag-${index}`,
    isNew: `${id}-new`,
  };
  const describedBy = [
    !alt && ids.alt,
    hasSourceLine && ids.source,
    ids.meta,
    ids.usage,
    ...asset.tags.map((_, index) => ids.tag(index)),
    isNew && ids.isNew,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li className="flex">
      <button
        type="button"
        onClick={() => onOpen(asset)}
        aria-label={label(name)}
        aria-describedby={describedBy}
        aria-pressed={selected}
        className={cn(
          "flex w-full flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-colors outline-none hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          selected && "border-primary ring-1 ring-primary",
        )}
      >
        <span className="relative block aspect-square w-full overflow-hidden bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={asset.url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
          {/* An opaque pill under the tinted badge, so it reads over any photo. */}
          {isNew && (
            <span className="absolute top-2 left-2 rounded-full bg-background">
              <Badge id={ids.isNew} variant="new">
                {t.newBadge}
              </Badge>
            </span>
          )}
        </span>

        <span className="flex flex-1 flex-col gap-0.5 p-2.5">
          <span
            id={ids.alt}
            className={cn(
              "truncate text-sm font-medium",
              !alt && "text-muted-foreground italic",
            )}
          >
            {alt || (canWrite ? t.noAltAdd : t.noAlt)}
          </span>
          {hasSourceLine && (
            <span
              id={ids.source}
              className="truncate font-mono text-xs text-muted-foreground"
            >
              {imported ? t.importedSource : asset.originalFilename}
            </span>
          )}
          <span id={ids.meta} className="text-xs text-muted-foreground">
            {mediaCardMeta(asset)}
          </span>

          <span className="mt-1.5 flex flex-wrap items-center gap-1">
            <Badge
              id={ids.usage}
              variant={asset.usedInCount > 0 ? "default" : "secondary"}
            >
              {asset.usedInCount > 0
                ? t.usedInBadge(asset.usedInCount)
                : t.unusedBadge}
            </Badge>
            {asset.tags.map((tag, index) => (
              <Badge key={tag} id={ids.tag(index)} variant="outline">
                {tag}
              </Badge>
            ))}
          </span>
        </span>
      </button>
    </li>
  );
}
