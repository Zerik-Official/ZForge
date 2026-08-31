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
  created_at: string;
  sort_order: number;
}

export type GameInput = Omit<Game, "id" | "created_at" | "sort_order" | "box"> &
  Partial<Pick<Game, "sort_order" | "box">>;