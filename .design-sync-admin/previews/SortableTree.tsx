import {
  Badge,
  Button,
  Checkbox,
  LiveAnnouncer,
  SortableTree,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@store/store-admin";
import { ChevronRight, GripVertical, MoreHorizontal } from "lucide-react";

// SortableTree renders no markup of its own: it hands each visible row to
// `renderRow` with the dnd-kit node ref, transform style and drag-handle props.
// The admin places it inside a <TableBody> and wraps the screen in
// <LiveAnnouncer> (the tree announces grab / drop through useAnnouncer).

const noop = () => {};
const INDENT_PX = 24;

/* ── Category tree (widgets/category-tree), maxDepth 3 ─────────────────── */
// The real treegrid also has a Slug column (hideOnMobile); it is left out here
// so the remaining columns fit the card width without clipping «Дії».

type CategoryMeta = {
  slug: string;
  products: number;
  direct: number;
  active: boolean;
  expanded?: boolean;
  hiddenByParent?: boolean;
};

const categories = [
  { id: "smartphones", parentId: null, label: "Смартфони" },
  { id: "iphone", parentId: "smartphones", label: "iPhone" },
  { id: "samsung-phones", parentId: "smartphones", label: "Samsung Galaxy" },
  { id: "xiaomi-phones", parentId: "smartphones", label: "Xiaomi та Redmi" },
  { id: "headphones", parentId: null, label: "Навушники" },
  {
    id: "tws-earbuds",
    parentId: "headphones",
    label: "Бездротові вкладиші (TWS)",
  },
  {
    id: "wired-headphones",
    parentId: "headphones",
    label: "Дротові навушники",
  },
  { id: "power-banks", parentId: null, label: "Павербанки" },
];

const categoryMeta: Record<string, CategoryMeta> = {
  smartphones: {
    slug: "smartphones",
    products: 24,
    direct: 0,
    active: true,
    expanded: true,
  },
  iphone: { slug: "iphone", products: 12, direct: 12, active: true },
  "samsung-phones": {
    slug: "samsung-phones",
    products: 8,
    direct: 8,
    active: true,
  },
  "xiaomi-phones": {
    slug: "xiaomi-phones",
    products: 4,
    direct: 4,
    active: true,
  },
  headphones: {
    slug: "headphones",
    products: 17,
    direct: 2,
    active: false,
    expanded: true,
  },
  "tws-earbuds": {
    slug: "tws-earbuds",
    products: 11,
    direct: 11,
    active: true,
    hiddenByParent: true,
  },
  "wired-headphones": {
    slug: "wired-headphones",
    products: 4,
    direct: 4,
    active: true,
    hiddenByParent: true,
  },
  "power-banks": {
    slug: "power-banks",
    products: 15,
    direct: 15,
    active: true,
    expanded: false,
  },
};

export const CategoryTree = () => (
  <LiveAnnouncer>
    <div
      style={{ width: "100%" }}
      className="rounded-lg border border-border shadow-card overflow-hidden"
    >
      <Table role="treegrid" aria-label="Дерево категорій">
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox checked={false} aria-label="Вибрати всі категорії" />
            </TableHead>
            <TableHead>Назва</TableHead>
            <TableHead>Товари</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead className="text-right">Дії</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <SortableTree
            items={categories}
            maxDepth={3}
            onMove={noop}
            renderRow={({ item, level, setNodeRef, style, handleProps }) => {
              const meta = categoryMeta[item.id];
              // «Павербанки» is collapsed: its children are not in `items`
              // (the tree only receives VISIBLE rows), but it keeps a chevron.
              const hasChildren = meta.expanded !== undefined;
              return (
                <TableRow
                  key={item.id}
                  ref={setNodeRef}
                  role="row"
                  aria-level={level}
                  style={style}
                >
                  <TableCell role="gridcell" className="w-10">
                    <Checkbox
                      checked={item.id === "iphone"}
                      aria-label={`Вибрати „${item.label}“`}
                    />
                  </TableCell>
                  <TableCell role="gridcell">
                    <div
                      className="flex items-center gap-1"
                      style={{ paddingInlineStart: (level - 1) * INDENT_PX }}
                    >
                      {hasChildren ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="size-6 p-0"
                          aria-label={
                            meta.expanded
                              ? `Згорнути „${item.label}“`
                              : `Розгорнути „${item.label}“`
                          }
                        >
                          <ChevronRight
                            aria-hidden="true"
                            className={
                              meta.expanded ? "size-4 rotate-90" : "size-4"
                            }
                          />
                        </Button>
                      ) : (
                        <span
                          aria-hidden="true"
                          className="inline-block size-6"
                        />
                      )}
                      <button
                        type="button"
                        {...handleProps}
                        aria-label={`Перемістити „${item.label}“`}
                        className="inline-flex size-6 cursor-grab items-center justify-center text-muted-foreground"
                      >
                        <GripVertical aria-hidden="true" className="size-4" />
                      </button>
                      <span className="font-medium">{item.label}</span>
                    </div>
                  </TableCell>
                  <TableCell role="gridcell">
                    {meta.products}
                    {meta.products !== meta.direct ? (
                      <span className="ml-1 text-muted-foreground">
                        (безпосередньо {meta.direct})
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell role="gridcell">
                    <Badge variant={meta.active ? "default" : "secondary"}>
                      {meta.active ? "Активний" : "Неактивний"}
                    </Badge>
                    {meta.hiddenByParent ? (
                      <Badge variant="outline" className="ml-1 align-middle">
                        Прихована через батька
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell role="gridcell" className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Дії: „${item.label}“`}
                    >
                      <MoreHorizontal />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            }}
          />
        </TableBody>
      </Table>
    </div>
  </LiveAnnouncer>
);

/* ── Flat reorderable list (widgets/faq-list), maxDepth 1 ──────────────── */

const faq = [
  {
    id: "delivery-cost",
    parentId: null,
    label: "Скільки коштує доставка?",
    active: true,
  },
  {
    id: "dispatch",
    parentId: null,
    label: "Як швидко відправляєте замовлення?",
    active: true,
  },
  {
    id: "returns",
    parentId: null,
    label: "Чи можна повернути товар?",
    active: true,
  },
  {
    id: "warranty",
    parentId: null,
    label: "Яка гарантія на техніку?",
    active: false,
  },
  {
    id: "payment",
    parentId: null,
    label: "Які способи оплати доступні?",
    active: true,
  },
];

const FaqTable = ({ disabled = false }: { disabled?: boolean }) => (
  <LiveAnnouncer>
    <div
      style={{ width: "100%" }}
      className="rounded-lg border border-border shadow-card overflow-hidden"
    >
      <Table role="grid" aria-label="Запитання — порядок">
        <TableHeader>
          <TableRow>
            <TableHead>Запитання</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead className="text-right">Дії</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <SortableTree
            items={faq.map(({ id, parentId, label }) => ({
              id,
              parentId,
              label,
            }))}
            maxDepth={1}
            disabled={disabled}
            onMove={noop}
            renderRow={({ item, setNodeRef, style, handleProps }) => {
              const active = faq.find((f) => f.id === item.id)?.active ?? true;
              return (
                <TableRow
                  key={item.id}
                  ref={setNodeRef}
                  role="row"
                  style={style}
                >
                  <TableCell role="gridcell" className="font-medium">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        {...handleProps}
                        aria-label={`Перемістити „${item.label}“`}
                        aria-disabled={disabled || undefined}
                        className="inline-flex size-6 cursor-grab items-center justify-center text-muted-foreground"
                      >
                        <GripVertical aria-hidden="true" className="size-4" />
                      </button>
                      <span>{item.label}</span>
                    </div>
                  </TableCell>
                  <TableCell role="gridcell">
                    <Badge variant={active ? "default" : "secondary"}>
                      {active ? "Показується" : "Приховано"}
                    </Badge>
                  </TableCell>
                  <TableCell role="gridcell" className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm">
                        Редагувати
                      </Button>
                      <Button variant="outline" size="sm">
                        {active ? "Приховати" : "Показати"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            }}
          />
        </TableBody>
      </Table>
    </div>
  </LiveAnnouncer>
);

export const FlatList = () => <FaqTable />;
