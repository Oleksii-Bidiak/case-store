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

const g = dict.productGroups;

const SKELETON_ROWS = 5;

/**
 * Loading placeholder for `/product-groups` (canon 1.7, ProductGroupsProposal
 * ГТ10): the real heading and intro, the search as a block, then rows shaped
 * like the registry's — name, axis badges, positions, status, «⋯».
 */
export function AdminProductGroupTableSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {g.heading}
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">{g.intro}</p>
        </div>
        <Skeleton className="h-9 w-40" />
      </div>
      <Skeleton className="h-10 w-full md:max-w-90" />

      <div className="overflow-hidden rounded-lg border shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{g.colName}</TableHead>
              <TableHead hideOnMobile>{g.colAxes}</TableHead>
              <TableHead hideOnMobile className="text-right">
                {g.colPositions}
              </TableHead>
              <TableHead hideOnMobile>{g.colStatus}</TableHead>
              <TableHead className="w-11">
                <span className="sr-only">{dict.common.actions}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Skeleton className="h-4 w-56 max-w-full" />
                </TableCell>
                <TableCell hideOnMobile>
                  <Skeleton className="h-5 w-24 rounded-full" />
                </TableCell>
                <TableCell hideOnMobile>
                  <Skeleton className="ml-auto h-4 w-6" />
                </TableCell>
                <TableCell hideOnMobile>
                  <Skeleton className="h-5 w-20 rounded-full" />
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
