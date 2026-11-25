/**
 * @module utils/presenceImages
 * Local copies of the images Rich Presence sends to Discord as addresses of the assets CDN,
 * so the settings preview still shows them without an internet connection.
 */

import { resourceSrc } from "@/utils/asset";

/** Base address of the assets CDN, as the backend writes it. */
const CDN_BASE_URL = "https://cdn.zerikapi.site/wow-assets/";

/**
 * Local copy of a CDN image, when the launcher keeps one.
 * @param url Address sent to Discord.
 * @returns The local URL, or undefined when there is no copy.
 */
export function localCopy(url: string): string | undefined {
  if (!url.startsWith(CDN_BASE_URL)) return undefined;
  const path = url.slice(CDN_BASE_URL.length);
  if (path.startsWith("loading-screens/")) return resourceSrc(path);
  if (path.startsWith("wow-server-logos/cores/")) return resourceSrc(`cores/${path.split("/").pop()}`);
  if (path.startsWith("wow-server-logos/servers/")) return `/assets/servers/logos/${path.split("/").pop()}`;
  return undefined;
}
