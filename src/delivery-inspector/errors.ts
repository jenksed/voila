// Typed errors for the delivery inspector. The inspector prefers partial results plus a recorded
// limitation over throwing; it throws only when an invariant of its own output would be violated
// (for example, overlapping suggested commit boundaries) or when its input is unusable.

export class DeliveryInspectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeliveryInspectionError";
  }
}

/** The inspected root is unusable (missing, not a directory, or not a string). */
export class InspectionRootError extends DeliveryInspectionError {
  constructor(message: string) {
    super(message);
    this.name = "InspectionRootError";
  }
}

/** The inspector produced a structure that violates its own contract. Indicates a bug here. */
export class InspectionInvariantError extends DeliveryInspectionError {
  constructor(message: string) {
    super(message);
    this.name = "InspectionInvariantError";
  }
}
