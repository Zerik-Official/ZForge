import { call } from "../bridge";
import type { AssetManifest, CustomAssetKind } from "@/types/domains/assets";

export class AssetsApi {
  listAssets(): Promise<AssetManifest> {
    return call("list_assets");
  }

  selectExe(): Promise<string | null> {
    return call("select_exe");
  }

  selectCustomAsset(kind: CustomAssetKind): Promise<string | null> {
    return call("select_custom_asset", { kind });
  }
}

export const assetsApi = new AssetsApi();
