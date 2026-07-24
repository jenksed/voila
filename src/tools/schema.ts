// Tool schema helpers. Uses typebox (the schema library Pi's registerTool expects).

import { Type } from "typebox";
import type { TSchema } from "typebox";

/**
 * Produce a `{ type: "string", enum: [...] }` schema. This is the provider-portable form for string
 * enums (equivalent to Pi's StringEnum) without importing @earendil-works/pi-ai.
 */
export function StringEnum<T extends string>(values: readonly T[], description?: string): TSchema {
  return Type.Unsafe<T>({
    type: "string",
    enum: [...values],
    ...(description ? { description } : {}),
  });
}
