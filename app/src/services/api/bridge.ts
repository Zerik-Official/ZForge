import { invoke, type InvokeArgs } from "@tauri-apps/api/core";

/** Error returned by every backend command: a stable code plus an English log message. */
export interface ApiError {
  code: string;
  message: string;
  /** Extra data for some codes, such as the problem of an invalid theme. */
  details?: unknown;
}

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ApiError).code === "string" &&
    typeof (value as ApiError).message === "string"
  );
}

/** Error code of a rejected command, or `"unknown"` for unexpected failures. */
export function errorCode(error: unknown): string {
  return isApiError(error) ? error.code : "unknown";
}

/**
 * Call a backend command.
 *
 * Argument keys are camelCase; Tauri maps them to the Rust snake_case parameters.
 * Rejects with an {@link ApiError} when the command fails.
 */
export function call<T>(command: string, args?: InvokeArgs): Promise<T> {
  return invoke<T>(command, args);
}
