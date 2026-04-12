/**
 * Common utility types shared across all modules.
 */

/** Pagination state for list pages */
export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
}

/** Sort configuration for tables */
export interface SortConfig {
  field: string;
  direction: "asc" | "desc";
}

/** Column definition for DataTable */
export interface ColumnDef {
  key: string;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon?: React.ComponentType<any>;
  sortField?: string;
  sortable?: boolean;
  editable?: boolean;
  width: number;
  minWidth: number;
  sticky?: boolean;
  visible: boolean;
}

/** Filter state for list pages */
export interface FilterState {
  [key: string]: string | string[] | boolean | null;
}

/** Batch action configuration */
export interface BatchAction {
  key: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  handler: (selectedIds: Set<string>) => void | Promise<void>;
}

/** Tables that support soft-delete */
export const SOFT_DELETE_TABLES = [
  "packages",
  "invoices",
  "awbs",
  "courier_groups",
  "warehouse_locations",
  "tags",
  "package_statuses",
] as const;

export type SoftDeleteTable = (typeof SOFT_DELETE_TABLES)[number];

/** Toast notification variant */
export type ToastVariant = "success" | "error" | "warning" | "info";
