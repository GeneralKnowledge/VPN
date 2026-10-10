import { brand } from "@northstar/config";

export type EmailTemplate =
  | "welcome"
  | "verify_email"
  | "password_reset"
  | "subscription_started"
  | "payment_failed"
  | "subscription_cancelled"
  | "vpn_provisioned"
  | "esim_ready"
  | "security_notification"
  | "support_response";

export interface EmailMessage {
  to: string;
  template: EmailTemplate;
  subject: string;
  text: string;
  html: string;
  correlationId?: string;
}

export interface SendEmailInput {
  to: string;
  template: EmailTemplate;
  vars: Record<string, string>;
  correlationId?: string;
}

export interface EmailProvider {
  getProviderStatus(): Promise<{ ok: boolean; provider: string; detail?: string }>;
  send(input: SendEmailInput): Promise<{ id: string }>;
  /** Dev: peek at sent messages */
  getSent?(): EmailMessage[];
}

export function renderTemplate(
  template: EmailTemplate,
  vars: Record<string, string>,
): Omit<EmailMessage, "to" | "template" | "correlationId"> {
  const name = vars.name ?? "there";
  const app = brand.name;
  const link = vars.link ?? vars.actionUrl ?? "#";

  const templates: Record<EmailTemplate, { subject: string; text: string }> = {
    welcome: {
      subject: `Welcome to ${app}`,
      text: `Hi ${name},\n\nWelcome to ${app}. Your account is ready.\n\n— ${app}`,
    },
    verify_email: {
      subject: `Verify your ${app} email`,
      text: `Hi ${name},\n\nPlease verify your email: ${link}\n\nIf you did not create an account, ignore this message.\n\n— ${app}`,
    },
    password_reset: {
      subject: `Reset your ${app} password`,
      text: `Hi ${name},\n\nReset your password: ${link}\n\nThis link expires soon. If you did not request a reset, ignore this message.\n\n— ${app}`,
    },
    subscription_started: {
      subject: `Your ${app} subscription is active`,
      text: `Hi ${name},\n\nYour ${vars.planName ?? "subscription"} is active. Open your dashboard to set up VPN access.\n\n— ${app}`,
    },
    payment_failed: {
      subject: `Payment failed for ${app}`,
      text: `Hi ${name},\n\nWe could not process your latest payment. Please update your billing details: ${link}\n\n— ${app}`,
    },
    subscription_cancelled: {
      subject: `Your ${app} subscription was cancelled`,
      text: `Hi ${name},\n\nYour subscription has been cancelled. You can resubscribe any time from your account.\n\n— ${app}`,
    },
    vpn_provisioned: {
      subject: `VPN access ready — ${app}`,
      text: `Hi ${name},\n\nYour VPN account is provisioned. Choose a location and download a configuration from your dashboard.\n\n— ${app}`,
    },
    esim_ready: {
      subject: `Your eSIM is ready — ${app}`,
      text: `Hi ${name},\n\nYour ${vars.packageName ?? "eSIM"} is ready. Open your dashboard to view the QR code and install steps: ${link}\n\n— ${app}`,
    },
    security_notification: {
      subject: `Security notice — ${app}`,
      text: `Hi ${name},\n\n${vars.message ?? "A security-related change was made on your account."}\n\n— ${app}`,
    },
    support_response: {
      subject: `Support update — ${app}`,
      text: `Hi ${name},\n\nThere is a new reply on your support ticket${vars.ticketId ? ` ${vars.ticketId}` : ""}.\n\n${vars.message ?? ""}\n\n— ${app}`,
    },
  };

  const t = templates[template];
  const html = `<pre style="font-family: system-ui, sans-serif; white-space: pre-wrap;">${escapeHtml(t.text)}</pre>`;
  return { subject: t.subject, text: t.text, html };
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export class MockEmailProvider implements EmailProvider {
  private sent: EmailMessage[] = [];

  async getProviderStatus() {
    return { ok: true, provider: "mock", detail: `Logged ${this.sent.length} emails locally` };
  }

  async send(input: SendEmailInput): Promise<{ id: string }> {
    const rendered = renderTemplate(input.template, input.vars);
    const message: EmailMessage = {
      to: input.to,
      template: input.template,
      ...rendered,
      correlationId: input.correlationId,
    };
    this.sent.push(message);
    const id = `email_mock_${this.sent.length}`;
    // Structured local log — never includes secrets beyond recipient/template
    console.info("[email:mock]", {
      id,
      to: message.to,
      template: message.template,
      subject: message.subject,
      correlationId: message.correlationId,
    });
    return { id };
  }

  getSent() {
    return [...this.sent];
  }
}

export class SmtpEmailProvider implements EmailProvider {
  constructor(
    private readonly config: {
      host: string;
      port: number;
      user: string;
      pass: string;
      from: string;
    },
  ) {}

  async getProviderStatus() {
    if (!this.config.host) {
      return { ok: false, provider: "smtp", detail: "SMTP_HOST not set" };
    }
    return { ok: true, provider: "smtp", detail: `Configured for ${this.config.host}` };
  }

  async send(input: SendEmailInput): Promise<{ id: string }> {
    if (!this.config.host) {
      throw new Error("SMTP is not configured. Set EMAIL_PROVIDER=mock or provide SMTP_* vars.");
    }
    // Production: integrate nodemailer / Resend / etc. without changing call sites.
    const rendered = renderTemplate(input.template, input.vars);
    console.info("[email:smtp:deferred]", { to: input.to, template: input.template, subject: rendered.subject });
    throw new Error(
      "SMTP transport is configured but the transport driver is not activated yet. Use EMAIL_PROVIDER=mock until SMTP is wired.",
    );
  }
}

export type EmailProviderKind = "mock" | "smtp";

export function createEmailProvider(
  kind: EmailProviderKind,
  options?: {
    host?: string;
    port?: number;
    user?: string;
    pass?: string;
    from?: string;
  },
): EmailProvider {
  if (kind === "mock") return new MockEmailProvider();
  return new SmtpEmailProvider({
    host: options?.host ?? "",
    port: options?.port ?? 587,
    user: options?.user ?? "",
    pass: options?.pass ?? "",
    from: options?.from ?? "noreply@localhost",
  });
}
