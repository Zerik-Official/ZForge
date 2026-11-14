import { useCallback, useRef, useState } from "react";
import { api } from "@/services/api";
import type { ConfigConflict } from "@/types/domains/settings";

export type ConflictChoice = "apply" | "pull";

/**
 * Queue of configuration conflicts between the game files and the launcher
 * database, resolved one at a time by the user.
 */
export function useConfigConflict() {
  const queueRef = useRef<ConfigConflict[]>([]);
  const [conflicts, setConflicts] = useState<ConfigConflict[]>([]);

  const push = useCallback((incoming: ConfigConflict[]) => {
    if (incoming.length === 0) return;
    queueRef.current = [...queueRef.current, ...incoming];
    setConflicts(queueRef.current);
  }, []);

  const resolve = useCallback(async (choice: ConflictChoice) => {
    const current = queueRef.current;
    if (current.length === 0) return;
    const [first, ...rest] = current;
    queueRef.current = rest;
    setConflicts(rest);
    try {
      if (choice === "apply") {
        await api.applyGameSettings(first.game_id);
      } else {
        await api.pullGameSettings(first.game_id);
      }
    } catch (error) {
      console.error("Could not resolve settings conflict", error);
    }
  }, []);

  return { conflicts, push, resolve };
}
