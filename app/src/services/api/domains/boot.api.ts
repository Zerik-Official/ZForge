import { call } from "../bridge";
import type { BootReport } from "@/types/domains/boot";

export class BootApi {
  /** Run the startup sequence; repeated calls return the first run's report. */
  runBoot(): Promise<BootReport> {
    return call("run_boot");
  }

  /** Install the update found on boot; the launcher restarts when it finishes. */
  installUpdate(): Promise<void> {
    return call("install_update");
  }
}

export const bootApi = new BootApi();
