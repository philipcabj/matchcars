// portal/src/lib/notifications.ts
export interface NotificationItem {
  id: string;
  type: "new_lead" | "pending_offer" | "pending_sale_confirmation" | "checklist_due" | "agency_thread_message";
  title: string;
  subtitle: string;
  href: string;
  at: string | null;
}
