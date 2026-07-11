import type { PublicCarouselEntity } from "@/shared/api/generated/models";
import { CarouselRail } from "./carousel-rail";

interface RecommendationCarouselsProps {
  /** Published carousels with resolved products (from fetchPublishedCarousels). */
  carousels: PublicCarouselEntity[];
}

/**
 * RecommendationCarousels — the admin-managed homepage carousel block
 * (TASK-139). Server Component (mirrors PromoBanner/HeroBanner's
 * server-wrapper shape): filters out carousels whose resolved product list is
 * empty (the API returns them honestly; the homepage never shows a broken
 * empty section — same posture as RecentlyViewed hiding itself), renders
 * nothing at all when none survive, and otherwise maps each surviving
 * carousel to its own scrollable rail. The fragment's sections flatten into
 * the homepage's flex column, so each rail gets the standard section gap.
 */
export function RecommendationCarousels({
  carousels,
}: RecommendationCarouselsProps) {
  const visible = carousels.filter((carousel) => carousel.products.length > 0);
  if (visible.length === 0) return null;

  return (
    <>
      {visible.map((carousel) => (
        <CarouselRail key={carousel.id} carousel={carousel} />
      ))}
    </>
  );
}
