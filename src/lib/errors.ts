export class ValidationError extends Error {
  readonly status = 400;
  readonly code = "validation";
}
