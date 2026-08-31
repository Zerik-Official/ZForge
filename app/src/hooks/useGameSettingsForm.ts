import { useEffect, useMemo, useState } from "react";
import { settingsApi } from "@/services/api/domains/settings.api";
import { serversApi } from "@/services/api/domains/servers.api";
import type { Game } from "@/types/domains/game";
import type { GameSettings } from "@/types/domains/settings";
import type { ServerEntry } from "@/types/domains/server";

export function useGameSettingsForm(game: Game | null, open: boolean) {
  const [settings, setSettings] = useState<GameSettings>({
    launch_args: "",
    launch_priority: "normal",
    clear_cache_on_launch: false,
    realm_list: "",
    realm_name: "",
    refresh_rate: 60,
    resolution: "1920x1080",
    windowed: false,
    window_resize_lock: false,
    window_maximized: false,
    vsync: true,
    multisample: 1,
    farclip: 1277,
    environment_detail: 1.5,
    base_mip: 0,
    shadow_level: 1,
    ground_effect_density: 0,
    texture_filtering_mode: 1,
    ground_effect_dist: 140,
    weather_density: 2,
    ext_shadow_quality: 0,
    component_texture_level: 0,
    particle_density: 1.0,
    specular: false,
    ffx_death: true,
    ffx_glow: true,
    projected_textures: false,
  });
  const [display, setDisplay] = useState<{ width: number; height: number }>({ width: 1920, height: 1080 });
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingSave, setPendingSave] = useState<{ apply: boolean } | null>(null);

  useEffect(() => {
    if (!open || !game) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const saved = await settingsApi.getGameSettings(game.id);
        if (saved && Object.keys(saved).length > 0) {
          if (!cancelled) setSettings({ ...settings, ...saved } as GameSettings);
        } else {
          const scanned = await settingsApi.scanGameConfig(game.id);
          await settingsApi.saveGameSettings(game.id, scanned);
          if (!cancelled) setSettings(scanned);
        }
        const disp = await settingsApi.getDisplayResolution();
        if (!cancelled) setDisplay(disp);
        const list = await serversApi.listServers();
        if (!cancelled) setServers(list);
      } catch {
        if (!cancelled) setError("No se pudo cargar la configuración del juego.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, game]);

  const realmlistOptions = useMemo(
    () =>
      servers.flatMap((server) =>
        server.realmlists.map((realmlist) => ({
          value: realmlist,
          label: server.name,
          sublabel: realmlist,
          thumb: server.logo ?? undefined,
          badge: server.custom ? "Personalizado" : undefined,
          meta: { realms: server.realms },
        }))
      ),
    [servers]
  );

  const matchedServers = useMemo(
    () =>
      servers.filter((server) =>
        server.realmlists.some((rl) => rl.trim().toLowerCase() === settings.realm_list.trim().toLowerCase())
      ),
    [servers, settings.realm_list]
  );

  const realmOptions = useMemo(() => {
    const seen = new Set<string>();
    matchedServers.forEach((server) => server.realms.forEach((realm) => seen.add(realm)));
    return Array.from(seen).map((realm) => ({ value: realm, label: realm }));
  }, [matchedServers]);

  function update<K extends keyof GameSettings>(key: K, value: GameSettings[K]) {
    setSettings((prev: GameSettings) => ({ ...prev, [key]: value }));
  }

  async function persistSettings(apply: boolean, saveGlobal = false) {
    if (!game) return;
    setBusy(true);
    setError(null);
    try {
      const realmlist = settings.realm_list.trim();
      const realmName = settings.realm_name.trim();
      if (saveGlobal && realmlist) {
        await serversApi.saveCustomServer({ realmlist, name: realmlist, realm: realmName || undefined });
        setServers(await serversApi.listServers());
      } else if (realmlist && realmName) {
        const customMatch = matchedServers.find((server) => server.custom);
        if (customMatch && !customMatch.realms.includes(realmName)) {
          await serversApi.addCustomRealm(realmlist, realmName);
          setServers(await serversApi.listServers());
        }
      }
      await settingsApi.saveGameSettings(game.id, settings);
      if (apply) {
        const result = await settingsApi.applyGameSettings(game.id);
        if (!result.ok) setError(result.error ?? "No se pudo aplicar al juego.");
      }
    } catch {
      setError("Error al guardar la configuración.");
    } finally {
      setBusy(false);
    }
  }

  return {
    settings,
    display,
    servers,
    loading,
    busy,
    error,
    pendingSave,
    setPendingSave,
    realmlistOptions,
    realmOptions,
    matchedServers,
    update,
    persistSettings,
    setError,
    setBusy,
  };
}