import { MaintenanceError } from "./errors.ts";
import { isMaintenanceMode } from "./gameConfig.ts";

export function assertMutationsOpen() {
  if (isMaintenanceMode()) throw new MaintenanceError();
}
