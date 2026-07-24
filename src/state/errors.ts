// Typed, actionable errors for the canonical state store.

export class NewfangStateError extends Error {}

/** No `.newfang/project.json` exists. Normal before init. */
export class StateNotFoundError extends NewfangStateError {
  constructor(message: string) {
    super(message);
    this.name = "StateNotFoundError";
  }
}

/** Init refused because canonical state already exists (no destructive overwrite). */
export class StateExistsError extends NewfangStateError {
  constructor(message: string) {
    super(message);
    this.name = "StateExistsError";
  }
}

/** Canonical state is malformed or has invalid/missing fields. */
export class StateValidationError extends NewfangStateError {
  constructor(message: string) {
    super(message);
    this.name = "StateValidationError";
  }
}

/** Canonical state uses a schema version this build does not understand. Never auto-rewritten. */
export class SchemaVersionError extends NewfangStateError {
  found: number;
  expected: number;
  constructor(found: number, expected: number) {
    super(
      `Incompatible NewFang schema version: found ${found}, expected ${expected}. ` +
        "This build will not rewrite it; upgrade NewFang or migrate the state deliberately.",
    );
    this.name = "SchemaVersionError";
    this.found = found;
    this.expected = expected;
  }
}
