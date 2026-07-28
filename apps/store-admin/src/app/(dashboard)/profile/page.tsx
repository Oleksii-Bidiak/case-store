import type { Metadata } from "next";
import { AdminProfileView } from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.profile.metaTitle,
};

export default function ProfilePage() {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
        {dict.profile.heading}
      </h2>

      <AdminProfileView />
    </div>
  );
}
