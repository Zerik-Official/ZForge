import { bridge } from "../bridge";
import type { SdkStatus, SdkLatestInfo } from "@/types/domains/sdk";
import type { ApiResult } from "@/types/domains/api";

export class SdkApi {
  getSdkStatus(): Promise<SdkStatus> {
    return bridge().get_sdk_status();
  }

  installSdk(): Promise<ApiResult & { version?: string; path?: string }> {
    return bridge().install_sdk();
  }

  checkSdkUpdate(): Promise<SdkLatestInfo | null> {
    return bridge().check_sdk_update();
  }
}

export const sdkApi = new SdkApi();