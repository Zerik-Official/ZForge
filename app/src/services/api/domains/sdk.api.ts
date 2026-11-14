import { call } from "../bridge";
import type { InstalledSdk, SdkLatestInfo, SdkStatus } from "@/types/domains/sdk";

export class SdkApi {
  getSdkStatus(): Promise<SdkStatus> {
    return call("get_sdk_status");
  }

  installSdk(): Promise<InstalledSdk> {
    return call("install_sdk");
  }

  checkSdkUpdate(): Promise<SdkLatestInfo | null> {
    return call("check_sdk_update");
  }

  getSdkLicense(): Promise<string> {
    return call("get_sdk_license");
  }

  openExternalUrl(url: string): Promise<void> {
    return call("open_external_url", { url });
  }
}

export const sdkApi = new SdkApi();
