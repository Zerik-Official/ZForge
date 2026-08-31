import { bridge } from "../bridge";

export class WindowApi {
  minimizeWindow(): Promise<void> {
    return bridge().minimize_window();
  }

  closeWindow(): Promise<void> {
    return bridge().close_window();
  }
}

export const windowApi = new WindowApi();