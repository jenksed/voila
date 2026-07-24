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

/** Canonical state is version 1 and must be migrated explicitly before use. Never auto-migrated. */
export class MigrationRequiredError extends NewfangStateError {
  fromVersion: number;
  toVersion: number;
  constructor(fromVersion: number, toVersion: number) {
    super(
      `NewFang state is schema version ${fromVersion}; version ${toVersion} is required. ` +
        "Run /newfang migrate to inspect and /newfang migrate --apply to migrate.",
    );
    this.name = "MigrationRequiredError";
    this.fromVersion = fromVersion;
    this.toVersion = toVersion;
  }
}

/** Canonical state uses an unknown schema version. Never rewritten. */
export class UnknownSchemaVersionError extends NewfangStateError {
  found: unknown;
  constructor(found: unknown) {
    super(
      `Unknown NewFang schema version: ${String(found)}. This build does not understand it and will not rewrite it.`,
    );
    this.name = "UnknownSchemaVersionError";
    this.found = found;
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
