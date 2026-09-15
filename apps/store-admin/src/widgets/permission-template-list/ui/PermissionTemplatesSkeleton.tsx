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

const d = dict.staff;

const SKELETON_ROWS = 3;
const COLUMN_COUNT = 4;

/** Loading placeholder matching the template table's columns. */
export function PermissionTemplatesSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-border shadow-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{d.templateColName}</TableHead>
            <TableHead>{d.templateColPermissions}</TableHead>
            <TableHead>{d.templateColUpdated}</TableHead>
            <TableHead className="text-right">{dict.common.actions}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
            <TableRow key={index}>
              {Array.from({ length: COLUMN_COUNT }).map((__, cell) => (
                <TableCell key={cell}>
                  <Skeleton className="h-4 w-full max-w-32" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
