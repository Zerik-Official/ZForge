import { call } from "../bridge";

/** Translated texts of the notification area menu. */
export interface TrayStrings {
  open: string;
  quit: string;
}

export class TrayApi {
  /** Send the tray menu texts in the current language. */
  setTrayStrings(strings: TrayStrings): Promise<void> {
    return call("set_tray_strings", { strings });
  }
}

export const trayApi = new TrayApi();
