import { Pagination } from "@store/store-client";

// Link-based pagination for every paged listing (catalogue, search, blog,
// order history). `buildHref` keeps the other filters in the URL.
const href = (page: number) => `/products?category=chohly&page=${page}`;

export const Middle = () => (
  <Pagination currentPage={4} totalPages={12} buildHref={href} />
);

export const FirstPage = () => (
  <Pagination currentPage={1} totalPages={12} buildHref={href} />
);

export const FewPages = () => (
  <Pagination currentPage={2} totalPages={3} buildHref={href} />
);
