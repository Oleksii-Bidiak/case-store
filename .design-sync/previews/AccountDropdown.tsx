import { AccountDropdown, AccountDropdownItem } from "@store/store-client";

const avatar: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  borderRadius: 9999,
  background: "var(--color-primary)",
  color: "var(--color-primary-foreground)",
  fontSize: 12,
  fontWeight: 600,
};

// The panel opens on click (internal state, interaction-driven) — this card
// shows the avatar trigger button. See AccountDropdownItem for the open menu.
export const Trigger = () => (
  <AccountDropdown
    triggerContent={<span style={avatar}>ОБ</span>}
    triggerAria="Account menu"
    menuAria="Account"
  >
    <AccountDropdownItem href="/account">My account</AccountDropdownItem>
    <AccountDropdownItem href="/orders">My orders</AccountDropdownItem>
    <AccountDropdownItem onClick={() => {}}>Sign out</AccountDropdownItem>
  </AccountDropdown>
);
