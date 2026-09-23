import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@store/store-admin";

// Rich-text fields on the product / page / blog forms: «Редагування» vs
// «Перегляд» of the rendered description.
export const EditPreview = () => (
  <div style={{ width: 520 }}>
    <Tabs defaultValue="edit">
      <TabsList>
        <TabsTrigger value="edit">Редагування</TabsTrigger>
        <TabsTrigger value="preview">Перегляд</TabsTrigger>
      </TabsList>
      <TabsContent value="edit">
        <div className="rounded-md border border-border p-3 text-sm">
          Протиударний чохол Spigen Ultra Hybrid для iPhone 15 Pro: прозора
          задня панель, м'який бампер із TPU та посилені кути.
        </div>
      </TabsContent>
    </Tabs>
  </div>
);

// Order queue (widgets/order-list): lifecycle quick filters inside the
// TableToolbar. «В обробці» is the active tab.
export const OrderStatusFilter = () => (
  <Tabs value="processing">
    <TabsList aria-label="Швидкі фільтри за статусом">
      <TabsTrigger value="new">Нові</TabsTrigger>
      <TabsTrigger value="processing">В обробці</TabsTrigger>
      <TabsTrigger value="shipped">Відправлені</TabsTrigger>
      <TabsTrigger value="all">Всі</TabsTrigger>
    </TabsList>
  </Tabs>
);

// Banner form: TabsList stretched with className="w-full" — form vs live
// preview of the placement.
export const FullWidth = () => (
  <div style={{ width: 520 }}>
    <Tabs defaultValue="preview">
      <TabsList className="w-full">
        <TabsTrigger value="form">Форма</TabsTrigger>
        <TabsTrigger value="preview">Прев'ю</TabsTrigger>
      </TabsList>
    </Tabs>
  </div>
);

// Manual order creation: who the order belongs to. Disabled-trigger state
// shown on the second mode (e.g. while the form is submitting).
export const WithDisabledTab = () => (
  <Tabs value="guest">
    <TabsList aria-label="Кому належить замовлення">
      <TabsTrigger value="guest">Без акаунта (за телефоном)</TabsTrigger>
      <TabsTrigger value="account" disabled>
        Існуючий акаунт
      </TabsTrigger>
    </TabsList>
  </Tabs>
);
