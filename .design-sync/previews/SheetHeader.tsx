import { SheetHeader } from "@store/store-client";

// SheetHeader is a plain layout block (not the Radix title), so it renders
// standalone. Title/description here are plain text to avoid the Dialog
// context that SheetTitle/SheetDescription require.
export const Default = () => (
  <div style={{ width: 320, border: "1px solid var(--color-border)", borderRadius: 8 }}>
    <SheetHeader>
      <span style={{ fontWeight: 600 }}>Кошик</span>
      <span style={{ fontSize: 14, color: "var(--color-muted-foreground)" }}>
        2 товари · 1 198 ₴
      </span>
    </SheetHeader>
  </div>
);
