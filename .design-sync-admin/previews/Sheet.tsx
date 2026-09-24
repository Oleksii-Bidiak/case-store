import {
  Badge,
  Separator,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@store/store-admin";
import {
  Award,
  LayoutDashboard,
  Package,
  ShoppingCart,
  Star,
  Tag,
  Users,
  Settings,
} from "lucide-react";

// The admin's only Sheet: widgets/admin-shell/mobile-nav-drawer — side="left",
// w-72, opened by the header burger below lg. Rendered open (cardMode single).
const items = [
  { label: "Панель", icon: LayoutDashboard },
  { label: "Товари", icon: Package, active: true },
  { label: "Категорії", icon: Tag },
  { label: "Бренди", icon: Award },
  { label: "Замовлення", icon: ShoppingCart, badge: 5 },
  { label: "Відгуки", icon: Star, badge: 2 },
];

const linkClass =
  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors";

export const MobileNavDrawer = () => (
  <Sheet open>
    <SheetContent
      side="left"
      className="w-72 overflow-y-auto"
      aria-describedby={undefined}
    >
      <SheetHeader className="h-16 flex-row items-center gap-2">
        <SheetTitle className="flex flex-row items-center gap-2">
          <Package className="size-6 text-primary" aria-hidden="true" />
          <span className="font-display text-lg font-bold tracking-tight text-foreground">
            CaseStore
          </span>
        </SheetTitle>
      </SheetHeader>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {items.map((item) => (
          <a
            key={item.label}
            href="#"
            aria-current={item.active ? "page" : undefined}
            className={
              item.active
                ? `${linkClass} bg-primary text-primary-foreground shadow-card`
                : `${linkClass} text-muted-foreground hover:bg-accent hover:text-accent-foreground`
            }
          >
            <item.icon className="size-4" />
            {item.label}
            {item.badge ? (
              <Badge className="ml-auto">{item.badge}</Badge>
            ) : null}
          </a>
        ))}
      </nav>
      <Separator />
      <nav className="space-y-1 px-3 py-4">
        <a
          href="#"
          className={`${linkClass} text-muted-foreground hover:bg-accent hover:text-accent-foreground`}
        >
          <Users className="size-4" />
          Користувачі
        </a>
        <a
          href="#"
          className={`${linkClass} text-muted-foreground hover:bg-accent hover:text-accent-foreground`}
        >
          <Settings className="size-4" />
          SEO
        </a>
      </nav>
    </SheetContent>
  </Sheet>
);
