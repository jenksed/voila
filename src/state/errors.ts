// Typed, actionable errors for the canonical state store.

export class VoilaStateError extends Error {}

/** No `.voila/project.json` exists. Normal before init. */
export class StateNotFoundError extends VoilaStateError {
  constructor(message: string) {
    super(message);
    this.name = "StateNotFoundError";
  }
}

/** Init refused because canonical state already exists (no destructive overwrite). */
export class StateExistsError extends VoilaStateError {
  constructor(message: string) {
    super(message);
    this.name = "StateExistsError";
  }
}

/** Canonical state is malformed or has invalid/missing fields. */
export class StateValidationError extends VoilaStateError {
  constructor(message: string) {
    super(message);
    this.name = "StateValidationError";
  }
}

/** Canonical state is version 1 and must be migrated explicitly before use. Never auto-migrated. */
export class MigrationRequiredError extends VoilaStateError {
  fromVersion: number;
  toVersion: number;
  constructor(fromVersion: number, toVersion: number) {
    super(
      `Voila state is schema version ${fromVersion}; version ${toVersion} is required. ` +
        "Run /voila migrate to inspect and /voila migrate --apply to migrate.",
    );
    this.name = "MigrationRequiredError";
    this.fromVersion = fromVersion;
    this.toVersion = toVersion;
  }
}

/** Canonical state uses an unknown schema version. Never rewritten. */
export class UnknownSchemaVersionError extends VoilaStateError {
  found: unknown;
  constructor(found: unknown) {
    super(
      `Unknown Voila schema version: ${String(found)}. This build does not understand it and will not rewrite it.`,
    );
    this.name = "UnknownSchemaVersionError";
    this.found = found;
  }
}

/** Canonical state uses a schema version this build does not understand. Never auto-rewritten. */
export class SchemaVersionError extends VoilaStateError {
  found: number;
  expected: number;
  constructor(found: number, expected: number) {
    super(
      `Incompatible Voila schema version: found ${found}, expected ${expected}. ` +
        "This build will not rewrite it; upgrade Voila or migrate the state deliberately.",
    );
    this.name = "SchemaVersionError";
    this.found = found;
    this.expected = expected;
  }
}
