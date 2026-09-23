import { PhoneInput, Label } from "@store/store-admin";

// UA phone mask (+380 NN NNN NNNN). The raw value is re-formatted on render.
// Extra <input> props (aria-invalid, disabled) pass straight through at runtime;
// the emitted contract only lists the wrapper's own props, hence the spreads.
const noop = () => {};

export const Filled = () => (
  <div style={{ display: "grid", gap: 6, width: 320 }}>
    <Label htmlFor="ph-filled">Телефон</Label>
    <PhoneInput id="ph-filled" value="380671234567" onChange={noop} />
  </div>
);

export const Partial = () => (
  <div style={{ display: "grid", gap: 6, width: 320 }}>
    <Label htmlFor="ph-partial">Телефон</Label>
    <PhoneInput id="ph-partial" value="+38067" onChange={noop} />
  </div>
);

export const Invalid = () => (
  <div style={{ display: "grid", gap: 6, width: 320 }}>
    <Label htmlFor="ph-inv">Телефон</Label>
    <PhoneInput
      id="ph-inv"
      value="+380 67 12"
      onChange={noop}
      {...{ "aria-invalid": true, "aria-describedby": "ph-inv-err" }}
    />
    <p id="ph-inv-err" role="alert" className="text-sm text-destructive">
      Введіть номер у форматі +380 XX XXX XXXX
    </p>
  </div>
);

export const Disabled = () => (
  <div style={{ display: "grid", gap: 6, width: 320 }}>
    <Label htmlFor="ph-dis">Телефон</Label>
    <PhoneInput
      id="ph-dis"
      value="380931112233"
      onChange={noop}
      {...{ disabled: true }}
    />
  </div>
);
