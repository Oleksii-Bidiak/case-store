import {
  RegistryHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
import { dict } from "@/shared/config";

const d = dict.subscribers;

const SKELETON_ROWS = 5;

/**
 * Loading placeholder (canon 1.7): the header the registry draws, then the
 * table's own columns — the widget owns its header (the export needs the
 * list's filters), so the skeleton carries it too and nothing jumps.
 */
export function AdminSubscriberTableSkeleton() {
  const columns: Array<{ label: string; hideOnMobile?: boolean }> = [
    { label: d.colEmail },
    { label: d.colStatus },
    { label: d.colSource, hideOnMobile: true },
    { label: d.colDate, hideOnMobile: true },
    { label: d.colUnsubscribed, hideOnMobile: true },
  ];

  return (
    <div className="flex flex-col gap-4">
      <RegistryHeader title={d.heading} description={d.intro} />
      <div className="overflow-hidden rounded-lg border border-border shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  key={column.label}
                  hideOnMobile={column.hideOnMobile}
                >
                  {column.label}
                </TableHead>
              ))}
              <TableHead className="w-11">
                <span className="sr-only">{dict.common.actions}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
              <TableRow key={index}>
                {columns.map((column) => (
                  <TableCell
                    key={column.label}
                    hideOnMobile={column.hideOnMobile}
                  >
                    <div className="h-4 w-full max-w-32 animate-pulse rounded bg-muted" />
                  </TableCell>
                ))}
                <TableCell />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
