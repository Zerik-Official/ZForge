import { useState } from "react";
import { Select, type SelectOption } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import { Modal, ModalHeader, ModalFooter } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Combobox } from "@/components/ui/Combobox";
import { useGameSettingsForm } from "@/hooks/useGameSettingsForm";
import type { Game } from "@/types/domains/game";

interface GameSettingsModalProps {
  open: boolean;
  game: Game | null;
  onClose: () => void;
}

type Category = "launch" | "multi" | "server" | "graphics";

const CATEGORIES: { key: Category; label: string; icon: string }[] = [
  { key: "launch", label: "Lanzamiento", icon: "fa-solid fa-rocket" },
  { key: "multi", label: "Multicuenta", icon: "fa-solid fa-users" },
  { key: "server", label: "Servidor", icon: "fa-solid fa-server" },
  { key: "graphics", label: "Gráficos", icon: "fa-solid fa-display" },
];

const RESOLUTIONS = [
  "720x576", "800x600", "1280x600", "1024x768", "1280x720", "1280x768",
  "1152x864", "1280x800", "1360x768", "1366x768", "1280x960", "1440x900",
  "1280x1024", "1600x900", "1400x1050", "1680x1050", "1920x1080",
];

const REFRESH_RATES = [23, 24, 25, 29, 30, 50, 59, 60];

const PRIORITY_OPTIONS: SelectOption[] = [
  { value: "normal", label: "Normal" },
  { value: "high", label: "Alta (/HIGH)" },
  { value: "realtime", label: "Tiempo real (/REALTIME)" },
];

const MULTISAMPLE_OPTIONS: SelectOption[] = [
  { value: "1", label: "Color 24 bits, Profundidad 24 bits, Multimuestreo 1x" },
  { value: "2", label: "Color 24 bits, Profundidad 24 bits, Multimuestreo 2x" },
  { value: "4", label: "Color 24 bits, Profundidad 24 bits, Multimuestreo 4x" },
  { value: "8", label: "Color 24 bits, Profundidad 24 bits, Multimuestreo 8x" },
  { value: "16", label: "Color 24 bits, Profundidad 24 bits, Multimuestreo 16x" },
];

function parseResolution(value: string): { w: number; h: number } {
  const [w, h] = value.split("x").map((n) => parseInt(n, 10));
  return { w: w || 0, h: h || 0 };
}

export function GameSettingsModal({ open, game, onClose }: GameSettingsModalProps) {
  const [category, setCategory] = useState<Category>("launch");
  const {
    settings,
    display,
    loading,
    busy,
    error,
    pendingSave,
    setPendingSave,
    realmlistOptions,
    realmOptions,
    update,
    persistSettings,
  } = useGameSettingsForm(game, open);

  const visibleResolutions: SelectOption[] = (() => {
    const opts = RESOLUTIONS.filter((res) => {
      const { w, h } = parseResolution(res);
      return w <= display.width && h <= display.height;
    }).map((res) => ({ value: res, label: res }));
    if (!opts.some((o) => o.value === settings.resolution)) {
      opts.push({ value: settings.resolution, label: `${settings.resolution} (actual)` });
    }
    return opts;
  })();

  const refreshOptions: SelectOption[] = REFRESH_RATES.map((rate) => ({
    value: String(rate),
    label: `${rate} Hz`,
  }));

  if (!open || !game) return null;

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
      <ModalHeader icon="fa-solid fa-gear" title="Configuración" subtitle={game.name} onClose={onClose} />

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-44 shrink-0 flex-col gap-1 border-r border-(--border) bg-(--bg-soft) p-3">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] transition-colors cursor-pointer ${
                category === cat.key ? "bg-(--accent-dim) text-(--accent)" : "text-(--text-soft) hover:bg-(--bg-hover)"
              }`}
              onClick={() => setCategory(cat.key)}
            >
              <i className={`${cat.icon} text-[13px]`} />
              {cat.label}
            </button>
          ))}
        </aside>

        <section className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex h-full items-center justify-center text-(--muted)">
              <i className="fa-solid fa-spinner fa-spin text-[18px]" />
            </div>
          ) : (
            <>
              {category === "launch" && (
                <div className="flex flex-col gap-5">
                  <span className="section-label">
                    <i className="fa-solid fa-rocket" /> Lanzamiento
                  </span>
                  <div className="flex flex-col gap-1.5">
                    <label className="field-label">Argumentos de inicio</label>
                    <input
                      className="field-input"
                      value={settings.launch_args}
                      onChange={(e) => update("launch_args", e.target.value)}
                      placeholder="-console -windowed"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="field-label">Prioridad de proceso</label>
                    <Select
                      value={settings.launch_priority}
                      options={PRIORITY_OPTIONS}
                      onChange={(value) => update("launch_priority", value as typeof settings.launch_priority)}
                    />
                  </div>
                  <Checkbox
                    checked={settings.clear_cache_on_launch}
                    onChange={(value) => update("clear_cache_on_launch", value)}
                    label="Borrar caché al iniciar"
                  />
                </div>
              )}

              {category === "multi" && (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-(--muted)">
                  <i className="fa-solid fa-users text-2xl" />
                  <span className="text-[13px]">Multicuenta — en desarrollo</span>
                </div>
              )}

              {category === "server" && (
                <div className="flex flex-col gap-5">
                  <span className="section-label">
                    <i className="fa-solid fa-server" /> Servidor
                  </span>
                  <div className="flex flex-col gap-1.5">
                    <label className="field-label">Realm list</label>
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
                    <label className="field-label">Reino</label>
                    <Combobox
                      value={settings.realm_name}
                      onChange={(value) => update("realm_name", value)}
                      options={realmOptions}
                      placeholder="Thalassa"
                    />
                  </div>
                </div>
              )}

              {category === "graphics" && (
                <div className="flex flex-col gap-5">
                  <span className="section-label">
                    <i className="fa-solid fa-display" /> Gráficos
                  </span>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <label className="field-label">Tasa de refresco</label>
                      <Select
                        value={String(settings.refresh_rate)}
                        options={refreshOptions}
                        onChange={(value) => update("refresh_rate", parseInt(value, 10))}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="field-label">Resolución</label>
                      <Select value={settings.resolution} options={visibleResolutions} onChange={(value) => update("resolution", value)} />
                    </div>
                  </div>
                  <Checkbox checked={settings.windowed} onChange={(value) => update("windowed", value)} label="Modo ventana" />
                  <div className="flex flex-col gap-3 rounded-xl border border-(--border-strong) bg-(--bg-input) p-3">
                    <Checkbox
                      checked={settings.window_resize_lock}
                      disabled={!settings.windowed}
                      onChange={(value) => update("window_resize_lock", value)}
                      label="Bloquear tamaño de ventana (windowResizeLock)"
                    />
                    <Checkbox
                      checked={settings.window_maximized}
                      disabled={!settings.windowed}
                      onChange={(value) => update("window_maximized", value)}
                      label="Maximizado sin bordes (gxMaximize)"
                    />
                  </div>
                  <Checkbox checked={settings.vsync} onChange={(value) => update("vsync", value)} label="Sincronización vertical (VSync)" />
                  <div className="flex flex-col gap-1.5">
                    <label className="field-label">Multimuestreo (antialiasing)</label>
                    <Select
                      value={String(settings.multisample)}
                      options={MULTISAMPLE_OPTIONS}
                      onChange={(value) => update("multisample", parseInt(value, 10))}
                    />
                  </div>
                </div>
              )}
            </>
          )}
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
