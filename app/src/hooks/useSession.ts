/**
 * useSession — live view of the running game session.
 *
 * Loads the current snapshot once and then follows `session://changed`.
 */

import { useEffect, useState } from "react";
import { sessionApi } from "@/services/api";
import { onSessionChanged, subscribe } from "@/services/api/events";
import type { SessionSnapshot } from "@/types/domains/session";

export function useSession(): SessionSnapshot | null {
  const [session, setSession] = useState<SessionSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = subscribe(
      onSessionChanged((snapshot) => {
        if (!cancelled) setSession(snapshot);
      }),
    );
    sessionApi
      .getSession()
      .then((snapshot) => {
        if (!cancelled) setSession((current) => current ?? snapshot);
      })
      .catch((error: unknown) => console.error("Could not read the game session", error));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return session;
}
