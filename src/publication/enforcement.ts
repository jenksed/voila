// Static enforcement descriptors for G0 publication tools. Pure data.

import type { OperationEffect } from "../domain/types.ts";
import { ProjectOperationError } from "../domain/errors.ts";

export const PUBLICATION_ENFORCEMENT_OWNERS = [
  "publication_plan_creation",
  "publication_application",
] as const;
export type PublicationEnforcementOwner = (typeof PUBLICATION_ENFORCEMENT_OWNERS)[number];

export interface PublicationToolEnforcementDescriptor {
  readonly tool: string;
  readonly consequential: boolean;
  readonly enforcementOwner: PublicationEnforcementOwner;
  readonly effects: readonly OperationEffect[];
}

export const PUBLICATION_TOOL_ENFORCEMENT = [
  {
    tool: "voila_create_publication_plan",
    consequential: false,
    enforcementOwner: "publication_plan_creation",
    effects: ["local_read", "bounded_temporary_write", "canonical_state_write"],
  },
  {
    tool: "voila_apply_publication_plan",
    consequential: true,
    enforcementOwner: "publication_application",
    effects: [
      "local_read",
      "bounded_temporary_write",
      "repository_source_write",
      "canonical_state_write",
    ],
  },
] as const satisfies readonly PublicationToolEnforcementDescriptor[];

const BY_TOOL = new Map<string, PublicationToolEnforcementDescriptor>(
  PUBLICATION_TOOL_ENFORCEMENT.map((descriptor) => [descriptor.tool, descriptor]),
);

export function publicationToolEnforcementDescriptor(
  tool: string,
): PublicationToolEnforcementDescriptor | undefined {
  return BY_TOOL.get(tool);
}

/** Fail closed when a publication tool is registered without a static enforcement owner. */
export function assertPublicationToolEnforcementDescriptors(toolNames: readonly string[]): void {
  const missing = toolNames.filter((tool) => !BY_TOOL.has(tool));
  if (missing.length > 0) {
    throw new ProjectOperationError(
      `Publication tools lack enforcement descriptors: ${missing.join(", ")}.`,
    );
  }
}
