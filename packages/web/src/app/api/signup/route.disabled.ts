import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { RateLimiterDynamo } from "rate-limiter-flexible";

const dynamoClient = new DynamoDB({
  region: process.env.AWS_REGION ?? "eu-central-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  },
});

// RateLimiterDynamo's constructor is callback-based and does real async
// work on first use (checking/creating its own table) — we wrap it in a
// singleton Promise so this setup only ever runs ONCE per server process,
// not on every single request.
let limiterPromise: Promise<RateLimiterDynamo> | null = null;

function getChatRateLimiter(): Promise<RateLimiterDynamo> {
  if (!limiterPromise) {
    limiterPromise = new Promise((resolve, reject) => {
      const rateLimiter = new RateLimiterDynamo(
        {
          storeClient: dynamoClient,
          keyPrefix: "chat-rate-limit", // also used as this limiter's own table name
          points: 5, // 5 requests...
          duration: 60, // ...per 60 seconds
          blockDuration: 30, // if exceeded, block ALL further requests for 30s,
          // rather than just waiting for the window to reset —
          // a real deterrent against rapid retry loops
          ttlSet: true, // skip the DescribeTimeToLive check on init — that
          // check races with the table's own CreateTable call
          // (table starts in "CREATING" state, not immediately
          // describable), causing a ValidationException on first
          // request after a fresh table is auto-created
        },
        (err) => {
          if (err) reject(err);
          else resolve(rateLimiter);
        }
      );
    });

    // If initialization genuinely fails, DON'T cache the failed promise —
    // clear it so the NEXT request gets a fresh attempt, instead of every
    // future request permanently reusing one broken, rejected promise.
    limiterPromise.catch(() => {
      limiterPromise = null;
    });
  }
  return limiterPromise;
}

export interface RateLimitResult {
  allowed: boolean;
  msBeforeNext: number;
}

// Rate limit keyed by userId — matches your existing pattern of always
// deriving identity from the authenticated session, never from client input.
export async function checkChatRateLimit(userId: string): Promise<RateLimitResult> {
  const limiter = await getChatRateLimiter();

  try {
    const res = await limiter.consume(userId, 1);
    return { allowed: true, msBeforeNext: res.msBeforeNext };
  } catch (rejection) {
    // rate-limiter-flexible rejects the promise (rather than throwing)
    // when the limit is exceeded — the rejection value is itself a
    // RateLimiterRes object, carrying msBeforeNext for a Retry-After header
    const msBeforeNext = (rejection as { msBeforeNext?: number })?.msBeforeNext ?? 60000;
    return { allowed: false, msBeforeNext };
  }
}

// --- A SEPARATE limiter instance for signup, keyed by IP (not userId,
// since no user exists yet at this point). Deliberately its own
// RateLimiterDynamo — a different keyPrefix means a DIFFERENT DynamoDB
// table, with its OWN, stricter points/duration, independent of chat's
// limiter entirely. ---

let signupLimiterPromise: Promise<RateLimiterDynamo> | null = null;

function getSignupRateLimiter(): Promise<RateLimiterDynamo> {
  if (!signupLimiterPromise) {
    signupLimiterPromise = new Promise((resolve, reject) => {
      const rateLimiter = new RateLimiterDynamo(
        {
          storeClient: dynamoClient,
          keyPrefix: "signup-rate-limit",
          points: 3, // signup is a higher-value abuse target than chat —
          duration: 3600, // deliberately much stricter: 3 attempts per HOUR, not per minute
          blockDuration: 3600, // and a full hour block once exceeded
          ttlSet: true,
        },
        (err) => {
          if (err) reject(err);
          else resolve(rateLimiter);
        }
      );
    });

    signupLimiterPromise.catch(() => {
      signupLimiterPromise = null;
    });
  }
  return signupLimiterPromise;
}

export async function checkSignupRateLimit(ip: string): Promise<RateLimitResult> {
  const limiter = await getSignupRateLimiter();

  try {
    const res = await limiter.consume(ip, 1);
    return { allowed: true, msBeforeNext: res.msBeforeNext };
  } catch (rejection) {
    const msBeforeNext = (rejection as { msBeforeNext?: number })?.msBeforeNext ?? 3600000;
    return { allowed: false, msBeforeNext };
  }
}
