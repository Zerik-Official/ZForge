import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/services/api";
import type { ConfigConflict } from "@/types/pywebview";

export type ConflictChoice = "apply" | "pull";

/**
 * Hook to manage configuration conflicts between the game and the database.
 * It maintains a queue of conflicts and provides methods to push new conflicts
 * and resolve them based on user choice.
 */
export function useConfigConflict() {
  const queueRef = useRef<ConfigConflict[]>([]);
  const [conflicts, setConflicts] = useState<ConfigConflict[]>([]);

  const push = useCallback((conflict: ConfigConflict) => {
    queueRef.current = [...queueRef.current, conflict];
    setConflicts(queueRef.current);
  }, []);

  const resolve = useCallback(async (choice: ConflictChoice) => {
    const current = queueRef.current;
    if (current.length === 0) return;
    const [first, ...rest] = current;
    queueRef.current = rest;
    setConflicts(rest);
    if (choice === "apply") {
      await api.applyGameSettings(first.game_id);
    } else {
      await api.pullGameSettings(first.game_id);
    }
  }, []);

  useEffect(() => {
    window.__zforge_config_conflict = push;
    return () => {
      delete window.__zforge_config_conflict;
    };
  }, [push]);

  return { conflicts, resolve };
}
