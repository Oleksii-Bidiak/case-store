import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import type {
  ContentMapTab,
  SchemaBlockSize,
} from "../model/content-map-zones";

const c = dict.contentMap;

const HEIGHT: Record<SchemaBlockSize, string> = {
  xs: "h-6",
  sm: "h-8",
  md: "h-10",
  lg: "h-16",
  xl: "h-24",
};

interface ContentMapSchemaProps {
  tab: ContentMapTab;
  selected: number | null;
  onSelect: (zone: number) => void;
}

/**
 * The page schema (ContentMapProposal ДЩ1): the storefront page as blocks,
 * top to bottom, each numbered like its zone card. A numbered block is a
 * toggle button — picking it highlights the block here and the card in the
 * list. Grey blocks are parts of the page no content zone controls (the
 * header, the products).
 */
export function ContentMapSchema({
  tab,
  selected,
  onSelect,
}: ContentMapSchemaProps) {
  return (
    <section
      aria-label={tab.schemaTitle}
      className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3"
    >
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {tab.schemaTitle}
      </h3>
      <div className="flex flex-col gap-1.5">
        {tab.blocks.map((block, index) =>
          "row" in block ? (
            <div key={index} className="grid grid-cols-3 gap-1.5">
              {block.row.map((cell, cellIndex) => (
                <SchemaBlockButton
                  key={cellIndex}
                  zone={cell.zone}
                  label={cell.label}
                  className="h-10"
                  selected={selected === cell.zone}
                  onSelect={onSelect}
                />
              ))}
            </div>
          ) : block.zone ? (
            <SchemaBlockButton
              key={index}
              zone={block.zone}
              label={block.label}
              className={HEIGHT[block.size]}
              selected={selected === block.zone}
              onSelect={onSelect}
            />
          ) : (
            <div
              key={index}
              className={cn(
                "flex items-center justify-center rounded-sm bg-muted px-2 text-center text-xs text-muted-foreground",
                HEIGHT[block.size],
              )}
            >
              {block.label}
            </div>
          ),
        )}
      </div>
      <p className="text-xs text-muted-foreground">{c.schemaNote}</p>
    </section>
  );
}

function SchemaBlockButton({
  zone,
  label,
  className,
  selected,
  onSelect,
}: {
  zone: number;
  label: string;
  className: string;
  selected: boolean;
  onSelect: (zone: number) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={c.blockAria(zone, label)}
      onClick={() => onSelect(zone)}
      className={cn(
        "relative flex items-center justify-center rounded-sm border border-dashed bg-background px-2 text-center text-xs text-muted-foreground outline-none hover:border-primary/60 focus-visible:ring-3 focus-visible:ring-ring/50",
        selected &&
          "border-2 border-solid border-primary bg-primary/10 font-medium text-foreground",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute -top-1.5 -left-1.5 flex size-4 items-center justify-center rounded-full text-2xs font-semibold tabular-nums",
          selected
            ? "bg-primary text-primary-foreground"
            : "bg-foreground text-background",
        )}
      >
        {zone}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}
