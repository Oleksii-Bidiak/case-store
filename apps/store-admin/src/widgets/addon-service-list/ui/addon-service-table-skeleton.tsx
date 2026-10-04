import {
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
import { dict } from "@/shared/config";

const d = dict.addonServices;

const SKELETON_ROWS = 4;

/**
 * Loading placeholder for `/addon-services` (canon 1.7, AddonServicesProposal
 * ДП10): the real heading and intro, the views and the search as blocks, then
 * rows shaped like the registry's — the name over a description line, the
 * price, the status, «⋯».
 */
export function AddonServiceTableSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {d.heading}
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">{d.intro}</p>
        </div>
        <Skeleton className="h-9 w-44" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-8 w-28 rounded-full" />
        ))}
      </div>
      <Skeleton className="h-10 w-full md:max-w-90" />

      <div className="overflow-hidden rounded-lg border shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{d.colName}</TableHead>
              <TableHead hideOnMobile className="text-right">
                {d.colPrice}
              </TableHead>
              <TableHead hideOnMobile>{d.colStatus}</TableHead>
              <TableHead className="w-11">
                <span className="sr-only">{dict.common.actions}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <TableRow key={index}>
                <TableCell>
                  <div className="flex flex-col gap-2">
                    <Skeleton className="h-4 w-48 max-w-full" />
                    <Skeleton className="h-3 w-72 max-w-full" />
                  </div>
                </TableCell>
                <TableCell hideOnMobile>
                  <Skeleton className="ml-auto h-4 w-12" />
                </TableCell>
                <TableCell hideOnMobile>
                  <Skeleton className="h-5 w-24 rounded-full" />
                </TableCell>
                <TableCell>
                  <Skeleton className="size-6" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
