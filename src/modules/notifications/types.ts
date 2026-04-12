export type NotificationType =
  | "awb_shipped"
  | "awb_arrived"
  | "package_received"
  | "invoice_ready";

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read_at: string | null;
  sent_at: string;
  metadata: Record<string, unknown>;
};
