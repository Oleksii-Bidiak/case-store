import { Suspense } from "react";
import type { Metadata } from "next";
import { ContentMapView } from "@/widgets";
import { dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.contentMap.metaTitle,
};

export default function ContentMapPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {dict.contentMap.heading}
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {dict.contentMap.subheading}
        </p>
      </div>

      <Suspense>
        <ContentMapView />
      </Suspense>
    </div>
  );
}
