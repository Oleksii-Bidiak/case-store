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

// TableSelectHead is a <th>: it only renders inside a Table header row.
// Tri-state over the page: none / some (dash) / all.
const Rows = ({ selected }: { selected: boolean[] }) => (
  <TableBody>
    {["Олена Коваль", "Андрій Мельник"].map((name, i) => (
      <TableRow key={name} data-state={selected[i] ? "selected" : undefined}>
        <TableSelectCell checked={selected[i]} onSelect={() => {}} label={`Вибрати «${name}»`} />
        <TableCell>{name}</TableCell>
      </TableRow>
    ))}
  </TableBody>
);

const Demo = ({ checked, selected }: { checked: boolean | "indeterminate"; selected: boolean[] }) => (
  <div style={{ width: 280 }}>
    <Table>
      <TableHeader>
        <TableRow>
          <TableSelectHead checked={checked} onCheckedChange={() => {}} label="Вибрати всі рядки на сторінці" />
          <TableHead>Клієнт</TableHead>
        </TableRow>
      </TableHeader>
      <Rows selected={selected} />
    </Table>
  </div>
);

export const NoneSelected = () => <Demo checked={false} selected={[false, false]} />;
export const SomeSelected = () => <Demo checked="indeterminate" selected={[true, false]} />;
export const AllSelected = () => <Demo checked selected={[true, true]} />;
