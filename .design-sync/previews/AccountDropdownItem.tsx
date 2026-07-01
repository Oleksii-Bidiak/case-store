import { AccountDropdownItem } from "@store/store-client";

// Composed inside a representative menu panel (the same markup AccountDropdown
// renders when open) so the real item styling is visible statically.
const panel: React.CSSProperties = {
  minWidth: 208,
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
    <AccountDropdownItem href="/account">My account</AccountDropdownItem>
    <AccountDropdownItem href="/orders">My orders</AccountDropdownItem>
    <AccountDropdownItem href="/wishlist">Wishlist</AccountDropdownItem>
    <AccountDropdownItem onClick={() => {}}>Sign out</AccountDropdownItem>
    <AccountDropdownItem disabled>Admin panel</AccountDropdownItem>
  </ul>
);
