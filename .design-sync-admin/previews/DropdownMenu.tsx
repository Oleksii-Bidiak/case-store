import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@store/store-admin";
import { MoreHorizontal } from "lucide-react";

// The category treegrid's per-row «Дії» menu
// (features/category-tree-row-actions) — the keyboard / touch alternative to
// dragging. First sibling, so «Перемістити вгору» is disabled. Rendered open.
export const CategoryRowActions = () => (
  <div
    style={{
      width: 480,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      padding: "8px 12px",
    }}
    className="rounded-md border border-border"
  >
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span className="text-sm font-medium">Чохли для iPhone</span>
      <Badge>Активна</Badge>
    </div>
    <DropdownMenu open modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Дії: „Чохли для iPhone“"
        >
          <MoreHorizontal aria-hidden="true" className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled>Перемістити вгору</DropdownMenuItem>
        <DropdownMenuItem>Перемістити вниз</DropdownMenuItem>
        <DropdownMenuItem>Зробити підкатегорією</DropdownMenuItem>
        <DropdownMenuItem>Підняти на рівень вище</DropdownMenuItem>
        <DropdownMenuItem>Зробити кореневою</DropdownMenuItem>
        <DropdownMenuItem>Перемістити до…</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Редагувати</DropdownMenuItem>
        <DropdownMenuItem>Деактивувати</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);
