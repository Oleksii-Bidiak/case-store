import { Combobox } from "@store/store-client";

// Combobox is a controlled autocomplete; its list opens on focus/typing
// (interaction-driven), so these cards show the representative input states.
const branches = [
  { value: "kyiv-1", label: "Kyiv — Branch #1", description: "вул. Хрещатик, 22" },
  { value: "lviv-3", label: "Lviv — Branch #3", description: "пл. Ринок, 1" },
];

export const WithValue = () => (
  <div style={{ width: 320 }}>
    <Combobox
      value="Kyiv"
      options={branches}
      onInputChange={() => {}}
      onSelect={() => {}}
      placeholder="City or branch"
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
      placeholder="Search city or branch…"
    />
  </div>
);
