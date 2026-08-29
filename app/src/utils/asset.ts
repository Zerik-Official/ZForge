/**
 * Helpers to turn a stored asset path into a URL the webview can render.
 */

/**
 * Normalise a stored asset reference into a loadable URL.
 *
 * Bundled assets are relative web URLs (`/assets/...`) already served by the
 * dev server / built app from `public/`, so they are returned unchanged.
 * Custom assets copied into the app-data folder are absolute filesystem
 * paths (e.g. `C:\Users\...\ZForge\assets\custom\...`), which the webview
 * needs as `file:///` URLs.
 *
 * @param path Stored asset reference.
 * @returns A URL usable as an `<img>` / `<video>` source.
 */
export function toDisplaySrc(path: string): string {
  if (!path) return "";
  if (/^(https?:|data:|file:|blob:)/i.test(path)) return path;
  if (/^[a-zA-Z]:[\\/]/.test(path)) return `file:///${path.replace(/\\/g, "/")}`;
  return path;
}
