import {
  Button,
  Checkbox,
  LiveAnnouncer,
  TableFilters,
  TableSearch,
  TableToolbar,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@store/store-admin";
import { Clock3, Plus } from "lucide-react";

const noop = () => {};

// Product list (widgets/product-list): search, three URL filters (status is
// set, so its chip shows), the card-mode select-all mirror and refresh.
export const ProductList = () => (
  <LiveAnnouncer>
    <div style={{ width: "100%" }}>
      <TableToolbar
        className="mb-0"
        onRefresh={noop}
        search={
          <TableSearch
            value=""
            placeholder="Пошук товарів…"
            label="Пошук товарів"
          />
        }
        filters={
          <TableFilters
            filters={[
              {
                param: "status",
                label: "Фільтр за статусом",
                allLabel: "Усі статуси",
                options: [
                  { value: "active", label: "Лише активні" },
                  { value: "hidden", label: "Лише приховані" },
                ],
              },
              {
                param: "stock",
                label: "Фільтр за залишком",
                allLabel: "Будь-який залишок",
                options: [{ value: "out", label: "Немає в наявності" }],
              },
              {
                param: "deleted",
                label: "Видалені",
                allLabel: "Без видалених",
                options: [{ value: "only", label: "Лише видалені" }],
              },
            ]}
            values={{ status: "active", stock: undefined, deleted: undefined }}
          />
        }
        selectAll={
          <Checkbox
            checked={false}
            onCheckedChange={noop}
            aria-label="Вибрати всі рядки на сторінці"
          />
        }
      />
    </div>
  </LiveAnnouncer>
);

// Order queue (widgets/order-list): lifecycle Tabs + payment filter + the
// «Чекають занадто довго» toggle in the filters slot.
export const OrderQueue = () => (
  <LiveAnnouncer>
    <div style={{ width: "100%" }}>
      <TableToolbar
        className="mb-0"
        onRefresh={noop}
        search={
          <TableSearch
            value="0671234567"
            placeholder="Номер замовлення, пошта або телефон…"
            label="Пошук замовлень"
          />
        }
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value="new">
              <TabsList aria-label="Швидкі фільтри за статусом">
                <TabsTrigger value="new">Нові</TabsTrigger>
                <TabsTrigger value="processing">В обробці</TabsTrigger>
                <TabsTrigger value="shipped">Відправлені</TabsTrigger>
                <TabsTrigger value="all">Всі</TabsTrigger>
              </TabsList>
            </Tabs>
            <TableFilters
              filters={[
                {
                  param: "paymentMethod",
                  label: "Фільтр за способом оплати",
                  allLabel: "Будь-який спосіб оплати",
                  options: [
                    { value: "COD", label: "Оплата при отриманні" },
                    { value: "CARD", label: "Картка онлайн" },
                    { value: "INSTALLMENTS", label: "Оплата частинами" },
                  ],
                },
              ]}
              values={{ paymentMethod: undefined }}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-pressed
              aria-label="Показати лише замовлення, які надто довго чекають підтвердження"
            >
              <Clock3 aria-hidden="true" className="size-3.5" />
              Чекають занадто довго
            </Button>
          </div>
        }
      />
    </div>
  </LiveAnnouncer>
);

// A refetch in flight (isRefreshing = query.isFetching): spinner + disabled
// refresh, with a right-pinned create action.
export const Refreshing = () => (
  <LiveAnnouncer>
    <div style={{ width: "100%" }}>
      <TableToolbar
        className="mb-0"
        onRefresh={noop}
        isRefreshing
        search={
          <TableSearch
            value=""
            placeholder="Пошук за назвою…"
            label="Пошук брендів за назвою"
          />
        }
        actions={
          <Button size="sm">
            <Plus />
            Створити бренд
          </Button>
        }
      />
    </div>
  </LiveAnnouncer>
);
