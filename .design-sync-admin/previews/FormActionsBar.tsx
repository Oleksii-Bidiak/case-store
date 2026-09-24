import { Button, FormActionsBar, Input, Label } from "@store/store-admin";

// The submit row at the end of every admin edit form. Below md it turns into a
// sticky, blurred bar pinned to the bottom of <main>; at md+ it is a plain block.

// Most forms (product, brand, blog category…): a single primary submit.
export const SubmitOnly = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16, width: "100%" }}>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Label htmlFor="fab-name">Назва</Label>
      <Input id="fab-name" defaultValue="Чохол Spigen Ultra Hybrid для iPhone 15 Pro" />
    </div>
    <FormActionsBar>
      <Button type="submit">Створити товар</Button>
    </FormActionsBar>
  </div>
);

// Attribute-definition form: right-aligned cancel + submit.
export const WithCancel = () => (
  <div style={{ width: "100%" }}>
    <FormActionsBar className="flex justify-end gap-2">
      <Button type="button" variant="outline">
        Скасувати
      </Button>
      <Button type="submit">Зберегти зміни</Button>
    </FormActionsBar>
  </div>
);

// While the mutation is pending every button is disabled and the submit
// label switches to «Збереження…».
export const Saving = () => (
  <div style={{ width: "100%" }}>
    <FormActionsBar className="flex justify-end gap-2">
      <Button type="button" variant="outline" disabled>
        Скасувати
      </Button>
      <Button type="submit" disabled>
        Збереження…
      </Button>
    </FormActionsBar>
  </div>
);
