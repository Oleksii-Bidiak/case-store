import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSelectCell,
  TableSelectHead,
} from "@store/store-admin";

const products = [
  {
    id: "1",
    name: "Чохол Spigen Ultra Hybrid для iPhone 15 Pro",
    meta: "SPG-UH-15P · Spigen",
    category: "Чохли",
    price: "899 ₴",
    active: true,
    created: "12.09.2026",
    selected: true,
  },
  {
    id: "2",
    name: "Захисне скло ESR Armorite для iPhone 15",
    meta: "ESR-AR-15 · ESR",
    category: "Захисне скло",
    price: "549 ₴",
    active: true,
    created: "08.09.2026",
    selected: false,
  },
  {
    id: "3",
    name: "Кабель Apple USB-C — Lightning, 1 м",
    meta: "MUQ93 · Apple",
    category: "Кабелі",
    price: "1 199 ₴",
    active: false,
    created: "02.09.2026",
    selected: false,
  },
];

// The admin list idiom (widgets/product-list): select column, name + meta
// line, muted secondary cells, status badge, row action.
// layout="card" turns rows into stacked cards below md.
export const ProductList = () => (
  <div style={{ width: "100%" }}>
    <Table layout="card">
      <TableHeader>
        <TableRow>
          <TableSelectHead
            checked="indeterminate"
            onCheckedChange={() => {}}
            label="Вибрати всі рядки на сторінці"
          />
          <TableHead>Назва</TableHead>
          <TableHead>Категорія</TableHead>
          <TableHead>Ціна</TableHead>
          <TableHead>Статус</TableHead>
          <TableHead className="text-right">Дії</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((p) => (
          <TableRow
            key={p.id}
            rowLabel={p.name}
            data-state={p.selected ? "selected" : undefined}
          >
            <TableSelectCell
              checked={p.selected}
              onSelect={() => {}}
              label={`Вибрати «${p.name}»`}
            />
            <TableCell label="Назва" className="font-medium">
              <span className="block">{p.name}</span>
              <span className="text-xs text-muted-foreground">{p.meta}</span>
            </TableCell>
            <TableCell label="Категорія" className="text-muted-foreground">
              {p.category}
            </TableCell>
            <TableCell label="Ціна">{p.price}</TableCell>
            <TableCell label="Статус">
              <Badge variant={p.active ? "default" : "secondary"}>
                {p.active ? "Активний" : "Прихований"}
              </Badge>
            </TableCell>
            <TableCell label="Дії" className="text-right">
              <Button variant="outline" size="sm">
                Редагувати
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

export const Simple = () => (
  <div style={{ width: 560 }}>
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Замовлення</TableHead>
          <TableHead>Клієнт</TableHead>
          <TableHead className="text-right">Сума</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">#A1B2C3D4</TableCell>
          <TableCell className="text-muted-foreground">Олена Коваль</TableCell>
          <TableCell className="text-right tabular-nums">2 347 ₴</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">#E5F6A7B8</TableCell>
          <TableCell className="text-muted-foreground">
            Андрій Мельник
          </TableCell>
          <TableCell className="text-right tabular-nums">899 ₴</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
);
