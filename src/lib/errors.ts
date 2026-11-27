export class ValidationError extends Error {
  readonly status = 400;
  readonly code = "validation";
}

export class MaintenanceError extends Error {
  readonly status = 503;
  readonly code = "maintenance";

  constructor() {
    super("maintenance");
  }
}
