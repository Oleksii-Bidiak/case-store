import { Suspense } from "react";
import type { Metadata } from "next";
import { CreateProductView } from "@/widgets";

export const metadata: Metadata = {
  title: "Create Product — Admin",
};

export default function NewProductPage() {
  return (
    <Suspense>
      <CreateProductView />
    </Suspense>
  );
}
