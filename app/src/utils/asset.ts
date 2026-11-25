/**
 * Helpers to turn a stored asset path into a URL the webview can render.
 */

import { convertFileSrc } from "@tauri-apps/api/core";

/** Prefix of the references to files in the downloaded resources folder. */
const RESOURCE_PREFIX = "resource:";

/** Folder of the downloaded resources, known once {@link setResourcesDir} runs at startup. */
let resourcesDir: string | null = null;

/**
 * Remember where the downloaded resources live, so `resource:` references can be shown.
 * @param dir Absolute path of `<app data>/resources`.
 */
export function setResourcesDir(dir: string): void {
  resourcesDir = dir.replace(/[\\/]+$/, "");
}

/**
 * URL of a file in the downloaded resources folder.
 * @param path Path inside the folder, with forward slashes, such as `videos/wow-classic-portal.mp4`.
 * @returns The URL, or an empty string before the folder is known.
 */
export function resourceSrc(path: string): string {
  if (!resourcesDir) return "";
  return convertFileSrc(`${resourcesDir}/${path}`);
}

/**
 * Normalise a stored asset reference into a loadable URL.
 *
 * Bundled assets are relative web URLs (`/assets/...`) served with the frontend, so they
 * are returned unchanged. `resource:` references point to the media downloaded on boot,
 * and custom assets copied into the app-data folder are absolute filesystem paths; both
 * are served through Tauri's asset protocol.
 *
 * @param path Stored asset reference.
 * @returns A URL usable as an `<img>` / `<video>` source.
 */
export function toDisplaySrc(path: string): string {
  if (!path) return "";
  if (path.startsWith(RESOURCE_PREFIX)) return resourceSrc(path.slice(RESOURCE_PREFIX.length));
  if (/^(https?:|data:|blob:|asset:)/i.test(path)) return path;
  if (/^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("\\\\")) return convertFileSrc(path);
  return path;
}
