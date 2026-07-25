// `/newfang focus [ID|clear]` — set, clear, or show the focus pointer.

import { loadState, updateState } from "../state/store.ts";
import { setFocusWorkItem } from "../domain/operations.ts";
import { ProjectOperationError } from "../domain/errors.ts";
import { loadErrorResult } from "./loaderror.ts";
import type { CommandResult } from "./types.ts";

export async function runFocus(root: string, arg?: string): Promise<CommandResult> {
  if (!arg) {
    try {
      const state = await loadState(root);
      return {
        level: "info",
        lines: [
          state.focusWorkItemId
            ? `Focus: ${state.focusWorkItemId}`
            : "No focus set. Use /newfang focus <ID> or /newfang focus clear.",
        ],
        state,
      };
    } catch (error) {
      return loadErrorResult(error);
    }
  }

  const target = arg === "clear" ? null : arg;
  try {
    const state = await updateState(root, (cur) => setFocusWorkItem(cur, target), {
      type: target === null ? "focus_cleared" : "focus_set",
      id: target ?? undefined,
    });
    return {
      level: "info",
      lines: [target === null ? "Focus cleared." : `Focus set to ${target}.`],
      state,
    };
  } catch (error) {
    if (error instanceof ProjectOperationError) {
      return { level: "warning", lines: [error.message] };
    }
    return loadErrorResult(error);
  }
}
