"use client";

import Link from "next/link";
import { LayoutPanelTopIcon } from "lucide-react";
import {
  carouselHomePlacements,
  describeHomePlacement,
  useAdminHomeBlockControllerFindAll,
} from "@/entities/home-block";
import { useAuth } from "@/entities/session";
import { PERM } from "@/entities/permission";
import { Callout } from "@/shared/ui";
import { dict } from "@/shared/config";

const f = dict.carouselForm;

/**
 * «На головній» on the carousel form (plan 186, TASK-664 — mockup ДН-4.13). The
 * former «Місце на головній» field is gone with `Carousel.placement`: this row
 * only SAYS where the carousel stands, read from the homepage blocks, and sends
 * the operator to «Головна» to change it.
 *
 * `carouselId` is absent for a new carousel — it stands nowhere yet. Without a
 * home key (or while the blocks load / failed) the row says only that the place
 * is decided on «Головна»: an unknown is never drawn as «ні».
 */
export function CarouselHomeRow({ carouselId }: { carouselId?: string }) {
  const { can } = useAuth();
  const canReadHome = can(PERM.homeRead) || can(PERM.homeWrite);
  const blocks = useAdminHomeBlockControllerFindAll({
    query: { enabled: canReadHome && carouselId !== undefined },
  });

  const placements = !carouselId
    ? []
    : blocks.data
      ? carouselHomePlacements(blocks.data.data, carouselId)
      : undefined;

  return (
    <Callout
      icon={
        <LayoutPanelTopIcon
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        />
      }
    >
      {canReadHome && placements !== undefined ? (
        <p>
          <span className="font-semibold">{f.homeLabel}</span>{" "}
          {placements.length > 0
            ? placements
                .map((placement) => {
                  const { where, position, hidden } =
                    describeHomePlacement(placement);
                  return `${where} (${hidden ? `${position} · ${hidden}` : position})`;
                })
                .join("; ")
            : `${f.homeNone}. ${f.homeNoneHint}`}
        </p>
      ) : null}
      {canReadHome ? (
        <Link
          href="/home"
          className="inline-block rounded-xs font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {f.homeManage}
          <span aria-hidden="true"> →</span>
        </Link>
      ) : null}
      <p className="text-xs text-muted-foreground">{f.homeFieldGone}</p>
    </Callout>
  );
}
