import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { BootProgress, ResourcesProgress } from "@/types/domains/boot";
import type { SdkDownloadProgress } from "@/types/domains/sdk";
import type { SessionSnapshot } from "@/types/domains/session";

/** Event names emitted by the backend (see `src-tauri/src/events.rs`). */
const EVENTS = {
  bootProgress: "boot://progress",
  resourcesProgress: "resources://progress",
  sdkDownloadProgress: "sdk://download-progress",
  sessionChanged: "session://changed",
  accountsChanged: "accounts://changed",
  capabilitiesChanged: "capabilities://changed",
} as const;

export function onBootProgress(handler: (step: BootProgress) => void): Promise<UnlistenFn> {
  return listen<BootProgress>(EVENTS.bootProgress, (event) => handler(event.payload));
}

export function onResourcesProgress(handler: (progress: ResourcesProgress) => void): Promise<UnlistenFn> {
  return listen<ResourcesProgress>(EVENTS.resourcesProgress, (event) => handler(event.payload));
}

export function onSdkDownloadProgress(handler: (progress: SdkDownloadProgress) => void): Promise<UnlistenFn> {
  return listen<SdkDownloadProgress>(EVENTS.sdkDownloadProgress, (event) => handler(event.payload));
}

export function onSessionChanged(handler: (session: SessionSnapshot) => void): Promise<UnlistenFn> {
  return listen<SessionSnapshot>(EVENTS.sessionChanged, (event) => handler(event.payload));
}

export function onCapabilitiesChanged(handler: () => void): Promise<UnlistenFn> {
  return listen(EVENTS.capabilitiesChanged, () => handler());
}

export function onAccountsChanged(handler: () => void): Promise<UnlistenFn> {
  return listen(EVENTS.accountsChanged, () => handler());
}

/**
 * Subscribe from a React effect: returns a cleanup that unsubscribes even if
 * the effect is torn down before `listen` resolves.
 */
export function subscribe(registration: Promise<UnlistenFn>): () => void {
  let disposed = false;
  let unlisten: UnlistenFn | null = null;
  void registration.then((fn) => {
    if (disposed) fn();
    else unlisten = fn;
  });
  return () => {
    disposed = true;
    unlisten?.();
  };
}
