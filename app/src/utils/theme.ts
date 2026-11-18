/**
 * Apply a theme to the document: color tokens, fonts and text families.
 */

import type { CSSProperties } from "react";
import type { ThemeFrame, ThemeImage, ThemeManifest } from "@/types/domains/theme";
import { toDisplaySrc } from "./asset";

const appliedProperties = new Set<string>();
const loadedFonts: FontFace[] = [];

function setProperty(name: string, value: string) {
  document.documentElement.style.setProperty(name, value);
  appliedProperties.add(name);
}

function family(name: string): string {
  return `"${name}", system-ui, sans-serif`;
}

/** Replace the applied theme; `null` restores the built-in look. */
export async function applyTheme(theme: ThemeManifest | null): Promise<void> {
  for (const name of appliedProperties) document.documentElement.style.removeProperty(name);
  appliedProperties.clear();
  for (const font of loadedFonts.splice(0)) document.fonts.delete(font);
  if (!theme) return;

  for (const [token, value] of Object.entries(theme.colors)) setProperty(`--${token}`, value);
  await Promise.all(
    theme.fonts.map(async (font) => {
      try {
        const face = new FontFace(font.family, `url("${toDisplaySrc(font.file)}")`);
        await face.load();
        document.fonts.add(face);
        loadedFonts.push(face);
      } catch (error) {
        console.error(`Could not load the theme font ${font.family}`, error);
      }
    }),
  );
  if (theme.typography.body) setProperty("--font-body", family(theme.typography.body));
  if (theme.typography.heading) setProperty("--font-heading", family(theme.typography.heading));
}

/** CSS that draws an image stretched to its box. */
export function imageStyle(image: ThemeImage, width: number, height: number): CSSProperties {
  return {
    width: image.width ?? width,
    height: image.height ?? height,
    backgroundImage: `url("${toDisplaySrc(image.file)}")`,
    backgroundSize: "100% 100%",
    backgroundRepeat: "no-repeat",
  };
}

/** CSS that draws a nine-slice frame around a box. */
export function frameStyle(frame: ThemeFrame): CSSProperties {
  const [top, right, bottom, left] = frame.slice;
  const border = frame.border ?? frame.slice;
  return {
    borderStyle: "solid",
    borderColor: "transparent",
    borderWidth: border.map((width) => `${width}px`).join(" "),
    borderImageSource: `url("${toDisplaySrc(frame.file)}")`,
    borderImageSlice: `${top} ${right} ${bottom} ${left}${frame.fill ? " fill" : ""}`,
    borderImageRepeat: "stretch",
    borderRadius: 0,
    backgroundColor: "transparent",
  };
}
