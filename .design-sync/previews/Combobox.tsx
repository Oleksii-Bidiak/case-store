import { Combobox } from "@store/store-client";

// Combobox is a controlled autocomplete (Nova Poshta city / branch pickers at
// checkout); its list opens on focus/typing (interaction-driven), so these
// cards show the representative input states.
const branches = [
  { value: "kyiv-1", label: "Київ — Відділення №1", description: "вул. Пирогівський шлях, 135" },
  { value: "lviv-3", label: "Львів — Відділення №3", description: "вул. Городоцька, 359" },
];

export const WithValue = () => (
  <div style={{ width: 320 }}>
    <Combobox
      value="Київ"
      options={branches}
      onInputChange={() => {}}
      onSelect={() => {}}
      placeholder="Місто або відділення"
    />
  </div>
);

export const Empty = () => (
  <div style={{ width: 320 }}>
    <Combobox
      value=""
      options={[]}
      onInputChange={() => {}}
      onSelect={() => {}}
      placeholder="Почніть вводити назву міста…"
    />
  </div>
);
