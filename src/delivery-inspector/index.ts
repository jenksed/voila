// Public surface of the read-only delivery inspector.
//
// This module is standalone on purpose: it imports nothing from Pi, nothing from Voila canonical
// state (`src/domain`, `src/state`), no tools, no commands, and no UI. The dependency arrow only ever
// points inward: the delivery engine consumes `inspectDelivery`, and the focus capsule
// (`src/context/observe.ts`) consumes the read-only git seam for bounded repository observation.

export { inspectDelivery } from "./inspect.ts";
export type { InspectDeliveryOptions } from "./inspect.ts";

export {
  DeliveryInspectionError,
  InspectionInvariantError,
  InspectionRootError,
} from "./errors.ts";

export {
  ATTENTION_KINDS,
  ATTENTION_SEVERITIES,
  BOUNDARY_KINDS,
  CHANGE_CATEGORIES,
  CHANGE_SCOPES,
  CHANGE_STATUSES,
  DEFAULT_INSPECTION_LIMITS,
  DISCOVERY_BASES,
} from "./types.ts";
export type {
  AttentionKind,
  AttentionSeverity,
  BoundaryKind,
  ChangeCategory,
  ChangeScope,
  ChangeStatus,
  ChangeSummary,
  ChangedFile,
  Confidence,
  DeliveryAttentionItem,
  DeliveryInspection,
  DiscoveredCommand,
  DiscoveryBasis,
  InspectionLimits,
  RepositoryFacts,
  SuggestedCommitBoundary,
} from "./types.ts";

// Seams that exist so tests (and later, a delivery engine) need no real repository.
export { createGitRunner, parseStatusPorcelainV2, READ_ONLY_GIT_SUBCOMMANDS } from "./git.ts";
export type { GitCommandResult, GitRunner, ParsedStatus } from "./git.ts";
export { createMemoryFileSystem, createNodeFileSystem } from "./fs.ts";
export type { InspectionFileSystem } from "./fs.ts";

// Pure analysis pieces, exported for focused testing and reuse.
export { classifyPath, topLevelArea } from "./classify.ts";
export type { Classification } from "./classify.ts";
export { detectAttention } from "./attention.ts";
export { suggestCommitBoundaries } from "./boundaries.ts";
export { discoverVerificationCommands } from "./commands.ts";
export { CREDENTIAL_MARKER_RULES, scanTextForCredentialMarkers } from "./scan.ts";
