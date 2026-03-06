import type { NextRequest } from "next/server";

export type RateLimitConfig = {
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

type CounterEntry = {
  count: number;
  resetAt: number;
};

const counters = new Map<string, CounterEntry>();
let lastSweep = Date.now();

const SWEEP_INTERVAL_MS = 60_000;

export const RATE_LIMITS = {
  auth: { limit: 5, windowMs: 60_000 },
  apiUser: { limit: 100, windowMs: 60_000 },
  aiGeneration: { limit: 20, windowMs: 60_000 },
  campaignActivation: { limit: 5, windowMs: 10 * 60_000 },
} as const satisfies Record<string, RateLimitConfig>;

function sweepExpired(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) {
    return;
  }

  for (const [key, value] of counters.entries()) {
    if (value.resetAt <= now) {
      counters.delete(key);
    }
  }

  lastSweep = now;
}

export function checkRateLimit(
  key: string,
  config: RateLimitConfig,
  now = Date.now()
): RateLimitResult {
  sweepExpired(now);

  const current = counters.get(key);

  if (!current || current.resetAt <= now) {
    counters.set(key, { count: 1, resetAt: now + config.windowMs });

    return {
      allowed: true,
      limit: config.limit,
      remaining: Math.max(config.limit - 1, 0),
      resetAt: now + config.windowMs,
    };
  }

  current.count += 1;
  counters.set(key, current);

  const allowed = current.count <= config.limit;

  return {
    allowed,
    limit: config.limit,
    remaining: allowed ? config.limit - current.count : 0,
    resetAt: current.resetAt,
  };
}

export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  }

  return request.headers.get("x-real-ip") ?? "unknown";
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };
}
