import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
};

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    emailVerifiedAt: integer("email_verified_at", { mode: "timestamp_ms" }),
    passwordHash: text("password_hash").notNull(),
    name: text("name"),
    role: text("role", { enum: ["customer", "admin"] }).notNull().default("customer"),
    lifecycle: text("lifecycle", {
      enum: [
        "lead",
        "customer",
        "subscribed",
        "vpn_provisioned",
        "active",
        "grace_period",
        "suspended",
        "cancelled",
      ],
    })
      .notNull()
      .default("customer"),
    referralCode: text("referral_code").notNull(),
    referredByUserId: text("referred_by_user_id"),
    /** Last location the customer used for Quick Connect / config download. */
    preferredLocationId: text("preferred_location_id"),
    /** When set, the dashboard onboarding checklist stays hidden. */
    onboardingDismissedAt: integer("onboarding_dismissed_at", { mode: "timestamp_ms" }),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("users_email_uidx").on(t.email),
    uniqueIndex("users_referral_uidx").on(t.referralCode),
    index("users_role_idx").on(t.role),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    ...timestamps,
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const verificationTokens = sqliteTable(
  "verification_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["email_verify", "password_reset"] }).notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("verification_token_hash_uidx").on(t.tokenHash),
    index("verification_user_idx").on(t.userId),
  ],
);

export const plans = sqliteTable("plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  price: integer("price").notNull(),
  currency: text("currency").notNull().default("GBP"),
  billingInterval: text("billing_interval", { enum: ["month", "year"] }).notNull(),
  featuresJson: text("features_json").notNull(),
  maxDevices: integer("max_devices").notNull().default(5),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id),
    status: text("status", {
      enum: ["trialing", "active", "past_due", "cancelling", "cancelled", "expired", "incomplete"],
    }).notNull(),
    provider: text("provider", { enum: ["mock", "stripe"] }).notNull(),
    providerSubscriptionId: text("provider_subscription_id"),
    currentPeriodEnd: integer("current_period_end", { mode: "timestamp_ms" }),
    cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("subscriptions_user_idx").on(t.userId),
    index("subscriptions_status_idx").on(t.status),
    // At most one live subscription per user, enforced by the database so concurrent
    // webhook/checkout deliveries cannot create duplicates.
    uniqueIndex("subscriptions_live_user_uidx")
      .on(t.userId)
      .where(sql`status in ('active', 'trialing', 'cancelling', 'past_due')`),
  ],
);

export const vpnAccounts = sqliteTable(
  "vpn_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    username: text("username").notNull(),
    status: text("status", {
      enum: ["pending", "active", "disabled", "expired", "error"],
    }).notNull(),
    /** Structured JSON diagnostics for admins — never show raw to customers */
    lastError: text("last_error"),
    provisionAttempts: integer("provision_attempts").notNull().default(0),
    lastReconciledAt: integer("last_reconciled_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("vpn_accounts_user_uidx").on(t.userId),
    uniqueIndex("vpn_accounts_provider_uidx").on(t.providerAccountId),
  ],
);

export const vpnLocations = sqliteTable(
  "vpn_locations",
  {
    id: text("id").primaryKey(),
    providerId: text("provider_id").notNull(),
    country: text("country").notNull(),
    countryCode: text("country_code").notNull(),
    city: text("city").notNull(),
    region: text("region"),
    hostname: text("hostname").notNull(),
    status: text("status", { enum: ["online", "maintenance", "offline"] }).notNull(),
    protocolSupportJson: text("protocol_support_json").notNull(),
    latency: integer("latency"),
    load: integer("load"),
    /** Approximate map position (city centre or country centroid). */
    latitude: real("latitude"),
    longitude: real("longitude"),
    isFixture: integer("is_fixture", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("vpn_locations_country_idx").on(t.countryCode),
    uniqueIndex("vpn_locations_provider_uidx").on(t.providerId),
  ],
);

export const vpnConnections = sqliteTable(
  "vpn_connections",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    vpnAccountId: text("vpn_account_id")
      .notNull()
      .references(() => vpnAccounts.id, { onDelete: "cascade" }),
    locationId: text("location_id")
      .notNull()
      .references(() => vpnLocations.id),
    providerConnectionId: text("provider_connection_id"),
    name: text("name").notNull(),
    protocol: text("protocol", { enum: ["wireguard", "openvpn", "vless"] }).notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (t) => [
    index("vpn_connections_user_idx").on(t.userId),
    index("vpn_connections_account_idx").on(t.vpnAccountId),
  ],
);

export const devices = sqliteTable(
  "devices",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    connectionId: text("connection_id").references(() => vpnConnections.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    platform: text("platform", {
      enum: ["windows", "macos", "linux", "ios", "android", "other"],
    }).notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (t) => [index("devices_user_idx").on(t.userId)],
);

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subscriptionId: text("subscription_id").references(() => subscriptions.id),
    provider: text("provider").notNull(),
    providerPaymentId: text("provider_payment_id"),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull().default("GBP"),
    status: text("status", {
      enum: ["pending", "succeeded", "failed", "refunded"],
    }).notNull(),
    ...timestamps,
  },
  (t) => [index("payments_user_idx").on(t.userId)],
);

