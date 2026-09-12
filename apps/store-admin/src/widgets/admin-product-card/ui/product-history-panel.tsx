"use client";

import { toAuditEntry, useGetAuditLog } from "@/entities/audit";
import { useAuth } from "@/entities/session";
import {
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
import { formatDateTime } from "@/shared/lib";
import { OPERATIONAL_STALE_MS } from "@/shared/lib/query-freshness";
import { dict } from "@/shared/config";

const d = dict.products;

/** How many log rows a product card shows. The full log lives at /audit-log. */
const HISTORY_LIMIT = 20;

interface ProductHistoryPanelProps {
  productId: string;
}

/**
 * Change history for one product (TASK-427).
 *
 * THE OWNER-ONLY CONSTRAINT, HANDLED RATHER THAN WORKED AROUND. The action log
 * behind this panel is `GET /api/admin/audit-log`, and that route is
 * `@OwnerOnly()` — deliberately NOT a grantable permission
 * (`audit.controller.ts`): the log denormalises actor emails, carries diffs of
 * customer-facing records, and is the record of what staff did, so a manager who
 * could read it could check whether their own actions had been noticed.
 *
 * So this panel does not invent a permission and does not weaken the rule. For a
 * MANAGER it fires NO request at all (`enabled: isOwner`) and renders one line
 * saying whose history it is and why — not an empty table, not a spinner that
 * never resolves, and above all not a 403 turned into an error toast on a page
 * they are otherwise entitled to read.
 *
 * WHY THE FILTER IS `entityId` ALONE, WITH NO `entityType`. The interceptor
 * derives `entityType` from the CONTROLLER class (`product`, `productImage`,
 * `addonService`, …) and `entityId` from the route param naming the thing acted
 * on — which is this product's id for all of them. Filtering by type as well
 * would drop exactly the entries an operator asks about first: "who deleted the
 * photo", "who changed the add-on price". Ids are UUIDs, so there is no
 * cross-entity collision to guard against.
 */
export function ProductHistoryPanel({ productId }: ProductHistoryPanelProps) {
  const { isOwner } = useAuth();

  const { data, isLoading, isError } = useGetAuditLog(
    { entityId: productId, limit: HISTORY_LIMIT },
    { query: { enabled: isOwner, staleTime: OPERATIONAL_STALE_MS } },
  );

  if (!isOwner) {
    return (
      <p className="text-sm text-muted-foreground">{d.historyOwnerOnly}</p>
    );
  }

  if (isLoading) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {d.historyLoadError}
      </p>
    );
  }

  const entries = (data?.data ?? []).map(toAuditEntry);

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{d.historyEmpty}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{d.historyColWhen}</TableHead>
            <TableHead>{d.historyColWho}</TableHead>
            <TableHead>{d.historyColWhat}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {formatDateTime(entry.createdAt)}
              </TableCell>
              <TableCell>
                {entry.actorEmail ??
                  (entry.actorId
                    ? d.historyUnknownActor
                    : dict.auditLog.systemActor)}
              </TableCell>
              <TableCell>
                {/* The raw verb, as the owner's own log screen shows it: the set
                    of actions is not closed, and a half-translated list would
                    quietly render new ones as blanks. */}
                <code className="text-xs">{entry.action}</code>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
