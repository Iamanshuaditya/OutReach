import { randomUUID } from "crypto";

export type ComposeLead = {
  first_name?: string;
  last_name?: string;
  company?: string;
  email: string;
};

export type ComposeInput = {
  queueItemId: string;
  trackingId: string;
  campaignId: string;
  subjectTemplate: string;
  bodyTemplate: string;
  lead: ComposeLead;
  senderName: string;
  senderEmail: string;
  baseUrl: string;
  messageIdDomain?: string;
};

export type ComposeOutput = {
  subject: string;
  html: string;
  text: string;
  messageId: string;
  headers: Record<string, string>;
  unsubscribeUrl: string;
};

const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
const URL_PATTERN = /(https?:\/\/[^\s<>")]+)/gi;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resolveVariables(input: string, lead: ComposeLead): string {
  const replacements: Record<string, string> = {
    first_name: lead.first_name ?? "",
    last_name: lead.last_name ?? "",
    company: lead.company ?? "",
    email: lead.email,
  };

  return input.replace(VARIABLE_PATTERN, (_match, variable) => {
    const key = String(variable).toLowerCase();
    return replacements[key] ?? "";
  });
}

function wrapTrackedLink(url: string, trackingId: string, baseUrl: string): string {
  const encoded = encodeURIComponent(url);
  return `${baseUrl}/api/track/click/${trackingId}?u=${encoded}`;
}

function replaceLinksWithTracking(
  content: string,
  trackingId: string,
  baseUrl: string
): string {
  return content.replace(URL_PATTERN, (url) => wrapTrackedLink(url, trackingId, baseUrl));
}

function toHtmlBody(textBody: string): string {
  return textBody
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}

function messageId(domain: string): string {
  return `<${randomUUID()}@${domain}>`;
}

export function composeEmail(input: ComposeInput): ComposeOutput {
  const subject = resolveVariables(input.subjectTemplate, input.lead).trim();
  const bodyWithVars = resolveVariables(input.bodyTemplate, input.lead).trim();

  const trackedTextBody = replaceLinksWithTracking(
    bodyWithVars,
    input.trackingId,
    input.baseUrl
  );

  const unsubscribeUrl = `${input.baseUrl}/api/unsubscribe/${input.trackingId}`;
  const openPixelUrl = `${input.baseUrl}/api/track/open/${input.trackingId}`;

  const textFooter = `\n\n---\nUnsubscribe: ${unsubscribeUrl}`;
  const text = `${trackedTextBody}${textFooter}`;

  const htmlBody = toHtmlBody(trackedTextBody).replace(
    URL_PATTERN,
    (url) => {
      const tracked = wrapTrackedLink(url, input.trackingId, input.baseUrl);
      return `<a href=\"${tracked}\" target=\"_blank\" rel=\"noopener noreferrer\">${escapeHtml(
        url
      )}</a>`;
    }
  );

  const html = `
<div>
${htmlBody}
<p style="margin-top:24px;font-size:12px;color:#666;">
If you no longer want these emails, <a href="${unsubscribeUrl}">unsubscribe here</a>.
</p>
<img src="${openPixelUrl}" width="1" height="1" alt="" style="display:block;border:0;" />
</div>
`.trim();

  const fromDomain =
    input.messageIdDomain ?? input.senderEmail.split("@")[1] ?? "localhost";

  const generatedMessageId = messageId(fromDomain);

  return {
    subject,
    html,
    text,
    messageId: generatedMessageId,
    unsubscribeUrl,
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      "X-Campaign-Id": input.campaignId,
      "X-Queue-Item-Id": input.queueItemId,
      "X-Tracking-Id": input.trackingId,
    },
  };
}
