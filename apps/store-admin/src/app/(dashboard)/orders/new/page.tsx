import type { Metadata } from "next";
import { OrderCreateView } from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.orders.createMetaTitle,
};

export default function NewOrderPage() {
  return <OrderCreateView />;
}
