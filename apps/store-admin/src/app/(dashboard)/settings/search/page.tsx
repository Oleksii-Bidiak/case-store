import type { Metadata } from "next";
import { SearchIndexView } from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.searchIndex.metaTitle,
};

export default function SearchIndexPage() {
  return <SearchIndexView />;
}
