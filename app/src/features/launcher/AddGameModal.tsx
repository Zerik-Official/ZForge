import { useEffect, useState } from "react";
import { api } from "@/services/api";
import { useGamesStore } from "@/store/gamesStore";
import { toDisplaySrc } from "@/utils/asset";
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
  }, [open, initial]);

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

  const expansionOptions = assets ? Object.entries(assets.expansions) : [];
  const videoOptions = [...new Set([bgVideo, ...(assets?.available_videos ?? [])])].filter(Boolean);
  const iconOptions = [...new Set([icon, ...(assets?.available_icons ?? [])])].filter(Boolean);
  const posterOptions = [...new Set([poster, ...(assets?.available_posters ?? [])])].filter(Boolean);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-(--border-strong) bg-(--bg-card) p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-(--text)">
            {initial ? "Editar juego" : "Añadir juego"}
          </h2>
          <button className="ghost-btn rounded-lg px-3 py-1.5" onClick={onClose}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="field-label">Nombre</label>
            <input
              className="field-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Mi WoW 3.3.5a"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="field-label">Expansión</label>
            <select
              className="field-input"
              value={expansion}
              onChange={(event) => handleExpansionChange(event.target.value)}
            >
              {expansionOptions.map(([key, value]) => (
                <option key={key} value={key}>
                  {value.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2 md:col-span-2">
            <label className="field-label">Ejecutable (.exe)</label>
            <div className="flex gap-2">
              <input
                className="field-input flex-1"
                value={exePath}
                readOnly
                placeholder="Selecciona wow.exe"
              />
              <button className="ghost-btn whitespace-nowrap rounded-lg px-3" onClick={pickExe}>
                <i className="fa-solid fa-folder-open mr-1" /> Buscar
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="field-label">Video de fondo</label>
            <select
              className="field-input"
              value={bgVideo}
              onChange={(event) => setBgVideo(event.target.value)}
            >
              {videoOptions.map((video) => (
                <option key={video} value={video}>
                  {video.split("/").pop()}
                </option>
              ))}
            </select>
            <button className="ghost-btn self-start rounded-lg px-3 py-1.5 text-[12px]" onClick={() => pickCustom("scenes")}>
              <i className="fa-solid fa-image mr-1" /> Personalizado
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <label className="field-label">Ícono</label>
            <select
              className="field-input"
              value={icon}
              onChange={(event) => setIcon(event.target.value)}
            >
              {iconOptions.map((option) => (
                <option key={option} value={option}>
                  {option.split("/").pop()}
                </option>
              ))}
            </select>
            <button className="ghost-btn self-start rounded-lg px-3 py-1.5 text-[12px]" onClick={() => pickCustom("icos")}>
              <i className="fa-solid fa-image mr-1" /> Personalizado
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <label className="field-label">Póster</label>
            <select
              className="field-input"
              value={poster}
              onChange={(event) => setPoster(event.target.value)}
            >
              {posterOptions.map((option) => (
                <option key={option} value={option}>
                  {option.split("/").pop()}
                </option>
              ))}
            </select>
            <button className="ghost-btn self-start rounded-lg px-3 py-1.5 text-[12px]" onClick={() => pickCustom("logos")}>
              <i className="fa-solid fa-image mr-1" /> Personalizado
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <label className="field-label">Vista previa</label>
            <div className="flex items-center gap-3 rounded-lg border border-(--border) bg-(--bg-elevated) p-3">
              {icon ? (
                <img
                  src={toDisplaySrc(icon)}
                  alt="icon"
                  className="h-10 w-10 rounded object-contain"
                />
              ) : null}
              {poster ? (
                <img
                  src={toDisplaySrc(poster)}
                  alt="poster"
                  className="h-12 w-20 rounded object-cover"
                />
              ) : null}
            </div>
            <label className="mt-1 flex items-center gap-2 text-[13px] text-(--text)">
              <input
                type="checkbox"
                checked={showOnMain}
                onChange={(event) => setShowOnMain(event.target.checked)}
              />
              Mostrar en la pantalla de inicio
            </label>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button className="ghost-btn rounded-lg px-4 py-2" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="play-btn rounded-lg px-4 py-2"
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
