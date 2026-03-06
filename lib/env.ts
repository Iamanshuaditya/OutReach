import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  AUTH_PASSWORD: z
    .string()
    .min(8, "AUTH_PASSWORD must be at least 8 characters")
    .refine((value) => value.toLowerCase() !== "changeme", {
      message: "AUTH_PASSWORD cannot be 'changeme'",
    }),
  AUTH_ADMIN_EMAIL: z.string().email().default("admin@leadbase.local"),
  DATABASE_HOST: z.string().min(1, "DATABASE_HOST is required"),
  DATABASE_PORT: z.preprocess(
    (value) => value ?? "5432",
    z.coerce
      .number()
      .int("DATABASE_PORT must be an integer")
      .min(1)
      .max(65535)
  ),
  DATABASE_USER: z.string().min(1, "DATABASE_USER is required"),
  DATABASE_PASSWORD: z.string().min(1, "DATABASE_PASSWORD is required"),
  DATABASE_NAME: z.string().min(1, "DATABASE_NAME is required"),
  DATABASE_SSL: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  ENCRYPTION_KEY: z.string().min(1, "ENCRYPTION_KEY is required"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  CRON_SECRET: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("\n");

  throw new Error(`Invalid environment configuration:\n${details}`);
}

export const env = parsed.data;
