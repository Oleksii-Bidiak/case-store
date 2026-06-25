import { Suspense } from "react";
import type { Metadata } from "next";
import { CreateProductGroupView } from "@/widgets";

export const metadata: Metadata = {
  title: "Create Group — Admin",
};

export default function NewProductGroupPage() {
  return (
    <Suspense>
      <CreateProductGroupView />
    </Suspense>
  );
}
