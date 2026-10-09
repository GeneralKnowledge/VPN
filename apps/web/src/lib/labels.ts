export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "sea";

const activityLabels: Record<string, string> = {
  "account.created": "Account created",
  "account.delete": "Account deletion requested",
  "account.deleted": "Account deleted",
  "account.password_reset": "Password reset",
  "account.provision": "VPN access provisioned",
  "account.reactivate": "VPN access reactivated",
  "account.restored": "VPN access restored",
  "account.suspend": "VPN access suspended",
  "account.suspended": "VPN access suspended",
  "account.sync": "VPN account synced",
  "auth.email_verified": "Email verified",
  "auth.login": "Signed in",
  "auth.logout": "Signed out",
  "auth.password_changed": "Password changed",
  "auth.password_reset_requested": "Password reset requested",
  "billing.duplicate_payment": "Duplicate payment detected",
  "billing.payment_failed": "Payment failed",
  "billing.renewed": "Subscription renewed",
  "checkout.completed": "Checkout completed",
  "checkout.started": "Checkout started",
  "config.downloaded": "Configuration downloaded",
  "connection.created": "Connection created",
  "connection.revoked": "Connection removed",
  "device.created": "Device added",
  "device.revoked": "Device removed",
  "subscription.cancel_requested": "Cancellation scheduled",
  "subscription.created": "Subscription started",
  "subscription.resumed": "Subscription resumed",
  "support.ticket_created": "Support ticket opened",
  "vpn.account_deleted": "VPN account deleted",
  "vpn.credentials_reset": "VPN credentials reset",
  "vpn.provisioned": "VPN access provisioned",
};

export function activityLabel(action: string): string {
  if (activityLabels[action]) return activityLabels[action];
  const text = action.replace(/[._]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const subscriptionLabels: Record<string, { label: string; tone: BadgeTone }> = {
  active: { label: "Active", tone: "success" },
  trialing: { label: "Trial", tone: "sea" },
  past_due: { label: "Payment overdue", tone: "danger" },
  cancelling: { label: "Ends soon", tone: "warning" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  expired: { label: "Expired", tone: "neutral" },
  incomplete: { label: "Incomplete", tone: "warning" },
};

export function subscriptionStatus(status: string): { label: string; tone: BadgeTone } {
  return subscriptionLabels[status] ?? { label: status, tone: "neutral" };
}

const invoiceLabels: Record<string, { label: string; tone: BadgeTone }> = {
  paid: { label: "Paid", tone: "success" },
  open: { label: "Open", tone: "warning" },
  void: { label: "Void", tone: "neutral" },
  uncollectible: { label: "Uncollectible", tone: "danger" },
};

export function invoiceStatus(status: string): { label: string; tone: BadgeTone } {
  return invoiceLabels[status] ?? { label: status, tone: "neutral" };
}
