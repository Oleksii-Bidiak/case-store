import { Suspense } from "react";
import type { Metadata } from "next";
import { CreateCategoryView } from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.categories.metaTitleNew,
};

export default function NewCategoryPage() {
  return (
    <Suspense>
      <CreateCategoryView />
    </Suspense>
  );
}
