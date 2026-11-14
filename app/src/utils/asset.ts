/**
 * Helpers to turn a stored asset path into a URL the webview can render.
 */

import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * Normalise a stored asset reference into a loadable URL.
 *
 * Bundled assets are relative web URLs (`/assets/...`) served with the
 * frontend, so they are returned unchanged. Custom assets copied into the
 * app-data folder are absolute filesystem paths, served through Tauri's asset
 * protocol (scope: `$APPDATA/assets/custom/**`).
 *
 * @param path Stored asset reference.
 * @returns A URL usable as an `<img>` / `<video>` source.
 */
export function toDisplaySrc(path: string): string {
  if (!path) return "";
  if (/^(https?:|data:|blob:|asset:)/i.test(path)) return path;
  if (/^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("\\\\")) return convertFileSrc(path);
  return path;
}
