import {
  SortableColumnHeader,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@store/store-admin";

const noop = () => {};

// Product list header (widgets/product-list): the four sortable columns
// (stock carries a hint tooltip). The active column shows a single chevron; the rest a dimmed up-down.
const ProductHeader = ({
  sortBy,
  sortOrder,
}: {
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}) => (
  <div style={{ width: "100%" }}>
    <Table>
      <TableHeader>
        <TableRow>
          <SortableColumnHeader
            field="name"
            label="Назва"
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={noop}
          />
          <SortableColumnHeader
            field="price"
            label="Ціна"
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={noop}
          />
          <SortableColumnHeader
            field="stock"
            label="Вільно / Резерв / Фізично"
            hint="Фізично = вільно + зарезервовано під незакриті замовлення"
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={noop}
          />
          <SortableColumnHeader
            field="createdAt"
            label="Створено"
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={noop}
          />
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">
            Чохол Spigen для iPhone 15 Pro
          </TableCell>
          <TableCell>899 ₴</TableCell>
          <TableCell className="tabular-nums">12 / 3 / 15</TableCell>
          <TableCell className="text-muted-foreground">12.09.2026</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
);

// No sort in the URL yet: every sortable column shows the neutral icon.
export const Unsorted = () => <ProductHeader />;

// ?sortBy=price&sortOrder=asc
export const Ascending = () => <ProductHeader sortBy="price" sortOrder="asc" />;

// ?sortBy=createdAt&sortOrder=desc — the list's default "newest first".
export const Descending = () => (
  <ProductHeader sortBy="createdAt" sortOrder="desc" />
);
