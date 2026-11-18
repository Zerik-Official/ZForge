/** Whether an installed SDK version (`v2.2.0`, `2.10`…) is at least `major.minor`. */
export function sdkVersionAtLeast(version: string | null | undefined, major: number, minor: number): boolean {
  if (!version) return false;
  const [installedMajor = 0, installedMinor = 0] = version
    .replace(/^v/i, "")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
  return installedMajor > major || (installedMajor === major && installedMinor >= minor);
}

/** SDK version needed to log in with an account and start the game hidden. */
export const ACCOUNTS_SDK: [number, number] = [2, 2];
