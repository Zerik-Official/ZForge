import { call } from "../bridge";
import type { AssetManifest, CustomAssetKind } from "@/types/domains/assets";

export class AssetsApi {
  /** Folder holding the media downloaded from the assets CDN. */
  getResourcesDir(): Promise<string> {
    return call("get_resources_dir");
  }

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
