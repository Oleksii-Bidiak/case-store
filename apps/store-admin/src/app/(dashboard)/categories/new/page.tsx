import { Suspense } from "react";
import type { Metadata } from "next";
import { CreateCategoryView } from "@/widgets";

export const metadata: Metadata = {
  title: "Create Category — Admin",
};

export default function NewCategoryPage() {
  return (
    <Suspense>
      <CreateCategoryView />
    </Suspense>
  );
}
