-- Production Postgres migration (mirror of SQLite schema).
-- Apply with your preferred migrator after provisioning DATABASE_URL=postgres://...
-- Column types intentionally stay close to the SQLite Drizzle schema (text + bigint timestamps).

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  email_verified_at BIGINT,
  password_hash TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'customer',
  lifecycle TEXT NOT NULL DEFAULT 'customer',
  referral_code TEXT NOT NULL,
  referred_by_user_id TEXT,
  preferred_location_id TEXT,
  onboarding_dismissed_at BIGINT,
  deleted_at BIGINT,
  created_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_uidx ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS users_referral_uidx ON users(referral_code);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL,
  user_agent TEXT,
  ip_address TEXT,
  created_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS verification_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  used_at BIGINT,
  created_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint)
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
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_subscription_id TEXT,
  current_period_end BIGINT,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);
CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS subscriptions_status_idx ON subscriptions(status);
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_live_user_uidx ON subscriptions(user_id)
  WHERE status IN ('active', 'trialing', 'cancelling', 'past_due');

CREATE TABLE IF NOT EXISTS vpn_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  username TEXT NOT NULL,
  status TEXT NOT NULL,
  last_error TEXT,
  provision_attempts INTEGER NOT NULL DEFAULT 0,
  last_reconciled_at BIGINT,
  created_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint)
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
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  is_fixture BOOLEAN NOT NULL DEFAULT TRUE,
  created_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);
CREATE INDEX IF NOT EXISTS vpn_locations_country_idx ON vpn_locations(country_code);
CREATE UNIQUE INDEX IF NOT EXISTS vpn_locations_provider_uidx ON vpn_locations(provider_id);

ALTER TABLE vpn_locations ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE vpn_locations ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS vpn_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vpn_account_id TEXT NOT NULL REFERENCES vpn_accounts(id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES vpn_locations(id),
  provider_connection_id TEXT,
  name TEXT NOT NULL,
  protocol TEXT NOT NULL,
  last_used_at BIGINT,
  revoked_at BIGINT,
  created_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);
CREATE INDEX IF NOT EXISTS vpn_connections_user_idx ON vpn_connections(user_id);
CREATE INDEX IF NOT EXISTS vpn_connections_account_idx ON vpn_connections(vpn_account_id);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id TEXT REFERENCES vpn_connections(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  last_used_at BIGINT,
  revoked_at BIGINT,
  created_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint)
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
  created_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);
CREATE INDEX IF NOT EXISTS payments_user_idx ON payments(user_id);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id TEXT REFERENCES subscriptions(id),
  provider_invoice_id TEXT,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GBP',
  status TEXT NOT NULL,
  pdf_url TEXT,
  created_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);
CREATE INDEX IF NOT EXISTS invoices_user_idx ON invoices(user_id);

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  assignee_id TEXT REFERENCES users(id),
  created_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);
CREATE INDEX IF NOT EXISTS support_tickets_user_idx ON support_tickets(user_id);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets(status);

CREATE TABLE IF NOT EXISTS support_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  is_staff BOOLEAN NOT NULL DEFAULT FALSE,
  created_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);
CREATE INDEX IF NOT EXISTS support_messages_ticket_idx ON support_messages(ticket_id);

CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  referrer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  reward_json TEXT,
  converted_at BIGINT,
  created_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint)
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
  created_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint)
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
  signature_valid BOOLEAN NOT NULL,
  processed_at BIGINT,
  processing_error TEXT,
  created_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint)
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
  created_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);
CREATE INDEX IF NOT EXISTS provider_events_created_idx ON provider_events(created_at);

CREATE TABLE IF NOT EXISTS checkout_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  provider_session_id TEXT NOT NULL,
  status TEXT NOT NULL,
  idempotency_key TEXT,
  created_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint),
  updated_at BIGINT NOT NULL DEFAULT ((extract(epoch from clock_timestamp()) * 1000)::bigint)
);
CREATE UNIQUE INDEX IF NOT EXISTS checkout_provider_session_uidx ON checkout_sessions(provider_session_id);
CREATE UNIQUE INDEX IF NOT EXISTS checkout_idempotency_uidx ON checkout_sessions(idempotency_key);
CREATE INDEX IF NOT EXISTS checkout_user_idx ON checkout_sessions(user_id);
