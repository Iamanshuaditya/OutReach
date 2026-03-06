import nodemailer, { type Transporter } from "nodemailer";

export type SMTPConfig = {
  inboxId: string;
  host: string;
  port: number;
  secure?: boolean;
  user: string;
  pass: string;
  fromEmail: string;
  fromName?: string;
};

export type TestResult = {
  ok: boolean;
  error?: string;
  code?: string;
};

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  messageId?: string;
  replyTo?: string;
};

export type SendResult = {
  ok: boolean;
  messageId?: string;
  rejected?: string[];
  accepted?: string[];
  classification?: SMTPErrorClass;
  error?: string;
};

export type SMTPErrorClass =
  | "auth"
  | "network"
  | "timeout"
  | "rate_limit"
  | "recipient"
  | "temporary"
  | "unknown";

type TransportCacheEntry = {
  key: string;
  transporter: Transporter;
};

const transporterCache = new Map<string, TransportCacheEntry>();

function isSecure(port: number): boolean {
  return port === 465;
}

function cacheKey(config: SMTPConfig): string {
  return [config.host, config.port, config.user, config.fromEmail].join("|");
}

function classifyError(error: unknown): SMTPErrorClass {
  const message =
    typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message)
      : "";

  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";

  const normalized = `${code} ${message}`.toLowerCase();

  if (
    normalized.includes("auth") ||
    normalized.includes("invalid login") ||
    normalized.includes("535")
  ) {
    return "auth";
  }

  if (
    normalized.includes("timeout") ||
    normalized.includes("etimedout") ||
    normalized.includes("esocket")
  ) {
    return "timeout";
  }

  if (
    normalized.includes("rate") ||
    normalized.includes("quota") ||
    normalized.includes("421")
  ) {
    return "rate_limit";
  }

  if (
    normalized.includes("invalid recipient") ||
    normalized.includes("550") ||
    normalized.includes("553")
  ) {
    return "recipient";
  }

  if (
    normalized.includes("econn") ||
    normalized.includes("enotfound") ||
    normalized.includes("network")
  ) {
    return "network";
  }

  if (
    normalized.includes("temporar") ||
    normalized.includes("4.") ||
    normalized.includes("451")
  ) {
    return "temporary";
  }

  return "unknown";
}

function createTransporter(config: SMTPConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure ?? isSecure(config.port),
    requireTLS: config.port !== 465,
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
}

export function getTransporter(config: SMTPConfig): Transporter {
  const key = cacheKey(config);
  const existing = transporterCache.get(config.inboxId);

  if (existing && existing.key === key) {
    return existing.transporter;
  }

  const transporter = createTransporter(config);
  transporterCache.set(config.inboxId, { key, transporter });
  return transporter;
}

export function clearTransporter(inboxId: string): void {
  const entry = transporterCache.get(inboxId);
  if (entry) {
    entry.transporter.close();
    transporterCache.delete(inboxId);
  }
}

export async function testConnection(config: SMTPConfig): Promise<TestResult> {
  try {
    const transporter = getTransporter(config);
    await transporter.verify();

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "SMTP verification failed",
      code: classifyError(error),
    };
  }
}

export async function sendEmail(
  config: SMTPConfig,
  input: SendEmailInput
): Promise<SendResult> {
  try {
    const transporter = getTransporter(config);

    const info = await transporter.sendMail({
      from: config.fromName
        ? `"${config.fromName}" <${config.fromEmail}>`
        : config.fromEmail,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      headers: input.headers,
      messageId: input.messageId,
      replyTo: input.replyTo,
    });

    return {
      ok: true,
      messageId: info.messageId,
      accepted: info.accepted.map(String),
      rejected: info.rejected.map(String),
    };
  } catch (error) {
    return {
      ok: false,
      classification: classifyError(error),
      error: error instanceof Error ? error.message : "SMTP send failed",
    };
  }
}
