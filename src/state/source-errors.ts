import { VoilaStateError } from "./errors.ts";

export class UnsafeSourcePathError extends VoilaStateError {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeSourcePathError";
  }
}

export class SourceNotFoundError extends VoilaStateError {
  constructor(message: string) {
    super(message);
    this.name = "SourceNotFoundError";
  }
}
