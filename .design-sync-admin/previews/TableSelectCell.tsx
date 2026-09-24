import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSelectCell,
  TableSelectHead,
} from "@store/store-admin";

// TableSelectCell is a <td>: it only renders inside a Table row. The row
// carries data-state="selected" when its cell is checked; Shift+click reports
// { shiftKey: true } so the table can extend the range.
const reviews = [
  {
    id: "1",
    author: "Олена Коваль",
    text: "Чохол сів ідеально, MagSafe тримає.",
    selected: true,
  },
  {
    id: "2",
    author: "Андрій Мельник",
    text: "Скло поклеїлось без бульбашок.",
    selected: true,
  },
  {
    id: "3",
    author: "Ірина Бондар",
    text: "Доставка затрималась на день.",
    selected: false,
  },
];

export const InList = () => (
  <div style={{ width: 520 }}>
    <Table>
      <TableHeader>
        <TableRow>
          <TableSelectHead
            checked="indeterminate"
            onCheckedChange={() => {}}
            label="Вибрати всі рядки на сторінці"
          />
          <TableHead>Автор</TableHead>
          <TableHead>Відгук</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {reviews.map((r) => (
          <TableRow key={r.id} data-state={r.selected ? "selected" : undefined}>
            <TableSelectCell
              checked={r.selected}
              onSelect={() => {}}
              label={`Вибрати відгук від «${r.author}»`}
            />
            <TableCell className="font-medium">{r.author}</TableCell>
            <TableCell className="text-muted-foreground">{r.text}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

export const Disabled = () => (
  <div style={{ width: 360 }}>
    <Table>
      <TableBody>
        <TableRow>
          <TableSelectCell
            checked={false}
            disabled
            onSelect={() => {}}
            label="Вибрати «Кабель Apple USB-C — Lightning, 1 м»"
          />
          <TableCell className="text-muted-foreground">
            Кабель Apple USB-C — Lightning, 1 м
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
);
