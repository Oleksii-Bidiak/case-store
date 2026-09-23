import { PageSizeSelect } from "@store/store-admin";

// «Рядків»: 20 (default) / 50 / 100 — the API allow-lists limit ≤ 100.
export const Default = () => <PageSizeSelect value={20} />;

export const Hundred = () => <PageSizeSelect value={100} />;

export const Disabled = () => <PageSizeSelect value={50} disabled />;
