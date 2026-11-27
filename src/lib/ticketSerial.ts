import { createHash, randomBytes } from "node:crypto";

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function base58Encode(bytes: Uint8Array) {
  const digits = Array.from(bytes);
  let encoded = "";
  while (digits.length > 0) {
    let remainder = 0;
    for (let i = 0; i < digits.length; i += 1) {
      const value = remainder * 256 + digits[i];
      digits[i] = Math.floor(value / 58);
      remainder = value % 58;
    }
    encoded = BASE58[remainder] + encoded;
    while (digits.length > 0 && digits[0] === 0) digits.shift();
  }
  for (const byte of bytes) {
    if (byte === 0) encoded = BASE58[0] + encoded;
    else break;
  }
  return encoded;
}

export function ticketSerialChecksum(roundId: number, randomPart: string) {
  const digest = createHash("sha256").update(`${roundId}:${randomPart}`).digest();
  return BASE58[digest[0] % BASE58.length];
}

export function formatTicketSerial(roundId: number, bytes: Uint8Array) {
  const randomPart = base58Encode(bytes);
  return `BTX-R${roundId}-${randomPart}-${ticketSerialChecksum(roundId, randomPart)}`;
}

export function makeTicketSerial(roundId: number) {
  return formatTicketSerial(roundId, randomBytes(9));
}

export function isTicketSerial(value: unknown): value is string {
  return typeof value === "string" && /^BTX-R\d+-[1-9A-HJ-NP-Za-km-z]{10,}-[1-9A-HJ-NP-Za-km-z]$/.test(value);
}

export function isTicketSerialCollision(error: unknown) {
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as Record<string, unknown>;
    const code = "code" in record ? String(record.code) : "";
    if (code === "23505") {
      const constraint = "constraint" in record ? String(record.constraint) : "";
      const message = "message" in record ? String(record.message) : "";
      if (
        constraint === "tickets_ticket_serial_unique" ||
        constraint === "tickets_serial_unique" ||
        /ticket_serial|tickets_serial_unique|Key \(ticket_serial\)/.test(message)
      ) {
        return true;
      }
    }
    current = "cause" in record ? record.cause : null;
  }
  return false;
}
