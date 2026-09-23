import { Button } from "@store/store-admin";
import { Plus, Pencil, Trash2, Download } from "lucide-react";

// Admin copy from shared/config/dictionary.ts. Lists use size="sm" outline
// "Редагувати" per row; page headers carry the primary "Додати …" action.
export const Variants = () => (
  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
    <Button>Зберегти</Button>
    <Button variant="secondary">Скасувати</Button>
    <Button variant="outline">Редагувати</Button>
    <Button variant="ghost">Назад до списку</Button>
    <Button variant="destructive">Видалити</Button>
    <Button variant="link">Подивитись на сайті</Button>
  </div>
);

export const Sizes = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
    <Button size="xs">Дрібна</Button>
    <Button size="sm">Мала</Button>
    <Button>Звичайна</Button>
    <Button size="lg">Велика</Button>
  </div>
);

export const WithIcon = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
    <Button>
      <Plus />
      Додати товар
    </Button>
    <Button variant="outline" size="sm">
      <Pencil />
      Редагувати
    </Button>
    <Button variant="outline" size="icon" aria-label="Експорт">
      <Download />
    </Button>
    <Button variant="ghost" size="icon-sm" aria-label="Видалити">
      <Trash2 />
    </Button>
  </div>
);

export const Disabled = () => (
  <div style={{ display: "flex", gap: 12 }}>
    <Button disabled>Збереження…</Button>
    <Button variant="outline" disabled>
      Редагувати
    </Button>
  </div>
);
