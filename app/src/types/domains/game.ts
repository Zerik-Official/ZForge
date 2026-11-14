export interface Game {
  id: string;
  name: string;
  expansion: string;
  exe_path: string;
  bg_video: string;
  icon: string;
  poster: string;
  box: string;
  show_on_main: boolean;
  /** Creation time in Unix milliseconds. */
  created_at: number;
  sort_order: number;
}

/** Editable game fields; identity and ordering are owned by the backend. */
export type GameDraft = Omit<Game, "id" | "created_at" | "sort_order" | "box"> & Partial<Pick<Game, "box">>;