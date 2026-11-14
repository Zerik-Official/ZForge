import { getCurrentWindow } from "@tauri-apps/api/window";

export class WindowApi {
  minimizeWindow(): Promise<void> {
    return getCurrentWindow().minimize();
  }

  closeWindow(): Promise<void> {
    return getCurrentWindow().close();
  }
}

export const windowApi = new WindowApi();
