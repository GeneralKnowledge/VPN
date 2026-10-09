import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./ui";

export type DataTableColumn<T> = {
  key: string;
  header: string;
  className?: string;
  headerClassName?: string;
  cell: (row: T) => ReactNode;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyTitle = "No rows yet",
  emptyDescription,
  className,
  caption,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  className?: string;
  caption?: string;
}) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className={cn("overflow-x-auto rounded-xl border border-border bg-surface", className)}>
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead className="border-b border-border bg-surface-2 text-xs uppercase tracking-wide text-muted">
          <tr>
            {columns.map((col) => (
              <th key={col.key} scope="col" className={cn("px-4 py-3 font-medium", col.headerClassName)}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-border last:border-0 hover:bg-surface-2/60">
              {columns.map((col) => (
                <td key={col.key} className={cn("px-4 py-3 align-middle", col.className)}>
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
