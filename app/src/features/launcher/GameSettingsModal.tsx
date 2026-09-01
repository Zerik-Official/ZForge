import { useEffect, useState } from "react";
import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import { Modal, ModalHeader, ModalFooter } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Combobox } from "@/components/ui/Combobox";
import { SettingsCategory } from "@/features/settings/SettingsCategory";
import { t } from "@/locales/i18n";
import { useGameSettingsForm } from "@/hooks/useGameSettingsForm";
import { settingsApi } from "@/services/api/domains/settings.api";
import type { Game } from "@/types/domains/game";
import type { SettingsSchema } from "@/types/domains/schema";

interface GameSettingsModalProps {
  open: boolean;
  game: Game | null;
  onClose: () => void;
}

function getSchemaIdForGame(game: Game): string {
  const map: Record<string, string> = {
    classic: "wow-wotlk-335a",
    tbc: "wow-wotlk-335a",
    wotlk: "wow-wotlk-335a",
  };
  return map[game.expansion] ?? "wow-wotlk-335a";
}

export function GameSettingsModal({ open, game, onClose }: GameSettingsModalProps) {
  const [category, setCategory] = useState<string>("launch");
  const {
    settings,
    display,
    loading: formLoading,
    busy,
    error,
    pendingSave,
    setPendingSave,
    realmlistOptions,
    realmOptions,
    update,
    persistSettings,
  } = useGameSettingsForm(game, open);

  const [schema, setSchema] = useState<SettingsSchema | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);

  useEffect(() => {
    if (!open || !game) return;
    let cancelled = false;
    setSchemaLoading(true);
    const versionId = getSchemaIdForGame(game);
    settingsApi
      .getSettingsSchema(versionId)
      .then((data) => {
        if (!cancelled) {
          const s = data as unknown as SettingsSchema & { ok?: boolean };
          if (s && "categories" in s) setSchema(s as SettingsSchema);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSchemaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, game]);

  const loading = formLoading || schemaLoading;
  const activeCategory = schema?.categories.find((c) => c.id === category) ?? schema?.categories[0] ?? null;

  const RESOLUTIONS = [
    "720x576", "800x600", "1280x600", "1024x768", "1280x720", "1280x768",
    "1152x864", "1280x800", "1360x768", "1366x768", "1280x960", "1440x900",
    "1280x1024", "1600x900", "1400x1050", "1680x1050", "1920x1080",
  ];
  
  function parseResolution(value: string): { w: number; h: number } {
    const [w, h] = value.split("x").map((n) => parseInt(n, 10));
    return { w: w || 0, h: h || 0 };
  }
  const visibleResolutions = (() => {
    const opts = RESOLUTIONS.filter((res) => {
      const { w, h } = parseResolution(res);
      return w <= display.width && h <= display.height;
    }).map((res) => ({ value: res, label: res }));
    if (!opts.some((o) => o.value === settings.resolution)) {
      opts.push({ value: settings.resolution, label: `${settings.resolution} (actual)` });
    }
    return opts;
  })();

  const sources = {
    realmlists: realmlistOptions,
    realms: realmOptions,
    realmlist: realmlistOptions,
    realm: realmOptions,
  };

  const extraOptions = {
    resolution: visibleResolutions,
    refresh_rate: [23, 24, 25, 29, 30, 50, 59, 60].map((v) => ({ value: String(v), label: `${v} Hz` })),
    multisample: [1, 2, 4, 8, 16].map((v) => ({ value: String(v), label: `${v}x` })),
    launch_priority: [
      { value: "normal", label: t("settings.launch.priority.normal") },
      { value: "high", label: t("settings.launch.priority.high") },
      { value: "realtime", label: t("settings.launch.priority.realtime") },
    ],
  };

  if (!open || !game) return null;

  function handleChange(key: string, value: unknown) {
    if (key === "realm_list") {
      update("realm_list" as keyof typeof settings, value as never);
      update("realm_name" as keyof typeof settings, "" as never);
      return;
    }
    update(key as keyof typeof settings, value as never);
  }

  async function handleSave(apply: boolean) {
    const realmlist = settings.realm_list.trim();
    const isKnown = realmlist === "" || realmlistOptions.some((opt) => opt.value.toLowerCase() === realmlist.toLowerCase());
    if (realmlist && !isKnown) {
      setPendingSave({ apply });
      return;
    }
    await persistSettings(apply);
    onClose();
  }

  function resolvePendingSave(saveGlobal: boolean) {
    const pending = pendingSave;
    setPendingSave(null);
    if (pending) {
      persistSettings(pending.apply, saveGlobal).then(() => onClose());
    }
  }

  return (
    <Modal open={open} onClose={onClose} className="h-135 w-full max-w-3xl">
      <ModalHeader icon="fa-solid fa-gear" title={t("settings.categories.launch")} subtitle={game.name} onClose={onClose} />

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-44 shrink-0 flex-col gap-1 border-r border-(--border) bg-(--bg-soft) p-3">
          {(schema?.categories ?? []).map((cat) => (
            <button
              key={cat.id}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] transition-colors cursor-pointer ${
                category === cat.id ? "bg-(--accent-dim) text-(--accent)" : "text-(--text-soft) hover:bg-(--bg-hover)"
              }`}
              onClick={() => setCategory(cat.id)}
            >
              <i className={`${cat.icon} text-[13px]`} />
              {t(cat.label)}
            </button>
          ))}
        </aside>

        <section className="min-w-0 flex-1 overflow-y-auto px-6 py-5 will-change-transform">
          {loading ? (
            <div className="flex h-full items-center justify-center text-(--muted)">
              <i className="fa-solid fa-spinner fa-spin text-[18px]" />
            </div>
          ) : activeCategory ? (
            activeCategory.id === "multi" ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-(--muted)">
                <i className="fa-solid fa-users text-2xl" />
                <span className="text-[13px]">{t("settings.categories.multi") ?? "Multicuenta — en desarrollo"}</span>
              </div>
            ) : activeCategory.id === "effects" ? (
              <SettingsCategory
                category={activeCategory}
                values={settings as unknown as Record<string, unknown>}
                onChange={handleChange}
                sources={sources}
                extraOptions={extraOptions}
              />
            ) : activeCategory.id === "launch" ? (
              <div className="flex flex-col gap-5">
                <span className="section-label">
                  <i className="fa-solid fa-rocket" /> {t("settings.categories.launch")}
                </span>
                <div className="flex flex-col gap-1.5">
                  <label className="field-label">{t("settings.launch.args")}</label>
                  <input
                    className="field-input"
                    value={settings.launch_args}
                    onChange={(e) => update("launch_args", e.target.value)}
                    placeholder="-console -windowed"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="field-label">{t("settings.launch.priority.label")}</label>
                  <Select
                    value={settings.launch_priority}
                    options={[
                      { value: "normal", label: t("settings.launch.priority.normal") },
                      { value: "high", label: t("settings.launch.priority.high") },
                      { value: "realtime", label: t("settings.launch.priority.realtime") },
                    ]}
                    onChange={(value) => update("launch_priority", value as typeof settings.launch_priority)}
                  />
                </div>
                <Checkbox
                  checked={settings.clear_cache_on_launch}
                  onChange={(value) => update("clear_cache_on_launch", value)}
                  label={t("settings.launch.clear_cache")}
                />
              </div>
            ) : activeCategory.id === "server" ? (
              <div className="flex flex-col gap-5">
                <span className="section-label">
                  <i className="fa-solid fa-server" /> {t("settings.categories.server")}
                </span>
                <div className="flex flex-col gap-1.5">
                  <label className="field-label">{t("settings.server.realm_list")}</label>
                  <Combobox
                    value={settings.realm_list}
                    onChange={(value) => {
                      update("realm_list", value);
                      update("realm_name", "");
                    }}
                    options={realmlistOptions}
                    onSelect={(option) => {
                      update("realm_list", option.value);
                      update("realm_name", "");
                    }}
                    placeholder="comunidad.naerzone.com"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="field-label">{t("settings.server.realm_name")}</label>
                  <Combobox
                    value={settings.realm_name}
                    onChange={(value) => update("realm_name", value)}
                    options={realmOptions}
                    placeholder="Thalassa"
                  />
                </div>
              </div>
            ) : activeCategory.id === "graphics" ? (
              <div className="flex flex-col gap-5">
                <span className="section-label">
                  <i className="fa-solid fa-display" /> {t("settings.categories.graphics")}
                </span>
                <div className="flex flex-wrap gap-4">
                  <div className="flex min-w-0 basis-full flex-col gap-1.5 md:basis-[calc(50%-8px)]">
                    <label className="field-label">{t("settings.graphics.refresh_rate")}</label>
                    <Select
                      value={String(settings.refresh_rate)}
                      options={[23, 24, 25, 29, 30, 50, 59, 60].map((v) => ({ value: String(v), label: `${v} Hz` }))}
                      onChange={(value) => update("refresh_rate", parseInt(value, 10))}
                    />
                  </div>
                  <div className="flex min-w-0 basis-full flex-col gap-1.5 md:basis-[calc(50%-8px)]">
                    <label className="field-label">{t("settings.graphics.resolution")}</label>
                    <Select value={settings.resolution} options={visibleResolutions} onChange={(value) => update("resolution", value)} />
                  </div>
                </div>
                <Checkbox checked={settings.windowed} onChange={(value) => update("windowed", value)} label={t("settings.graphics.windowed")} />
                <div className="flex flex-col gap-3 rounded-xl border border-(--border-strong) bg-(--bg-input) p-3">
                  <Checkbox
                    checked={settings.window_resize_lock}
                    disabled={!settings.windowed}
                    onChange={(value) => update("window_resize_lock", value)}
                    label={t("settings.graphics.window_resize_lock")}
                  />
                  <Checkbox
                    checked={settings.window_maximized}
                    disabled={!settings.windowed}
                    onChange={(value) => update("window_maximized", value)}
                    label={t("settings.graphics.window_maximized")}
                  />
                </div>
                <Checkbox checked={settings.vsync} onChange={(value) => update("vsync", value)} label={t("settings.graphics.vsync")} />
                <div className="flex flex-col gap-1.5">
                  <label className="field-label">{t("settings.graphics.multisample.label")}</label>
                  <Select
                    value={String(settings.multisample)}
                    options={[
                      { value: "1", label: t("settings.graphics.multisample.1") },
                      { value: "2", label: t("settings.graphics.multisample.2") },
                      { value: "4", label: t("settings.graphics.multisample.4") },
                      { value: "8", label: t("settings.graphics.multisample.8") },
                      { value: "16", label: t("settings.graphics.multisample.16") },
                    ]}
                    onChange={(value) => update("multisample", parseInt(value, 10))}
                  />
                </div>
              </div>
            ) : (
              <SettingsCategory
                category={activeCategory}
                values={settings as unknown as Record<string, unknown>}
                onChange={handleChange}
                sources={sources}
                extraOptions={extraOptions}
              />
            )
          ) : null}
        </section>
      </div>

      <ModalFooter>
        {error && <span className="mr-auto text-[12px] text-(--danger)">{error}</span>}
        <button className="ghost-btn rounded-lg px-4 py-2 text-[13px] cursor-pointer" onClick={onClose}>
          Cancelar
        </button>
        <button
          className="ghost-btn rounded-lg px-4 py-2 text-[13px] cursor-pointer"
          onClick={() => handleSave(false)}
          disabled={busy || loading}
        >
          Guardar
        </button>
        <button
          className="play-btn rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40 cursor-pointer"
          onClick={() => handleSave(true)}
          disabled={busy || loading}
        >
          {busy ? "Aplicando..." : "Guardar y aplicar"}
        </button>
      </ModalFooter>

      <ConfirmDialog
        open={pendingSave !== null}
        icon="fa-solid fa-server"
        title="Guardar realmlist como global"
        description={`"${settings.realm_list.trim()}" no está en el catálogo de servidores. ¿Quieres guardarlo para que se autocomplete en futuros juegos?`}
        confirmLabel="Sí, guardar"
        cancelLabel="Solo este juego"
        onConfirm={() => resolvePendingSave(true)}
        onCancel={() => resolvePendingSave(false)}
      />
    </Modal>
  );
}
