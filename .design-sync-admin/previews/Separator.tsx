import { Separator } from "@store/store-admin";

// Profile section card: heading, separator, section body.
export const Horizontal = () => (
  <section
    className="rounded-md border border-border p-4 shadow-card"
    style={{ display: "flex", flexDirection: "column", gap: 12, width: 420 }}
  >
    <h3 className="text-sm font-semibold text-foreground">Зміна пароля</h3>
    <Separator />
    <p className="text-sm text-muted-foreground">
      Після зміни пароля всі інші сесії буде завершено.
    </p>
  </section>
);

// Vertical divider between inline metadata items.
export const Vertical = () => (
  <div
    className="text-sm text-muted-foreground"
    style={{ display: "flex", alignItems: "center", gap: 12, height: 20 }}
  >
    <span>Артикул SPG-UH-15P</span>
    <Separator orientation="vertical" />
    <span>Spigen</span>
    <Separator orientation="vertical" />
    <span>Чохли</span>
  </div>
);
