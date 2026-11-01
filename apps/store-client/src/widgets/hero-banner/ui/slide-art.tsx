import { Smartphone, Truck, type LucideIcon } from "lucide-react";
import { BannerBackdrop } from "@/shared/ui";
import { cn } from "@/shared/lib/utils";

/** Placeholder art of the dictionary fallback slides (no picture yet). */
export type SlideArtIcon = "smartphone" | "truck";

const ICONS: Record<SlideArtIcon, LucideIcon> = {
  smartphone: Smartphone,
  truck: Truck,
};

export interface SlideArtProps {
  /** The admin banner picture (TASK-740); `object-cover` inside the panel. */
  imageUrl?: string;
  /** Optional big display figure, e.g. «−15%» (Homepage mockup, slide 1). */
  big?: string;
  /** Placeholder glyph while the slide has no picture. */
  icon?: SlideArtIcon;
  /** The first slide's picture is the desktop LCP: preload only it. */
  preload?: boolean;
  /** Invisible height-reserving copy: the frame only, no picture. */
  sizer?: boolean;
}

/** A slide has an art panel when it has anything to put in it. */
export function hasSlideArt({ imageUrl, big, icon }: SlideArtProps): boolean {
  return Boolean(imageUrl || big || icon);
}

/**
 * SlideArt — the right column of a hero slide from md (TASK-2013, Homepage
 * mockup: 1fr beside the 1.2fr copy, `rounded-lg`, at least 200px tall). It
 * holds the banner picture, and the optional big figure on top of it. Without
 * a picture it is a faint tint of the slide's own text colour
 * (`bg-current/10`, so it reads on every tone) with a placeholder glyph — the
 * dictionary fallback slides have no picture.
 *
 * Hidden below md: on a phone the copy takes the whole slide. Decoration
 * only (`aria-hidden`): the slide's h2, subtitle and CTA say everything.
 */
export function SlideArt({
  imageUrl,
  big,
  icon,
  preload = false,
  sizer = false,
}: SlideArtProps) {
  const Icon = icon ? ICONS[icon] : undefined;
  const picture = Boolean(imageUrl) && !sizer;
  return (
    <div
      aria-hidden="true"
      data-slide-art=""
      className={cn(
        "relative isolate hidden min-h-50 flex-col justify-between gap-2 self-stretch overflow-hidden rounded-lg p-6 md:col-span-5 md:flex",
        !picture && "bg-current/10",
      )}
    >
      {picture && (
        // Below md the panel is display:none; the 1px hint makes a phone pick
        // the smallest candidate if it fetches the preloaded picture at all.
        <BannerBackdrop
          src={imageUrl}
          sizes="(max-width: 767px) 1px, (max-width: 1023px) 40vw, 360px"
          scrimClassName=""
          preload={preload}
        />
      )}
      {big && (
        <span
          className={cn(
            "self-start font-display text-4xl leading-none font-bold tracking-tight xl:text-6xl",
            // Over a photo the figure sits on a card chip, so it never
            // depends on the picture for contrast.
            picture && "rounded-sm bg-card/85 px-3 py-2 text-foreground",
          )}
        >
          {big}
        </span>
      )}
      {Icon && !picture && (
        <Icon
          strokeWidth={1.25}
          className={cn("size-20 text-current/45", big ? "self-end" : "m-auto")}
        />
      )}
    </div>
  );
}
