import { Suspense } from "react";
import type { Metadata } from "next";
import { CreateProductView } from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.products.metaTitleNew,
};

export default function NewProductPage() {
  return (
    <Suspense>
      <CreateProductView />
    </Suspense>
  );
}
