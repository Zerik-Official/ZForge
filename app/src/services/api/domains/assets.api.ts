import { bridge } from "../bridge";
import type { AssetManifest } from "@/types/pywebview";

export class AssetsApi {
  listAssets(): Promise<AssetManifest> {
    return bridge().list_assets();
  }

  selectExe(): Promise<string | null> {
    return bridge().select_exe();
  }

  selectCustomAsset(kind: "icos" | "logos" | "scenes"): Promise<string | null> {
    return bridge().select_custom_asset(kind);
  }
}

export const assetsApi = new AssetsApi();