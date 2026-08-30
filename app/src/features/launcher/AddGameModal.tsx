import { useEffect, useState } from "react";
import { api } from "@/services/api";
import { useGamesStore } from "@/store/gamesStore";
import { toDisplaySrc } from "@/utils/asset";
import { Select, type SelectOption } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import { Modal, ModalHeader, ModalFooter } from "@/components/ui/Modal";
import type { Game, GameInput } from "@/types/pywebview";

/**
 * Properties for the {@link AddGameModal} component.
 */
interface AddGameModalProps {
  /** Whether the modal is visible. */
  open: boolean;
  /** Game being edited, or `null` when creating a new one. */
  initial: Game | null;
  /** Request to close the modal. */
  onClose: () => void;
}

type AssetKind = "icos" | "logos" | "scenes";

/** Form state structure representing a game installation. */
interface GameFormState {
  name: string;
  expansion: string;
  exePath: string;
  bgVideo: string;
  icon: string;
  poster: string;
  showOnMain: boolean;
}

const initialFormState: GameFormState = {
  name: "",
  expansion: "wotlk",
  exePath: "",
  bgVideo: "",
  icon: "",
  poster: "",
  showOnMain: true,
};

/**
 * Modal to create or edit a game installation using a unified state object.
 */
export function AddGameModal({ open, initial, onClose }: AddGameModalProps) {
  const assets = useGamesStore((state) => state.assets);
  const addGame = useGamesStore((state) => state.addGame);
  const updateGame = useGamesStore((state) => state.updateGame);

  const [form, setForm] = useState<GameFormState>(initialFormState);
  const [busy, setBusy] = useState(false);

  /** Initialise or reset the form state whenever the modal opens. */
  useEffect(() => {
    if (!open) return;
    const defaults = assets?.expansions[initial?.expansion ?? "wotlk"];
    if (initial) {
      setForm({
        name: initial.name,
        expansion: initial.expansion,
        exePath: initial.exe_path,
        bgVideo: initial.bg_video,
        icon: initial.icon,
        poster: initial.poster,
        showOnMain: initial.show_on_main,
      });
    } else {
      setForm({
        name: defaults?.name ?? "",
        expansion: "wotlk",
        exePath: "",
        bgVideo: defaults?.video ?? "",
        icon: defaults?.icon ?? "",
        poster: defaults?.poster ?? "",
        showOnMain: true,
      });
    }
  }, [open, initial, assets]);

  /** Re-adjust default media when the expansion changes. */
  function handleExpansionChange(value: string) {
    const def = assets?.expansions[value];
    setForm((prev) => ({
      ...prev,
      expansion: value,
      name: def ? def.name : prev.name,
      bgVideo: def ? def.video : prev.bgVideo,
      icon: def ? def.icon : prev.icon,
      poster: def ? def.poster : prev.poster,
    }));
  }

  /** Open a native dialog to pick the executable. */
  async function pickExe() {
    const picked = await api.selectExe();
    if (picked) setForm((prev) => ({ ...prev, exePath: picked }));
  }

  /** Open a native dialog to import a custom asset of the given kind. */
  async function pickCustom(kind: AssetKind) {
    const picked = await api.selectCustomAsset(kind);
    if (!picked) return;
    setForm((prev) => ({
      ...prev,
      icon: kind === "icos" ? picked : prev.icon,
      poster: kind === "logos" ? picked : prev.poster,
      bgVideo: kind === "scenes" ? picked : prev.bgVideo,
    }));
  }

  /** Build the payload and persist (create or update). */
  async function handleSave() {
    if (!form.name.trim() || !form.exePath.trim()) return;
    setBusy(true);
    const payload: GameInput = {
      name: form.name.trim(),
      expansion: form.expansion,
      exe_path: form.exePath,
      bg_video: form.bgVideo,
      icon: form.icon,
      poster: form.poster,
      show_on_main: form.showOnMain,
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

  const videoOptions: SelectOption[] = [...new Set([form.bgVideo, ...(assets?.available_videos ?? [])])]
    .filter(Boolean)
    .map((path) => ({ value: path, label: fileName(path) }));

  const iconOptions: SelectOption[] = [...new Set([form.icon, ...(assets?.available_icons ?? [])])]
    .filter(Boolean)
    .map((path) => ({ value: path, label: fileName(path), thumb: toDisplaySrc(path) }));

  const posterOptions: SelectOption[] = [...new Set([form.poster, ...(assets?.available_posters ?? [])])]
    .filter(Boolean)
    .map((path) => ({ value: path, label: fileName(path), thumb: toDisplaySrc(path) }));

  return (
    <Modal open={open} onClose={onClose} className="h-135 w-full max-w-3xl">
      <ModalHeader
        icon="fa-solid fa-gamepad"
        title={initial ? "Editar juego" : "Añadir juego"}
        onClose={onClose}
      />

      <div className="flex min-h-0 flex-1">
        <div className="flex w-72 shrink-0 flex-col gap-5 overflow-y-auto border-r border-(--border) p-6">
          <div className="flex flex-col gap-3">
            <span className="section-label">
              <i className="fa-solid fa-circle-info" />
              Información básica
            </span>

            <div className="flex flex-col gap-1.5">
              <label className="field-label">Nombre</label>
              <input
                className="field-input"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Mi WoW 3.3.5a"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="field-label">Expansión</label>
              <Select value={form.expansion} options={expansionOptions} onChange={handleExpansionChange} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="field-label">Ejecutable (.exe)</label>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-(--border-strong) bg-(--bg-input)">
                    <i className="fa-solid fa-file-invoice text-[13px] text-(--muted)" />
                  </div>
                  <input
                    className="field-input flex-1 truncate"
                    value={form.exePath}
                    readOnly
                    placeholder="Selecciona wow.exe"
                    title={form.exePath}
                  />
                </div>
                <button className="ghost-btn w-full rounded-lg px-3 py-2 text-[12px] cursor-pointer" onClick={pickExe}>
                  <i className="fa-solid fa-folder-open mr-1.5" />
                  Buscar
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto p-6">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <span className="section-label">
                <i className="fa-solid fa-photo-film" />
                Multimedia
              </span>

              <div className="flex flex-col gap-2">
                <label className="field-label">Video de fondo</label>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Select value={form.bgVideo} options={videoOptions} onChange={(val) => setForm((prev) => ({ ...prev, bgVideo: val }))} placeholder="Selecciona un video" />
                  </div>
                  <button className="icon-btn cursor-pointer" title="Usar archivo personalizado" onClick={() => pickCustom("scenes")}>
                    <i className="fa-solid fa-upload text-[12px]" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="field-label">Ícono</label>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Select value={form.icon} options={iconOptions} onChange={(val) => setForm((prev) => ({ ...prev, icon: val }))} placeholder="Selecciona un ícono" />
                  </div>
                  <button className="icon-btn cursor-pointer" title="Usar archivo personalizado" onClick={() => pickCustom("icos")}>
                    <i className="fa-solid fa-upload text-[12px]" />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="field-label">Póster</label>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Select value={form.poster} options={posterOptions} onChange={(val) => setForm((prev) => ({ ...prev, poster: val }))} placeholder="Selecciona un póster" />
                  </div>
                  <button className="icon-btn cursor-pointer" title="Usar archivo personalizado" onClick={() => pickCustom("logos")}>
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
                  {form.icon ? (
                    <img src={toDisplaySrc(form.icon)} alt="" className="h-full w-full object-contain p-1.5" />
                  ) : (
                    <i className="fa-solid fa-gamepad text-(--muted-2)" />
                  )}
                </div>
                <div className="h-14 w-24 shrink-0 overflow-hidden rounded-lg border border-(--border-strong) bg-(--bg-card)">
                  {form.poster ? <img src={toDisplaySrc(form.poster)} alt="" className="h-full w-full object-cover" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-(--text)">{form.name || "Nombre del juego"}</p>
                  <p className="text-[11px] uppercase tracking-wide text-(--muted)">{form.expansion}</p>
                </div>
              </div>

              <Checkbox checked={form.showOnMain} onChange={(val) => setForm((prev) => ({ ...prev, showOnMain: val }))} label="Mostrar en la pantalla de inicio" />
            </div>
          </div>
        </div>
      </div>

      <ModalFooter>
        <button className="ghost-btn rounded-lg px-4 py-2 text-[13px] cursor-pointer" onClick={onClose}>
          Cancelar
        </button>
        <button
          className="play-btn rounded-lg px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40 cursor-pointer"
          onClick={handleSave}
          disabled={busy || !form.name.trim() || !form.exePath.trim()}
        >
          {busy ? "Guardando..." : initial ? "Guardar" : "Añadir"}
        </button>
      </ModalFooter>
    </Modal>
  );
}