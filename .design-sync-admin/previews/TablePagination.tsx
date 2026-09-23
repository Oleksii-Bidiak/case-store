import { TablePagination } from "@store/store-admin";

// The footer under every paged admin table: «Сторінка N з M», rows-per-page,
// Попередня / Наступна. The ends of the range disable their button.
export const FirstPage = () => (
  <div style={{ width: "100%" }}>
    <TablePagination page={1} totalPages={9} pageSize={20} />
  </div>
);

export const MiddlePage = () => (
  <div style={{ width: "100%" }}>
    <TablePagination page={4} totalPages={9} pageSize={50} />
  </div>
);

export const LastPage = () => (
  <div style={{ width: "100%" }}>
    <TablePagination page={9} totalPages={9} pageSize={20} />
  </div>
);

// A table whose DTO caps `limit` lower hides the rows-per-page control.
export const WithoutPageSize = () => (
  <div style={{ width: "100%" }}>
    <TablePagination page={2} totalPages={3} pageSize={20} hidePageSize />
  </div>
);
