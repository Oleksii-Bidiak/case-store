import { RatingStars } from "@store/store-client";

export const Ratings = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    <RatingStars average={4.6} count={213} />
    <RatingStars average={3.2} count={17} />
    <RatingStars average={5} count={2} />
  </div>
);

export const Medium = () => <RatingStars average={4.5} count={128} size="md" />;
