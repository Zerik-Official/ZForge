import { useEffect, useState } from "react";
import { api } from "@/services/api";
import { useGamesStore } from "@/store/gamesStore";
import { toDisplaySrc } from "@/utils/asset";
import { Select, type SelectOption } from "@/components/ui/Select";
import type { Game, GameInput } from "@/types/pywebview";

interface AddGameModalProps {
  /** Whether the modal is visible. */
  open: boolean;
  /** Game being edited, or `null` when creating a new one. */
  initial: Game | null;
  /** Request to close the modal. */
  onClose: () => void;
}

type AssetKind = "icos" | "logos" | "scenes";

/**
 * Modal to create or edit a game installation.
 *
 * Choosing an expansion auto-fills the matching default media; each field can
 * then be overridden with a bundled alternative or a custom file (imported via
 * a native dialog straight into the app-data assets folder).
 */
export function AddGameModal({ open, initial, onClose }: AddGameModalProps) {
  const assets = useGamesStore((state) => state.assets);
  const addGame = useGamesStore((state) => state.addGame);
  const updateGame = useGamesStore((state) => state.updateGame);

  const [name, setName] = useState("");
  const [expansion, setExpansion] = useState("wotlk");
  const [exePath, setExePath] = useState("");
  const [bgVideo, setBgVideo] = useState("");
  const [icon, setIcon] = useState("");
  const [poster, setPoster] = useState("");
  const [showOnMain, setShowOnMain] = useState(true);
  const [busy, setBusy] = useState(false);

  /** Initialise the form whenever the modal opens. */
  useEffect(() => {
    if (!open) return;
    const defaults = assets?.expansions[initial?.expansion ?? "wotlk"];
    if (initial) {
      setName(initial.name);
      setExpansion(initial.expansion);
      setExePath(initial.exe_path);
      setBgVideo(initial.bg_video);
      setIcon(initial.icon);
      setPoster(initial.poster);
      setShowOnMain(initial.show_on_main);
    } else {
      setName(defaults?.name ?? "");
      setExpansion("wotlk");
      setExePath("");
      setBgVideo(defaults?.video ?? "");
      setIcon(defaults?.icon ?? "");
      setPoster(defaults?.poster ?? "");
      setShowOnMain(true);
    }
  }, [open, initial, assets]);

  /** Re-adjust default media when the expansion changes. */
  function handleExpansionChange(value: string) {
    setExpansion(value);
    const def = assets?.expansions[value];
    if (def) {
      setName(def.name);
      setBgVideo(def.video);
      setIcon(def.icon);
      setPoster(def.poster);
    }
  }

  /** Open a native dialog to pick the executable. */
  async function pickExe() {
    const picked = await api.selectExe();
    if (picked) setExePath(picked);
  }

  /** Open a native dialog to import a custom asset of the given kind. */
  async function pickCustom(kind: AssetKind) {
    const picked = await api.selectCustomAsset(kind);
    if (!picked) return;
    if (kind === "icos") setIcon(picked);
    if (kind === "logos") setPoster(picked);
    if (kind === "scenes") setBgVideo(picked);
  }

  /** Build the payload and persist (create or update). */
  async function handleSave() {
    if (!name.trim() || !exePath.trim()) return;
    setBusy(true);
    const payload: GameInput = {
      name: name.trim(),
      expansion,
      exe_path: exePath,
      bg_video: bgVideo,
      icon,
      poster,
      show_on_main: showOnMain,
    };
    try {
      if (initial) {
        await updateGame({ ...initial, ...payload });
      } else {
        await addGame(payload);
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

  const expansionOptions: SelectOption[] = assets
    ? Object.entries(assets.expansions).map(([key, value]) => ({
        value: key,
        label: value.name,
        thumb: toDisplaySrc(value.icon),
      }))
    : [];

  const videoOptions: SelectOption[] = [...new Set([bgVideo, ...(assets?.available_videos ?? [])])]
    .filter(Boolean)
    .map((path) => ({ value: path, label: fileName(path) }));

  const iconOptions: SelectOption[] = [...new Set([icon, ...(assets?.available_icons ?? [])])]
    .filter(Boolean)
    .map((path) => ({ value: path, label: fileName(path), thumb: toDisplaySrc(path) }));

  const posterOptions: SelectOption[] = [...new Set([poster, ...(assets?.available_posters ?? [])])]
    .filter(Boolean)
    .map((path) => ({ value: path, label: fileName(path), thumb: toDisplaySrc(path) }));

  return (
    <div
      className="modal-backdrop fade-in fixed inset-0 z-50 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="modal-card pop-in flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-(--border) px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-(--border-strong) bg-(--primary-soft)">
              <i className="fa-solid fa-gamepad text-[13px] text-(--primary-hover)" />
            </div>
            <h2 className="text-[14.5px] font-semibold text-(--text)">
              {initial ? "Editar juego" : "Añadir juego"}
            </h2>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <i className="fa-solid fa-xmark text-[13px]" />
          </button>
        </div>

        <div className="flex flex-col gap-6 overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-3">
            <span className="section-label">
              <i className="fa-solid fa-circle-info" />
              Información básica
            </span>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="field-label">Nombre</label>
                <input
                  className="field-input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Mi WoW 3.3.5a"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="field-label">Expansión</label>
                <Select value={expansion} options={expansionOptions} onChange={handleExpansionChange} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="field-label">Ejecutable (.exe)</label>
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-(--border-strong) bg-(--bg-input)">
                  <i className="fa-solid fa-file-invoice text-[13px] text-(--muted)" />
                </div>
                <input
                  className="field-input flex-1 truncate"
                  value={exePath}
                  readOnly
                  placeholder="Selecciona wow.exe"
                  title={exePath}
                />
                <button className="ghost-btn shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-[12px]" onClick={pickExe}>
                  <i className="fa-solid fa-folder-open mr-1.5" />
                  Buscar
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <span className="section-label">
              <i className="fa-solid fa-photo-film" />
              Multimedia
            </span>

            <div className="flex flex-col gap-2">
              <label className="field-label">Video de fondo</label>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <Select value={bgVideo} options={videoOptions} onChange={setBgVideo} placeholder="Selecciona un video" />
                </div>
                <button className="icon-btn" title="Usar archivo personalizado" onClick={() => pickCustom("scenes")}>
                  <i className="fa-solid fa-upload text-[12px]" />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="field-label">Ícono</label>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <Select value={icon} options={iconOptions} onChange={setIcon} placeholder="Selecciona un ícono" />
                </div>
                <button className="icon-btn" title="Usar archivo personalizado" onClick={() => pickCustom("icos")}>
                  <i className="fa-solid fa-upload text-[12px]" />
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="field-label">Póster</label>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <Select value={poster} options={posterOptions} onChange={setPoster} placeholder="Selecciona un póster" />
                </div>
                <button className="icon-btn" title="Usar archivo personalizado" onClick={() => pickCustom("logos")}>
                  <i className="fa-solid fa-upload text-[12px]" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <span className="section-label">
              <i className="fa-solid fa-eye" />
              Vista previa
            </span>

            <div className="flex items-center gap-3 rounded-xl border border-(--border-strong) bg-(--bg-input) p-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-(--border-strong) bg-(--bg-card)">
                {icon ? (
                  <img src={toDisplaySrc(icon)} alt="" className="h-full w-full object-contain p-1.5" />
                ) : (
                  <i className="fa-solid fa-gamepad text-(--muted-2)" />
                )}
              </div>
              <div className="h-14 w-24 shrink-0 overflow-hidden rounded-lg border border-(--border-strong) bg-(--bg-card)">
                {poster ? <img src={toDisplaySrc(poster)} alt="" className="h-full w-full object-cover" /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-(--text)">{name || "Nombre del juego"}</p>
                <p className="text-[11px] uppercase tracking-wide text-(--muted)">{expansion}</p>
              </div>
            </div>

            <label className="flex items-center gap-2 text-[13px] text-(--text-soft)">
              <input
                type="checkbox"
                checked={showOnMain}
                onChange={(event) => setShowOnMain(event.target.checked)}
                style={{ accentColor: "var(--primary)" }}
              />
              Mostrar en la pantalla de inicio
            </label>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-(--border) px-6 py-4">
          <button className="ghost-btn rounded-lg px-4 py-2 text-[13px]" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="play-btn rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
            onClick={handleSave}
            disabled={busy || !name.trim() || !exePath.trim()}
          >
            {busy ? "Guardando..." : initial ? "Guardar" : "Añadir"}
          </button>
        </div>
      </div>
    </div>
  );
}
