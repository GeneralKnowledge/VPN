import path from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";
import { createDb } from "./client";

const SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT,
  email_verified_at INTEGER,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'customer',
  lifecycle TEXT NOT NULL DEFAULT 'customer',
  referral_code TEXT NOT NULL,
  referred_by_user_id TEXT,
  preferred_location_id TEXT,
  onboarding_dismissed_at INTEGER,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
-- users_username_uidx is created after ALTERS: older databases have no username column yet.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uidx ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS users_referral_uidx ON users(referral_code);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  user_agent TEXT,
  ip_address TEXT,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS verification_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE UNIQUE INDEX IF NOT EXISTS verification_token_hash_uidx ON verification_tokens(token_hash);
CREATE INDEX IF NOT EXISTS verification_user_idx ON verification_tokens(user_id);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GBP',
  billing_interval TEXT NOT NULL,
  features_json TEXT NOT NULL,
  max_devices INTEGER NOT NULL DEFAULT 5,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_subscription_id TEXT,
  current_period_end INTEGER,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  billing_mode TEXT NOT NULL DEFAULT 'subscription',
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions(status);

CREATE TABLE IF NOT EXISTS vpn_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  username TEXT NOT NULL,
  status TEXT NOT NULL,
  last_error TEXT,
  provision_attempts INTEGER NOT NULL DEFAULT 0,
  last_reconciled_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE UNIQUE INDEX IF NOT EXISTS vpn_accounts_user_uidx ON vpn_accounts(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS vpn_accounts_provider_uidx ON vpn_accounts(provider_account_id);

CREATE TABLE IF NOT EXISTS vpn_locations (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  country TEXT NOT NULL,
  country_code TEXT NOT NULL,
  city TEXT NOT NULL,
  region TEXT,
  hostname TEXT NOT NULL,
  status TEXT NOT NULL,
  protocol_support_json TEXT NOT NULL,
  latency INTEGER,
  load INTEGER,
  latitude REAL,
  longitude REAL,
  is_fixture INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX IF NOT EXISTS vpn_locations_country_idx ON vpn_locations(country_code);
CREATE UNIQUE INDEX IF NOT EXISTS vpn_locations_provider_uidx ON vpn_locations(provider_id);

CREATE TABLE IF NOT EXISTS vpn_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vpn_account_id TEXT NOT NULL REFERENCES vpn_accounts(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES vpn_locations(id),
  provider_connection_id TEXT,
  name TEXT NOT NULL,
  protocol TEXT NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX IF NOT EXISTS vpn_connections_user_idx ON vpn_connections(user_id);
CREATE INDEX IF NOT EXISTS vpn_connections_account_idx ON vpn_connections(vpn_account_id);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id TEXT REFERENCES vpn_connections(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX IF NOT EXISTS devices_user_idx ON devices(user_id);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id TEXT REFERENCES subscriptions(id),
  provider TEXT NOT NULL,
  provider_payment_id TEXT,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GBP',
  status TEXT NOT NULL,
  product TEXT NOT NULL DEFAULT 'vpn',
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX IF NOT EXISTS payments_user_idx ON payments(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_uidx ON payments(provider, provider_payment_id);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id TEXT REFERENCES subscriptions(id),
  provider_invoice_id TEXT,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GBP',
  status TEXT NOT NULL,
  pdf_url TEXT,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX IF NOT EXISTS invoices_user_idx ON invoices(user_id);

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  assignee_id TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX IF NOT EXISTS support_tickets_user_idx ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets(status);

CREATE TABLE IF NOT EXISTS support_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  is_staff INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX IF NOT EXISTS support_messages_ticket_idx ON support_messages(ticket_id);

CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  referrer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  reward_json TEXT,
  converted_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE UNIQUE INDEX IF NOT EXISTS referrals_referred_uidx ON referrals(referred_user_id);
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals(referrer_user_id);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  actor_type TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  metadata_json TEXT,
  correlation_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX IF NOT EXISTS audit_events_actor_idx ON audit_events(actor_id);
CREATE INDEX IF NOT EXISTS audit_events_target_idx ON audit_events(target_type, target_id);
CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events(created_at);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  signature_valid INTEGER NOT NULL,
  processed_at INTEGER,
  processing_error TEXT,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE UNIQUE INDEX IF NOT EXISTS webhook_events_provider_event_uidx ON webhook_events(provider, event_id);

CREATE TABLE IF NOT EXISTS provider_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  direction TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  target_id TEXT,
  metadata_json TEXT,
  correlation_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX IF NOT EXISTS provider_events_created_idx ON provider_events(created_at);

CREATE TABLE IF NOT EXISTS checkout_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  provider_session_id TEXT NOT NULL,
  status TEXT NOT NULL,
  idempotency_key TEXT,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE UNIQUE INDEX IF NOT EXISTS checkout_provider_session_uidx ON checkout_sessions(provider_session_id);
CREATE UNIQUE INDEX IF NOT EXISTS checkout_idempotency_uidx ON checkout_sessions(idempotency_key);
CREATE INDEX IF NOT EXISTS checkout_user_idx ON checkout_sessions(user_id);

CREATE TABLE IF NOT EXISTS esim_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_code TEXT NOT NULL,
  package_name TEXT NOT NULL,
  country_code TEXT NOT NULL,
  data_volume TEXT,
  validity TEXT,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GBP',
  status TEXT NOT NULL,
  billing_provider TEXT NOT NULL,
  provider_checkout_id TEXT,
  provider_payment_id TEXT,
  esim_provider TEXT NOT NULL,
  provider_order_id TEXT,
  last_error TEXT,
  issue_attempts INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX IF NOT EXISTS esim_orders_user_idx ON esim_orders(user_id);
CREATE INDEX IF NOT EXISTS esim_orders_status_idx ON esim_orders(status);
CREATE UNIQUE INDEX IF NOT EXISTS esim_orders_checkout_uidx ON esim_orders(provider_checkout_id);
CREATE UNIQUE INDEX IF NOT EXISTS esim_orders_idempotency_uidx ON esim_orders(idempotency_key);
CREATE INDEX IF NOT EXISTS esim_orders_payment_idx ON esim_orders(provider_payment_id);

CREATE TABLE IF NOT EXISTS esim_profiles (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES esim_orders(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  iccid TEXT,
  qr_code_url TEXT,
  activation_url TEXT,
  status TEXT NOT NULL,
  issued_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE UNIQUE INDEX IF NOT EXISTS esim_profiles_order_uidx ON esim_profiles(order_id);
CREATE INDEX IF NOT EXISTS esim_profiles_user_idx ON esim_profiles(user_id);

CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  destination_slug TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX IF NOT EXISTS trips_user_idx ON trips(user_id);
CREATE TABLE IF NOT EXISTS outbound_links (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  category TEXT NOT NULL,
  destination_slug TEXT NOT NULL,
  placement TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
  updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX IF NOT EXISTS outbound_links_partner_idx ON outbound_links(partner_id);
CREATE TABLE IF NOT EXISTS partner_events (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  link_id TEXT NOT NULL,
  partner_id TEXT NOT NULL,
  category TEXT NOT NULL,
  destination_slug TEXT NOT NULL,
  placement TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
);
CREATE INDEX IF NOT EXISTS partner_events_created_idx ON partner_events(created_at);
CREATE INDEX IF NOT EXISTS partner_events_partner_idx ON partner_events(partner_id);
`;

/** Additive migrations for existing SQLite databases */
const ALTERS = [
  `ALTER TABLE vpn_accounts ADD COLUMN last_reconciled_at INTEGER`,
  `ALTER TABLE users ADD COLUMN preferred_location_id TEXT`,
  `ALTER TABLE users ADD COLUMN onboarding_dismissed_at INTEGER`,
  `ALTER TABLE users ADD COLUMN username TEXT`,
  `ALTER TABLE subscriptions ADD COLUMN billing_mode TEXT NOT NULL DEFAULT 'subscription'`,
  `ALTER TABLE sessions ADD COLUMN user_agent TEXT`,
  `ALTER TABLE sessions ADD COLUMN ip_address TEXT`,
  `ALTER TABLE vpn_locations ADD COLUMN latitude REAL`,
  `ALTER TABLE vpn_locations ADD COLUMN longitude REAL`,
  // Which resold product a payment was for (VPN and eSIM are separate businesses' books).
  `ALTER TABLE payments ADD COLUMN product TEXT NOT NULL DEFAULT 'vpn'`,
];

/**
 * Older DBs created users.email as NOT NULL without username. Rebuild once so email can be
 * null (Diamond/Iron) and username is required + unique.
 */
/**
 * A unique username for each user: their own, else their email's local part, else their id. When
 * a name is taken, later users (by creation time) get `<name>_<id>`, then a counter if even that
 * is taken.
 */
export function legacyUsernames(
  rows: ReadonlyArray<{ id: string; username: string | null; email: string | null }>,
): Map<string, string> {
  const base = (r: (typeof rows)[number]) =>
    r.username?.trim() ||
    (r.email ?? "").split("@")[0]!.replace(/\./g, "_").toLowerCase() ||
    r.id;
  // Every base name is reserved, so a generated name never takes one. Users who already chose a
  // username go first, so one derived from an email can't take their login name.
  const taken = new Set(rows.map(base));
  const claimed = new Set<string>();
  const names = new Map<string, string>();
  const chosen = (r: (typeof rows)[number]) => Boolean(r.username?.trim());
  for (const row of [...rows.filter(chosen), ...rows.filter((r) => !chosen(r))]) {
    let name = base(row);
    if (claimed.has(name)) {
      name = `${base(row)}_${row.id}`;
      for (let n = 2; taken.has(name) || claimed.has(name); n++) name = `${base(row)}_${row.id}_${n}`;
    }
    claimed.add(name);
    names.set(row.id, name);
  }
  return names;
}

function rebuildUsersForOptionalEmail(sqlite: Database.Database) {
  const cols = sqlite.prepare(`pragma table_info(users)`).all() as Array<{ name: string; notnull: number }>;
  if (!cols.length) return;
  const email = cols.find((c) => c.name === "email");
  // Already the new shape only when username is NOT NULL: a column the ALTERS just added is
  // nullable (and empty), even on an empty table.
  const username = cols.find((c) => c.name === "username");
  if (username && username.notnull === 1 && email && email.notnull === 0) return;

  // foreign_keys can't change inside a transaction, so switch it off first. The rebuild itself
  // is one transaction: a failure leaves the old table as it was, ready for another try.
  sqlite.exec(`PRAGMA foreign_keys = OFF;`);
  sqlite.exec(`BEGIN`);
  try {
    const rows = sqlite
      .prepare(`SELECT id, ${username ? "username" : "NULL AS username"}, email FROM users ORDER BY created_at, id`)
      .all() as Array<{ id: string; username: string | null; email: string | null }>;
    sqlite.exec(`CREATE TEMP TABLE legacy_usernames (id TEXT PRIMARY KEY, username TEXT NOT NULL)`);
    const add = sqlite.prepare(`INSERT INTO legacy_usernames (id, username) VALUES (?, ?)`);
    for (const [id, name] of legacyUsernames(rows)) add.run(id, name);
    sqlite.exec(`
    CREATE TABLE users_new (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      email TEXT,
      email_verified_at INTEGER,
      password_hash TEXT NOT NULL,
      name TEXT,
      role TEXT NOT NULL DEFAULT 'customer',
      lifecycle TEXT NOT NULL DEFAULT 'customer',
      referral_code TEXT NOT NULL,
      referred_by_user_id TEXT,
      preferred_location_id TEXT,
      onboarding_dismissed_at INTEGER,
      deleted_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
      updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
    );
    INSERT INTO users_new (
      id, username, email, email_verified_at, password_hash, name, role, lifecycle,
      referral_code, referred_by_user_id, preferred_location_id, onboarding_dismissed_at,
      deleted_at, created_at, updated_at
    )
    SELECT
      id,
      (SELECT username FROM legacy_usernames WHERE legacy_usernames.id = users.id),
      email,
      email_verified_at,
      password_hash,
      name,
      role,
      lifecycle,
      referral_code,
      referred_by_user_id,
      preferred_location_id,
      onboarding_dismissed_at,
      deleted_at,
      created_at,
      updated_at
    FROM users;
    DROP TABLE users;
    DROP TABLE temp.legacy_usernames;
    ALTER TABLE users_new RENAME TO users;
    CREATE UNIQUE INDEX IF NOT EXISTS users_username_uidx ON users(username);
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_uidx ON users(email);
    CREATE UNIQUE INDEX IF NOT EXISTS users_referral_uidx ON users(referral_code);
    CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);
  `);
    sqlite.exec(`COMMIT`);
  } catch (err) {
    sqlite.exec(`ROLLBACK`);
    throw err;
  } finally {
    sqlite.exec(`PRAGMA foreign_keys = ON;`);
  }
}

function monorepoRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../..");
}

export function migrate(databaseUrl = process.env.DATABASE_URL ?? "file:./data/northstar.db") {
  process.env.NORTHSTAR_ROOT = process.env.NORTHSTAR_ROOT ?? monorepoRoot();
  if (databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://")) {
    throw new Error(
      "Use packages/db/src/postgres.migrate.sql for Postgres. SQLite migrate() is for local file databases.",
    );
  }
  const { sqlite, filePath, close } = createDb(databaseUrl);
  if (!sqlite || !filePath) throw new Error("SQLite client required for migrate()");
  sqlite.exec(SQL);
  for (const alter of ALTERS) {
    try {
      sqlite.exec(alter);
    } catch {
      // column already exists
    }
  }
  // Payments recorded before the product column existed: eSIM ones are those tied to an eSIM order.
  sqlite.exec(`UPDATE payments SET product = 'esim' WHERE product = 'vpn' AND provider_payment_id IN (SELECT provider_payment_id FROM esim_orders WHERE provider_payment_id IS NOT NULL)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS payments_product_idx ON payments(product)`);
  try {
    rebuildUsersForOptionalEmail(sqlite);
  } catch (err) {
    // The rebuild rolled back. Stop here: carrying on would leave users without usernames.
    console.error(
      "[db] could not rebuild users for optional email / username",
      err instanceof Error ? err.message : err,
    );
    void close();
    throw err;
  }
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS users_username_uidx ON users(username)`);
  try {
    sqlite.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS checkout_idempotency_uidx ON checkout_sessions(idempotency_key)`,
    );
  } catch {
    // ignore
  }
  try {
    sqlite.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_live_user_uidx ON subscriptions(user_id) WHERE status IN ('active', 'trialing', 'cancelling', 'past_due')`,
    );
  } catch (err) {
    console.warn(
      "[db] could not create subscriptions_live_user_uidx — resolve duplicate live subscriptions per user and re-run migrate",
      err instanceof Error ? err.message : err,
    );
  }
  console.info(`[db] migrated ${filePath}`);
  void close();
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect || process.argv[1]?.includes("migrate")) {
  migrate(process.env.DATABASE_URL);
}
