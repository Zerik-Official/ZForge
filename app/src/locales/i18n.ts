import { useSyncExternalStore } from "react";
import en from "./en.json";
import es from "./es.json";

export type Locale = "en" | "es";

export const SUPPORTED_LOCALES: readonly Locale[] = ["en", "es"] as const;
export const DEFAULT_LOCALE: Locale = "es";

const dictionaries: Record<Locale, Record<string, unknown>> = {
  en: en as unknown as Record<string, unknown>,
  es: es as unknown as Record<string, unknown>,
};

let currentLocale: Locale = DEFAULT_LOCALE;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * Return the currently active locale.
 */
export function getLocale(): Locale {
  return currentLocale;
}

/**
 * Change the active locale and notify all subscribers.
 *
 * @param locale - One of the supported locales (`en` | `es`).
 */
export function setLocale(locale: Locale): void {
  if (!SUPPORTED_LOCALES.includes(locale)) return;
  if (currentLocale === locale) return;
  currentLocale = locale;
  notify();
}

/**
 * Subscribe to locale changes (for useSyncExternalStore).
 */
function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): Locale {
  return currentLocale;
}

function getNested(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}

/**
 * Translate a dotted key using the current locale dictionary.
 *
 * Supports optional variable interpolation: `t("common.hello", { name: "ZForge" })`
 * replaces `{name}` occurrences in the string.
 *
 * Falls back to the key itself when the translation is missing.
 *
 * @param key - Dotted translation key, e.g. `"common.play"`.
 * @param vars - Optional interpolation variables.
 * @returns Translated string.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const dict = dictionaries[currentLocale] ?? dictionaries[DEFAULT_LOCALE];
  let value = getNested(dict, key);

  if (value === undefined && currentLocale !== DEFAULT_LOCALE) {
    value = getNested(dictionaries[DEFAULT_LOCALE], key);
  }

  let result = value ?? key;

  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      result = result.replaceAll(`{${k}}`, String(v));
    }
  }

  return result;
}

/**
 * React hook that subscribes to locale changes.
 *
 * Use this in any component that calls `t()` so it re-renders when the
 * locale changes. Returns the current locale value.
 *
 * @example
 * ```tsx
 * const locale = useLocale();
 * return <p>{t("common.play")}</p>;
 * ```
 */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * React hook that returns the translation function bound to the current locale.
 * Guarantees re-render on locale change.
 *
 * @example
 * ```tsx
 * const { t } = useTranslation();
 * return <span>{t("common.play")}</span>;
 * ```
 */
export function useTranslation(): { t: typeof t; locale: Locale; setLocale: typeof setLocale } {
  const locale = useLocale();
  return { t, locale, setLocale };
}
