import { z } from "zod";

const providerEnum = z.enum([
  "google",
  "microsoft",
  "smtp",
  "zoho",
  "godaddy",
  "hostinger",
  "other",
]);

const roleEnum = z.enum(["owner", "admin", "member", "viewer"]);

const campaignStatusEnum = z.enum([
  "draft",
  "review",
  "scheduled",
  "active",
  "paused",
  "completed",
  "aborted",
]);

const toneEnum = z.enum(["direct", "friendly", "founder", "formal"]);

const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[A-Za-z]{2,}$/;

export const loginSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

export const domainCreateSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(domainRegex, "Please provide a valid domain"),
  provider: providerEnum,
  smtp_host: z.string().trim().min(1).nullish(),
  smtp_port: z.coerce.number().int().min(1).max(65535).nullish(),
  smtp_user: z.string().trim().min(1).nullish(),
  smtp_pass: z.string().min(1).nullish(),
  imap_host: z.string().trim().min(1).nullish(),
  imap_pass: z.string().min(1).nullish(),
  imap_port: z.coerce.number().int().min(1).max(65535).nullish(),
});

export const domainRecheckSchema = z.object({
  id: z.string().uuid("Domain ID must be a valid UUID"),
});

export const inboxCreateSchema = z.object({
  domain_id: z.string().uuid("domain_id must be a valid UUID"),
  email: z.string().trim().toLowerCase().email("Invalid inbox email"),
  display_name: z.string().trim().max(120).nullish(),
  smtp_user: z.string().trim().min(1).nullish(),
  smtp_pass: z.string().min(1).nullish(),
  daily_limit: z.coerce.number().int().min(1).max(1000).optional(),
});

export const inboxUpdateSchema =
  z
    .object({
      id: z.string().uuid("Inbox ID must be a valid UUID"),
      is_active: z.boolean().optional(),
      daily_limit: z.coerce.number().int().min(1).max(1000).optional(),
      warmup_level: z.enum(["new", "warming", "warm", "hot"]).optional(),
      display_name: z.string().trim().max(120).optional(),
    })
    .refine(
      (value) =>
        value.is_active !== undefined ||
        value.daily_limit !== undefined ||
        value.warmup_level !== undefined ||
        value.display_name !== undefined,
      { message: "Nothing to update" }
    );

export const campaignStepSchema = z
  .object({
    step_number: z.coerce.number().int().min(1),
    type: z.enum(["email", "wait", "condition"]),
    subject_template: z.string().max(300).optional(),
    body_template: z.string().max(10000).optional(),
    ai_personalize: z.boolean().optional(),
    tone: toneEnum.optional(),
    wait_days: z.coerce.number().int().min(0).max(365).optional(),
    condition: z.enum(["replied", "opened", "no_reply"]).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.type === "email" && !value.ai_personalize) {
      if (!value.subject_template || !value.subject_template.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Email step requires subject_template",
          path: ["subject_template"],
        });
      }
      if (!value.body_template || !value.body_template.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Email step requires body_template",
          path: ["body_template"],
        });
      }
    }

    if (value.type === "wait" && value.wait_days === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Wait step requires wait_days",
        path: ["wait_days"],
      });
    }

    if (value.type === "condition" && !value.condition) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Condition step requires condition",
        path: ["condition"],
      });
    }
  });

export const campaignCreateSchema = z.object({
  name: z.string().trim().max(200).optional(),
  status: campaignStatusEnum.optional(),
  send_mode: z.enum(["safe", "moderate", "aggressive"]).optional(),
  lead_source: z.string().trim().max(500).optional().nullable(),
  lead_count: z.coerce.number().int().min(0).max(1_000_000).optional(),
  sender_name: z.string().trim().max(120).optional(),
  sender_company: z.string().trim().max(120).optional(),
  product_description: z.string().trim().max(5000).optional(),
  value_proposition: z.string().trim().max(5000).optional(),
  window_start_hour: z.coerce.number().int().min(0).max(23).optional(),
  window_end_hour: z.coerce.number().int().min(0).max(23).optional(),
  window_timezone: z.string().trim().max(100).optional(),
  window_days: z.array(z.string().trim().min(3).max(3)).max(7).optional(),
  max_per_hour_per_inbox: z.coerce.number().int().min(1).max(1000).optional(),
  min_interval_seconds: z.coerce.number().int().min(1).max(86400).optional(),
  max_interval_seconds: z.coerce.number().int().min(1).max(86400).optional(),
  steps: z.array(campaignStepSchema).min(1).optional(),
  inbox_ids: z.array(z.string().uuid()).min(1).optional(),
  health_check_data: z.unknown().optional(),
});

export const campaignUpdateSchema = z.object({
  id: z.string().uuid("Campaign ID must be a valid UUID"),
  status: campaignStatusEnum.optional(),
  name: z.string().trim().max(200).optional(),
});

export const campaignActivationSchema = z.object({
  id: z.string().uuid("Campaign ID must be a valid UUID"),
  status: z.literal("active"),
});

export const aiEmailGenerationSchema = z.object({
  lead: z.object({
    name: z.string().trim().max(120).optional(),
    title: z.string().trim().max(120).optional(),
    company: z.string().trim().max(150).optional(),
    industry: z.string().trim().max(120).optional(),
    city: z.string().trim().max(120).optional(),
    linkedin_context: z.string().trim().max(2000).optional(),
    company_context: z.string().trim().max(2000).optional(),
  }),
  sender: z.object({
    name: z.string().trim().max(120).optional(),
    company: z.string().trim().max(150).optional(),
    product_description: z.string().trim().max(4000).optional(),
    value_proposition: z.string().trim().max(4000).optional(),
  }),
  tone: toneEnum.optional(),
  step_number: z.coerce.number().int().min(1).max(25).optional(),
  previous_emails: z.array(z.string().max(12000)).max(15).optional(),
});

export const accessCodeCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  role: roleEnum.optional(),
});

export const accessCodePatchSchema = z.object({
  id: z.coerce.number().int().positive(),
  is_active: z.boolean(),
});

export const accessCodeDeleteSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join("; ");
}
