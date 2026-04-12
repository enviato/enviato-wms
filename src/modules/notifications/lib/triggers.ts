/**
 * Notification utilities
 *
 * Creates in-app notifications when lifecycle events occur.
 * Respects the org's notification settings (which event types are enabled).
 */

import { createClient } from "@/lib/supabase";
import type { NotificationType } from "../types";

/* Map org settings keys to notification_type enum values */
const SETTING_TO_TYPE: Record<string, NotificationType> = {
  awbShipped: "awb_shipped",
  awbArrived: "awb_arrived",
  packageReceived: "package_received",
  invoiceReady: "invoice_ready",
};

const TYPE_TO_SETTING: Record<NotificationType, string> = {
  awb_shipped: "awbShipped",
  awb_arrived: "awbArrived",
  package_received: "packageReceived",
  invoice_ready: "invoiceReady",
};

/**
 * Check whether a notification type is enabled in org settings.
 */
async function isTypeEnabled(type: NotificationType): Promise<boolean> {
  const supabase = createClient();
  const settingKey = TYPE_TO_SETTING[type];

  const { data: org } = await supabase
    .from("organizations")
    .select("settings")
    .limit(1)
    .single();

  if (!org?.settings) return true; // default to enabled

  const notifSettings = (org.settings as Record<string, unknown>)
    .notifications as Record<string, boolean> | undefined;

  if (!notifSettings) return true; // no settings saved yet → enabled
  return notifSettings[settingKey] !== false; // enabled unless explicitly false
}

/**
 * Create a notification for one or more users.
 *
 * If the notification type is disabled in org settings, this is a no-op.
 */
export async function createNotification(opts: {
  type: NotificationType;
  title: string;
  body?: string;
  userIds: string[];
  orgId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const enabled = await isTypeEnabled(opts.type);
    if (!enabled) return;

    const supabase = createClient();
    const rows = opts.userIds.map((uid) => ({
      org_id: opts.orgId,
      user_id: uid,
      type: opts.type,
      title: opts.title,
      body: opts.body || null,
      metadata: opts.metadata || {},
      channel: "push" as const,
    }));

    if (rows.length === 0) return;

    await supabase.from("notifications").insert(rows);
  } catch (err) {
    console.error("Failed to create notification:", err);
  }
}

/**
 * Notify a customer that their package was received/checked-in.
 */
export async function notifyPackageReceived(opts: {
  orgId: string;
  customerId: string;
  trackingNumber: string;
  customerName: string;
}): Promise<void> {
  await createNotification({
    type: "package_received",
    title: "Package received",
    body: `Your package ${opts.trackingNumber} has been received at the warehouse.`,
    userIds: [opts.customerId],
    orgId: opts.orgId,
    metadata: { tracking_number: opts.trackingNumber },
  });
}

/**
 * Notify all customers on an AWB that their shipment has shipped.
 */
export async function notifyAwbShipped(opts: {
  orgId: string;
  awbNumber: string;
  customerIds: string[];
}): Promise<void> {
  await createNotification({
    type: "awb_shipped",
    title: "Shipment shipped",
    body: `Shipment ${opts.awbNumber} has been shipped and is now in transit.`,
    userIds: opts.customerIds,
    orgId: opts.orgId,
    metadata: { awb_number: opts.awbNumber },
  });
}

/**
 * Notify all customers on an AWB that shipment has arrived at destination.
 */
export async function notifyAwbArrived(opts: {
  orgId: string;
  awbNumber: string;
  customerIds: string[];
}): Promise<void> {
  await createNotification({
    type: "awb_arrived",
    title: "Shipment arrived",
    body: `Shipment ${opts.awbNumber} has arrived at its destination.`,
    userIds: opts.customerIds,
    orgId: opts.orgId,
    metadata: { awb_number: opts.awbNumber },
  });
}

/**
 * Notify a customer that their invoice is ready.
 */
export async function notifyInvoiceReady(opts: {
  orgId: string;
  customerId: string;
  invoiceNumber: string;
}): Promise<void> {
  await createNotification({
    type: "invoice_ready",
    title: "Invoice ready",
    body: `Invoice ${opts.invoiceNumber} has been generated and is ready for review.`,
    userIds: [opts.customerId],
    orgId: opts.orgId,
    metadata: { invoice_number: opts.invoiceNumber },
  });
}
