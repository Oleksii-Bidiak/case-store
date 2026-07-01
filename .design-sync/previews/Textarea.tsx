import { Textarea, Label } from "@store/store-client";

export const Default = () => (
  <div style={{ maxWidth: 360 }}>
    <Textarea placeholder="Leave a note for the courier…" rows={4} />
  </div>
);

export const WithLabel = () => (
  <div style={{ display: "grid", gap: 6, maxWidth: 360 }}>
    <Label htmlFor="msg">Delivery note</Label>
    <Textarea id="msg" rows={4} defaultValue="Please call before delivery." />
  </div>
);

export const Disabled = () => (
  <div style={{ maxWidth: 360 }}>
    <Textarea disabled rows={3} placeholder="Unavailable" />
  </div>
);
