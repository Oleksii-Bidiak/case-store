import { ReviewRatingStars } from "@store/store-client";

// One review's whole-number rating: `sm` in a review row, `lg` where the
// rating is the subject (the "your review" block of the review form).
export const InReviewRow = () => (
  <div style={{ display: "grid", gap: 6, maxWidth: 360, fontSize: 14 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <b>Олена К.</b>
      <ReviewRatingStars rating={4} />
    </div>
    <span style={{ color: "var(--color-muted-foreground)" }}>
      Чохол щільно сидить, MagSafe тримає добре. Трохи ковзає в руці.
    </span>
  </div>
);

export const Large = () => <ReviewRatingStars rating={5} size="lg" />;
