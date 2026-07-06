import type { Metadata } from "next";
import { DashboardView } from "./dashboard-view";
import { dict } from "@/shared/config/dictionary";

export const metadata: Metadata = {
  title: dict.dashboard.metaTitle,
};

export default function DashboardPage() {
  return <DashboardView />;
}
