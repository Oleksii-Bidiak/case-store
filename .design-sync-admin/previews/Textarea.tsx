import { Textarea, Label } from "@store/store-admin";

// Blog / product form long-text fields (dict.blogPostForm, dict.productForm).
export const WithValue = () => (
  <div style={{ display: "grid", gap: 6, width: 420 }}>
    <Label htmlFor="ta-excerpt">Короткий опис</Label>
    <Textarea
      id="ta-excerpt"
      defaultValue="Порівнюємо MagSafe-чохли Spigen, ESR та Apple: що краще тримає магніт, як поводиться після падіння і чи варто переплачувати за оригінал."
    />
  </div>
);

export const Placeholder = () => (
  <div style={{ display: "grid", gap: 6, width: 420 }}>
    <Label htmlFor="ta-desc">Опис</Label>
    <Textarea
      id="ta-desc"
      placeholder="Опишіть товар: для чого він, з чого зроблений, що в комплекті"
    />
  </div>
);

export const Invalid = () => (
  <div style={{ display: "grid", gap: 6, width: 420 }}>
    <Label htmlFor="ta-err">Короткий опис</Label>
    <Textarea id="ta-err" aria-invalid aria-describedby="ta-err-msg" />
    <p id="ta-err-msg" role="alert" className="text-sm text-destructive">
      Додайте короткий опис
    </p>
  </div>
);

export const Disabled = () => (
  <div style={{ display: "grid", gap: 6, width: 420 }}>
    <Label htmlFor="ta-dis">SEO-опис (meta description)</Label>
    <Textarea
      id="ta-dis"
      disabled
      defaultValue="Протиударний чохол з прозорою спинкою та підтримкою MagSafe."
    />
  </div>
);
