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
          keyPrefix: "chat-rate-limit",
          points: 5, // 5 requests...
          duration: 60, // ...per 60 seconds
          blockDuration: 30,
          ttlSet: true,
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
