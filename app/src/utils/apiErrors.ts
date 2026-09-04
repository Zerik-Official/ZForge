import { t } from "@/locales/i18n";
import type { ApiResult } from "@/types/domains/api";

/**
 * Resolve a human-readable message for an {@link ApiResult}.
 */
export function getApiErrorMessage(result: ApiResult | null | undefined): string | null {
  if (!result) return null;
  if (result.ok) return null;
  if (result.i18n_key) {
    return t(result.i18n_key, result.params as Record<string, string | number> | undefined);
  }
  if (result.code) {
    const fallbackKey = `errors.${result.code
      .toLowerCase()
      .replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase())}`;
    const translated = t(fallbackKey);
    if (translated !== fallbackKey) return translated;
  }
  if (typeof result.error === "string" && result.error.trim().length > 0) {
    return result.error;
  }
  return t("errors.unknown");
}

/**
 * Type guard for a failed {@link ApiResult}.
 */
export function isApiError(result: ApiResult): boolean {
  return !result.ok;
}
