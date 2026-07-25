// Domain-level validation error for project operations. Thrown by pure operations;
// tools rethrow it so Pi reports an actionable tool error.

export class ProjectOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectOperationError";
  }
}