export const invoices = sqliteTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subscriptionId: text("subscription_id").references(() => subscriptions.id),
    providerInvoiceId: text("provider_invoice_id"),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull().default("GBP"),
    status: text("status", {
      enum: ["paid", "open", "void", "uncollectible"],
    }).notNull(),
    pdfUrl: text("pdf_url"),
    ...timestamps,
  },
  (t) => [index("invoices_user_idx").on(t.userId)],
);

export const supportTickets = sqliteTable(
  "support_tickets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    status: text("status", {
      enum: ["open", "pending", "resolved", "closed"],
    })
      .notNull()
      .default("open"),
    assigneeId: text("assignee_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("support_tickets_user_idx").on(t.userId),
    index("support_tickets_status_idx").on(t.status),
  ],
);

export const supportMessages = sqliteTable(
  "support_messages",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    isStaff: integer("is_staff", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (t) => [index("support_messages_ticket_idx").on(t.ticketId)],
);

export const referrals = sqliteTable(
  "referrals",
  {
    id: text("id").primaryKey(),
    referrerUserId: text("referrer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    referredUserId: text("referred_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["pending", "converted", "rewarded", "invalid"],
    })
      .notNull()
      .default("pending"),
    rewardJson: text("reward_json"),
    convertedAt: integer("converted_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("referrals_referred_uidx").on(t.referredUserId),
    index("referrals_referrer_idx").on(t.referrerUserId),
  ],
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id"),
    actorType: text("actor_type", {
      enum: ["user", "admin", "system", "webhook"],
    }).notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    metadataJson: text("metadata_json"),
    correlationId: text("correlation_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
  },
  (t) => [
    index("audit_events_actor_idx").on(t.actorId),
    index("audit_events_target_idx").on(t.targetType, t.targetId),
    index("audit_events_created_idx").on(t.createdAt),
  ],
);

export const webhookEvents = sqliteTable(
  "webhook_events",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    payloadJson: text("payload_json").notNull(),
    signatureValid: integer("signature_valid", { mode: "boolean" }).notNull(),
    processedAt: integer("processed_at", { mode: "timestamp_ms" }),
    processingError: text("processing_error"),
    ...timestamps,
  },
  (t) => [uniqueIndex("webhook_events_provider_event_uidx").on(t.provider, t.eventId)],
);

export const providerEvents = sqliteTable(
  "provider_events",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    direction: text("direction", { enum: ["outbound", "inbound"] }).notNull(),
    action: text("action").notNull(),
    status: text("status", { enum: ["success", "error", "retry"] }).notNull(),
    targetId: text("target_id"),
    metadataJson: text("metadata_json"),
    correlationId: text("correlation_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
  },
  (t) => [index("provider_events_created_idx").on(t.createdAt)],
);

export const checkoutSessions = sqliteTable(
  "checkout_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id),
    providerSessionId: text("provider_session_id").notNull(),
    status: text("status", { enum: ["open", "complete", "expired"] }).notNull(),
    idempotencyKey: text("idempotency_key"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("checkout_provider_session_uidx").on(t.providerSessionId),
    uniqueIndex("checkout_idempotency_uidx").on(t.idempotencyKey),
    index("checkout_user_idx").on(t.userId),
  ],
);

export const usersRelations = relations(users, ({ many, one }) => ({
  subscriptions: many(subscriptions),
  vpnAccount: one(vpnAccounts),
  devices: many(devices),
  tickets: many(supportTickets),
}));
