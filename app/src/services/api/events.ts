import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { BootProgress, ResourcesProgress, UpdateProgress } from "@/types/domains/boot";
import type { SdkDownloadProgress } from "@/types/domains/sdk";
import type { SessionSnapshot } from "@/types/domains/session";
import type { ShortcutAction } from "@/types/domains/system";

/** Event names emitted by the backend (see `src-tauri/src/events.rs`). */
const EVENTS = {
  bootProgress: "boot://progress",
  resourcesProgress: "resources://progress",
  updateProgress: "update://progress",
  sdkDownloadProgress: "sdk://download-progress",
  sessionChanged: "session://changed",
  accountsChanged: "accounts://changed",
  capabilitiesChanged: "capabilities://changed",
  shortcutAction: "shortcut://action",
} as const;

export function onBootProgress(handler: (step: BootProgress) => void): Promise<UnlistenFn> {
  return listen<BootProgress>(EVENTS.bootProgress, (event) => handler(event.payload));
}

export function onResourcesProgress(handler: (progress: ResourcesProgress) => void): Promise<UnlistenFn> {
  return listen<ResourcesProgress>(EVENTS.resourcesProgress, (event) => handler(event.payload));
}

export function onUpdateProgress(handler: (progress: UpdateProgress) => void): Promise<UnlistenFn> {
  return listen<UpdateProgress>(EVENTS.updateProgress, (event) => handler(event.payload));
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

/** A game shortcut was opened while the launcher was running. */
export function onShortcutAction(handler: (action: ShortcutAction) => void): Promise<UnlistenFn> {
  return listen<ShortcutAction>(EVENTS.shortcutAction, (event) => handler(event.payload));
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
