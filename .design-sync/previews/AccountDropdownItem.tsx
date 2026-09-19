import { AccountDropdownItem } from "@store/store-client";

// Composed inside a representative menu panel (the same markup AccountDropdown
// renders when open) so the real item styling is visible statically.
const panel: React.CSSProperties = {
  minWidth: 208,
  width: 240,
  padding: 4,
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  background: "var(--color-popover)",
  color: "var(--color-popover-foreground)",
  boxShadow: "var(--shadow-elevated)",
  listStyle: "none",
  margin: 0,
};

export const Menu = () => (
  <ul role="menu" style={panel}>
    <AccountDropdownItem href="/account">Мій акаунт</AccountDropdownItem>
    <AccountDropdownItem href="/orders">Історія замовлень</AccountDropdownItem>
    <AccountDropdownItem href="/wishlist">Обране</AccountDropdownItem>
    <AccountDropdownItem onClick={() => {}}>Вийти</AccountDropdownItem>
    <AccountDropdownItem disabled>Адмін-панель</AccountDropdownItem>
  </ul>
);
