// Process-global duplicate-registration defense for the canonical Voila Pi package entry point.

const REGISTRATION_LEASE_KEY = Symbol.for("voila.extension.registration-lease.v1");

interface RegistrationLeaseRecord {
  token: symbol;
  packageVersion: string;
  sourceKind: string;
}

export interface RegistrationLease {
  release(): boolean;
}

function currentRecord(): RegistrationLeaseRecord | undefined {
  return Reflect.get(globalThis, REGISTRATION_LEASE_KEY) as RegistrationLeaseRecord | undefined;
}

/**
 * Acquire before any Pi surface is registered. A second live loader is rejected without replacing
 * the first token or exposing either loader's private source path.
 */
export function acquireRegistrationLease(input: {
  packageVersion: string;
  sourceKind: string;
}): RegistrationLease {
  const current = currentRecord();
  if (current) {
    throw new Error(
      `Voila refused a duplicate live extension load: active ${current.sourceKind} ` +
        `(${current.packageVersion}), attempted ${input.sourceKind} (${input.packageVersion}). ` +
        "Remove or disable one Voila loader; copied project-local adapters are unsupported.",
    );
  }

  const token = Symbol("voila-extension-instance");
  const record: RegistrationLeaseRecord = {
    token,
    packageVersion: input.packageVersion,
    sourceKind: input.sourceKind,
  };
  Reflect.set(globalThis, REGISTRATION_LEASE_KEY, record);
  let released = false;

  return {
    release(): boolean {
      if (released) return false;
      released = true;
      const active = currentRecord();
      if (!active || active.token !== token) return false;
      return Reflect.deleteProperty(globalThis, REGISTRATION_LEASE_KEY);
    },
  };
}
