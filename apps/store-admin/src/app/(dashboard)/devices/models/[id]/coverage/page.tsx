import { Suspense } from "react";
import type { Metadata } from "next";
import {
  DeviceModelCoverageSkeleton,
  DeviceModelCoverageView,
} from "@/widgets";

import { dict } from "@/shared/config";

// The coverage numbers change with every compat write — never prerender them.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: dict.deviceCoverage.metaTitle,
};

interface DeviceModelCoveragePageProps {
  params: Promise<{ id: string }>;
}

/** `/devices/models/[id]/coverage` — a model's assortment next to its series (TASK-1955). */
export default async function DeviceModelCoveragePage({
  params,
}: DeviceModelCoveragePageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<DeviceModelCoverageSkeleton />}>
      <DeviceModelCoverageView modelId={id} />
    </Suspense>
  );
}
