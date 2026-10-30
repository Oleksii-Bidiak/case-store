import { useEffect, useRef } from "react";
import {
  AccountDropdown,
  AccountDropdownItem,
  AccountDropdownSeparator,
} from "@store/store-client";

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

// Since TASK-503 the items are Radix `DropdownMenu.Item`s and render only
// inside the open menu (a separately imported `radix-ui` would be a second
// copy whose Menu context the bundle's items cannot see). AccountDropdown has
// no `open` prop, so the card opens the real one the way a keyboard user does:
// Enter on the trigger, once, after mount.
export const Menu = () => {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const trigger = box.current?.querySelector("button");
    trigger?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  }, []);
  return (
    <div
      ref={box}
      style={{ height: 260, display: "flex", justifyContent: "flex-end" }}
    >
      <AccountDropdown
        triggerContent={<span style={avatar}>ОБ</span>}
        triggerAria="Відкрити меню акаунту"
        menuAria="Меню акаунту"
      >
        <AccountDropdownItem href="/account">Мій акаунт</AccountDropdownItem>
        <AccountDropdownItem href="/orders">
          Історія замовлень
        </AccountDropdownItem>
        <AccountDropdownItem href="/wishlist">Обране</AccountDropdownItem>
        <AccountDropdownSeparator />
        <AccountDropdownItem onClick={() => {}}>Вийти</AccountDropdownItem>
      </AccountDropdown>
    </div>
  );
};
