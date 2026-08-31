import type { StateCreator } from "zustand";
import { assetsApi } from "@/services/api/domains/assets.api";
import type { AssetManifest } from "@/types/domains/assets";

export interface AssetsSlice {
  assets: AssetManifest | null;
  fetchAssets: () => Promise<void>;
}

export const createAssetsSlice: StateCreator<AssetsSlice, [], [], AssetsSlice> = (set) => ({
  assets: null,

  async fetchAssets() {
    const assets = await assetsApi.listAssets();
    set({ assets });
  },
});