import { call } from "../bridge";
import type { Capabilities } from "@/types/domains/capabilities";
import type { InstalledSdk, SdkLatestInfo, SdkStatus } from "@/types/domains/sdk";

export class SdkApi {
  getSdkStatus(): Promise<SdkStatus> {
    return call("get_sdk_status");
  }

  /** Launcher features and whether the installed SDK supports them. */
  getCapabilities(): Promise<Capabilities> {
    return call("get_capabilities");
  }

  installSdk(): Promise<InstalledSdk> {
    return call("install_sdk");
  }

  checkSdkUpdate(): Promise<SdkLatestInfo | null> {
    return call("check_sdk_update");
  }

  /** Use the installed SDK binaries although they differ from the published release. */
  trustSdk(): Promise<void> {
    return call("trust_sdk");
  }

  getSdkLicense(): Promise<string> {
    return call("get_sdk_license");
  }

  openExternalUrl(url: string): Promise<void> {
    return call("open_external_url", { url });
  }
}

export const sdkApi = new SdkApi();
