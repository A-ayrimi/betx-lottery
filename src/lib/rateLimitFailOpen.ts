const transientDbErrorCodes = new Set([
  "SELF_SIGNED_CERT_IN_CHAIN",
  "CERT_HAS_EXPIRED",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "08000",
  "08006",
  "57P01",
  "57P02",
  "57P03",
]);

const transientDbErrorMessages = [
  "Connection terminated unexpectedly",
  "Connection ended unexpectedly",
];

export function isTransientDbError(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current = error;
  while (typeof current === "object" && current !== null && !seen.has(current)) {
    seen.add(current);
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && transientDbErrorCodes.has(code.toUpperCase())) return true;
    const message = (current as { message?: unknown }).message;
    if (
      typeof message === "string" &&
      transientDbErrorMessages.some((candidate) => message.includes(candidate))
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export function shouldFailOpenRateLimit(
  error: unknown,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return nodeEnv === "development" && isTransientDbError(error);
}

export function shouldUseDevPreviewFallback(
  error: unknown,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return shouldFailOpenRateLimit(error, nodeEnv);
}
