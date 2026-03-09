// Email Verification — Phase 2
// Abstract interface for email verification providers with caching

import pool from "@/lib/db";
import type { EmailVerification } from "./types";

export interface VerificationProvider {
  name: string;
  verifyEmail(email: string): Promise<VerificationResult>;
  verifyBatch(emails: string[]): Promise<VerificationResult[]>;
}

export interface VerificationResult {
  email: string;
  status: "valid" | "invalid" | "catch_all" | "disposable" | "unknown";
  confidence: number;
  mx_found: boolean;
  smtp_check: boolean;
}

// ─── ZeroBounce Adapter ───

export class ZeroBounceProvider implements VerificationProvider {
  name = "zerobounce";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async verifyEmail(email: string): Promise<VerificationResult> {
    const url = `https://api.zerobounce.net/v2/validate?api_key=${encodeURIComponent(this.apiKey)}&email=${encodeURIComponent(email)}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`ZeroBounce API error: ${response.status}`);
    }

    const data = await response.json() as Record<string, unknown>;
    return this.mapResult(email, data);
  }

  async verifyBatch(emails: string[]): Promise<VerificationResult[]> {
    // ZeroBounce batch API requires file upload; for simplicity, process sequentially
    const results: VerificationResult[] = [];
    for (const email of emails) {
      try {
        const result = await this.verifyEmail(email);
        results.push(result);
      } catch {
        results.push({
          email,
          status: "unknown",
          confidence: 0,
          mx_found: false,
          smtp_check: false,
        });
      }
    }
    return results;
  }

  private mapResult(email: string, data: Record<string, unknown>): VerificationResult {
    const zbStatus = String(data.status ?? "").toLowerCase();
    let status: VerificationResult["status"] = "unknown";

    if (zbStatus === "valid") status = "valid";
    else if (zbStatus === "invalid") status = "invalid";
    else if (zbStatus === "catch-all") status = "catch_all";
    else if (zbStatus === "disposable") status = "disposable";

    return {
      email,
      status,
      confidence: status === "valid" ? 95 : status === "catch_all" ? 60 : 0,
      mx_found: data.mx_found === "true" || data.mx_found === true,
      smtp_check: data.smtp_provider != null,
    };
  }
}

// ─── Cache Layer ───

export async function getCachedVerification(
  orgId: string,
  email: string
): Promise<EmailVerification | null> {
  const result = await pool.query(
    `SELECT * FROM email_verifications WHERE org_id = $1 AND email = $2`,
    [orgId, email.toLowerCase()]
  );
  return result.rows.length > 0 ? (result.rows[0] as EmailVerification) : null;
}

export async function cacheVerification(
  orgId: string,
  result: VerificationResult,
  provider: string
): Promise<void> {
  await pool.query(
    `INSERT INTO email_verifications
      (org_id, email, status, provider, confidence, mx_found, smtp_check, verified_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (org_id, email)
     DO UPDATE SET
       status = EXCLUDED.status,
       provider = EXCLUDED.provider,
       confidence = EXCLUDED.confidence,
       mx_found = EXCLUDED.mx_found,
       smtp_check = EXCLUDED.smtp_check,
       verified_at = NOW()`,
    [orgId, result.email.toLowerCase(), result.status, provider, result.confidence, result.mx_found, result.smtp_check]
  );
}

// ─── Batch Verification with Caching ───

export async function verifyEmails(
  orgId: string,
  emails: string[],
  provider: VerificationProvider,
  batchSize = 1000
): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];

  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    const uncached: string[] = [];
    const cached: VerificationResult[] = [];

    // Check cache first
    for (const email of batch) {
      const cachedResult = await getCachedVerification(orgId, email);
      if (cachedResult) {
        cached.push({
          email: cachedResult.email,
          status: cachedResult.status,
          confidence: cachedResult.confidence,
          mx_found: cachedResult.mx_found,
          smtp_check: cachedResult.smtp_check,
        });
      } else {
        uncached.push(email);
      }
    }

    // Verify uncached emails
    if (uncached.length > 0) {
      const freshResults = await provider.verifyBatch(uncached);
      for (const result of freshResults) {
        await cacheVerification(orgId, result, provider.name);
      }
      results.push(...cached, ...freshResults);
    } else {
      results.push(...cached);
    }
  }

  return results;
}

// ─── Score Integration ───

export function verificationScoreBonus(status: VerificationResult["status"]): number {
  switch (status) {
    case "valid": return 20;
    case "catch_all": return 5;
    case "invalid": return -100; // Disqualify
    case "disposable": return -100; // Disqualify
    default: return 0;
  }
}
