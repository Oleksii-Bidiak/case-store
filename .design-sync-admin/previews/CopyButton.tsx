import { CopyButton } from "@store/store-admin";

// Resting state; «Скопійовано» / «Не вдалося скопіювати» only flash after a click.
export const Default = () => (
  <CopyButton
    value="https://store.example.ua/orders/access/7Qm2xK9pLw"
    label="Скопіювати"
    copiedLabel="Скопійовано"
    failedLabel="Не вдалося скопіювати"
    ariaLabel="Скопіювати посилання на замовлення"
  />
);

// As used on the order card: the customer access link (TASK-484).
export const InOrderAccessCard = () => (
  <section
    className="rounded-md border border-border p-4"
    style={{ display: "flex", flexDirection: "column", gap: 12, width: 440 }}
  >
    <h3 className="text-sm font-semibold text-foreground">
      Посилання для покупця
    </h3>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p className="text-xs font-medium text-foreground">
        Нове посилання створено
      </p>
      <p className="rounded-md bg-muted px-2 py-1.5 font-mono text-xs break-all text-foreground select-all">
        https://store.example.ua/orders/access/7Qm2xK9pLw
      </p>
      <CopyButton
        value="https://store.example.ua/orders/access/7Qm2xK9pLw"
        label="Скопіювати"
        copiedLabel="Скопійовано"
        failedLabel="Не вдалося скопіювати"
        ariaLabel="Скопіювати посилання на замовлення"
      />
      <p className="text-xs font-medium text-warning">
        Скопіюйте посилання зараз — після оновлення сторінки воно більше не
        відобразиться.
      </p>
    </div>
  </section>
);
