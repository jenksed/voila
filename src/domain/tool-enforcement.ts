// Static enforcement descriptors for the consequential R2A tool surface. This is typed repository
// data, not a user-authored policy language.

import type { OperationEffect } from "./types.ts";
import { ProjectOperationError } from "./errors.ts";

export const ENFORCEMENT_OWNERS = [
  "operation_admission",
  "operation_ownership",
  "tool_local_read",
] as const;
export type EnforcementOwner = (typeof ENFORCEMENT_OWNERS)[number];

export interface R2ToolEnforcementDescriptor {
  tool: string;
  consequential: boolean;
  enforcementOwner: EnforcementOwner;
  effects: readonly OperationEffect[];
}

export const R2_TOOL_ENFORCEMENT = [
  {
    tool: "voila_start_operation",
    consequential: true,
    enforcementOwner: "operation_admission",
    effects: ["local_read", "bounded_temporary_write", "local_process_control"],
  },
  {
    tool: "voila_get_operation",
    consequential: false,
    enforcementOwner: "tool_local_read",
    effects: ["local_read"],
  },
  {
    tool: "voila_read_operation_output",
    consequential: false,
    enforcementOwner: "tool_local_read",
    effects: ["local_read"],
  },
  {
    tool: "voila_cancel_operation",
    consequential: true,
    enforcementOwner: "operation_ownership",
    effects: ["local_process_control"],
  },
] as const satisfies readonly R2ToolEnforcementDescriptor[];

const BY_TOOL = new Map<string, R2ToolEnforcementDescriptor>(
  R2_TOOL_ENFORCEMENT.map((descriptor) => [descriptor.tool, descriptor]),
);

export function r2ToolEnforcementDescriptor(tool: string): R2ToolEnforcementDescriptor | undefined {
  return BY_TOOL.get(tool);
}

/** Fail closed when an R2 tool is registered without a static enforcement owner. */
export function assertR2ToolEnforcementDescriptors(toolNames: readonly string[]): void {
  const missing = toolNames.filter((tool) => !BY_TOOL.has(tool));
  if (missing.length > 0) {
    throw new ProjectOperationError(
      `R2 operation tools lack enforcement descriptors: ${missing.join(", ")}.`,
    );
  }
}
