/** Stable, machine-readable error codes returned to the frontend as `{ error: { code, message } }`. */
export const ErrorCode = {
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  NAME_TAKEN: 409,
  ALREADY_HAS_FAMILIAR: 409,
  ALREADY_VISITED_TODAY: 409,
  DORMANT: 409,
  NOT_DORMANT: 409,
  ALREADY_SPOTTED: 409,
  ALREADY_GIFTED: 409,
  ALREADY_MET: 409,
  ALREADY_WALKED: 409,
  WALK_FULL: 409,
  INVALID_CODE: 400,
  NOTHING_TO_WRITE: 400,
  NOT_FRIENDS: 403,
  PAYMENT_REQUIRED: 402,
  INSUFFICIENT_SPARKS: 402,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA: 415,
  RATE_LIMITED: 429,
  COOLDOWN: 429,
  NOT_CONFIGURED: 503,
  UPSTREAM_ZEROG: 502,
  UPSTREAM_UNISWAP: 502,
  UPSTREAM_CHAIN: 502,
  INTERNAL: 500,
} as const;

export type ErrorCode = keyof typeof ErrorCode;

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AppError";
    this.status = ErrorCode[code];
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;
