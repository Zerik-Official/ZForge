export interface AssetManifest {
  expansions: Record<string, { name: string; video: string; poster: string; icon: string; box: string }>;
  available_videos: string[];
  available_posters: string[];
  available_icons: string[];
  available_boxes: string[];
}
export type CustomAssetKind = "icos" | "logos" | "scenes";
