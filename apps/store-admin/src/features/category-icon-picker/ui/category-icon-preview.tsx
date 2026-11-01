import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { CategoryIcon } from "@/shared/ui";

import {
  iconPreviewTiles,
  type IconPreviewRow,
} from "../model/icon-picker-model";

const t = dict.categoryForm.icon;

const CAPS =
  "text-2xs font-bold tracking-wider text-muted-foreground uppercase";

/**
 * «Як це виглядатиме на сайті» (TASK-1956) — the edited category among its
 * siblings, as the «Каталог» menu and the homepage tiles would draw it. It
 * follows the form live, before saving. The mock rows repeat real names, so
 * they are hidden from assistive tech; the heading and the line under it stay.
 */
export function CategoryIconPreview({
  rows,
  className,
}: {
  rows: readonly IconPreviewRow[];
  className?: string;
}) {
  const tiles = iconPreviewTiles(rows);
  return (
    <div
      data-slot="category-icon-preview"
      className={cn(
        "flex flex-col gap-3 rounded-lg bg-muted p-4 text-foreground",
        className,
      )}
    >
      <div className="flex flex-col gap-0.5">
        <h4 className="text-sm font-semibold">{t.previewTitle}</h4>
        <p className="text-xs text-muted-foreground">{t.previewSub}</p>
      </div>

      <div aria-hidden="true" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <span className={CAPS}>{t.previewMenu}</span>
          <ul className="flex flex-col gap-0.5 rounded-xl bg-background p-1.5">
            {rows.map((row) => (
              <li
                key={row.id}
                data-current={row.current ? "" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-pill font-medium",
                  row.current && "bg-muted font-bold",
                )}
              >
                <CategoryIcon icon={row.icon} className="size-5" />
                <span className="min-w-0 truncate">{row.name}</span>
                {row.count != null && (
                  <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">
                    {row.count.toLocaleString("uk-UA")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className={CAPS}>{t.previewTiles}</span>
          <div className="grid grid-cols-2 gap-2">
            {tiles.map((tile) => (
              <div
                key={tile.id}
                className={cn(
                  "flex min-w-0 flex-col gap-2 rounded-xl bg-background p-3 text-pill font-semibold",
                  tile.current && "ring-2 ring-foreground",
                )}
              >
                <span className="grid size-9 place-items-center rounded-md bg-muted">
                  <CategoryIcon icon={tile.icon} className="size-5" />
                </span>
                <span className="truncate">{tile.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
