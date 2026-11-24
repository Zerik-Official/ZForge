import { useState } from "react";
import { api } from "@/services/api";
import { useGamesStore } from "@/store/gamesStore";
import { toDisplaySrc } from "@/utils/asset";
import { Select, type SelectOption } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import { Modal, ModalHeader, ModalFooter } from "@/components/ui/Modal";
import { t, useLocale } from "@/locales/i18n";
import { TooltipSimple } from "@/components/ui/Tooltip";
import type { Game, GameDraft } from "@/types/domains/game";

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
  box: string;
  showOnMain: boolean;
}

const initialFormState: GameFormState = {
  name: "",
  expansion: "wotlk",
  exePath: "",
  bgVideo: "",
  icon: "",
  poster: "",
  box: "",
  showOnMain: true,
};

/**
 * Modal to create or edit a game installation using a unified state object.
 */
export function AddGameModal({ open, initial, onClose }: AddGameModalProps) {
  useLocale();
  const assets = useGamesStore((state) => state.assets);
  const addGame = useGamesStore((state) => state.addGame);
  const updateGame = useGamesStore((state) => state.updateGame);

  const [form, setForm] = useState<GameFormState>(initialFormState);
  const [busy, setBusy] = useState(false);

  /** Initialise or reset the form state whenever the modal opens or its source data changes. */
  const [formSource, setFormSource] = useState({ open: false, initial, assets });
  if (formSource.open !== open || formSource.initial !== initial || formSource.assets !== assets) {
    setFormSource({ open, initial, assets });
    if (open) {
      const defaults = assets?.expansions[initial?.expansion ?? "wotlk"];
      if (initial) {
        setForm({
          name: initial.name,
          expansion: initial.expansion,
          exePath: initial.exe_path,
          bgVideo: initial.bg_video,
          icon: initial.icon,
          poster: initial.poster,
          box: initial.box || defaults?.box || "",
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
          box: defaults?.box ?? "",
          showOnMain: true,
        });
      }
    }
  }

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
      box: def ? (def.box as string) : prev.box,
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
    const payload: GameDraft = {
      name: form.name.trim(),
      expansion: form.expansion,
      exe_path: form.exePath,
      bg_video: form.bgVideo,
      icon: form.icon,
      poster: form.poster,
      box: form.box,
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

  const expansions = assets ? Object.entries(assets.expansions) : [];
  const expansionName = assets?.expansions?.[form.expansion]?.name ?? form.expansion;

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
    <Modal open={open} onClose={onClose} className="h-[min(620px,92vh)] w-full max-w-265 flex-row!">
      <section
        className="relative hidden min-w-0 flex-1 overflow-hidden bg-black md:block"
        aria-label={t("addGame.preview")}
      >
        {form.bgVideo ? (
          <video
            key={form.bgVideo}
            className="absolute inset-0 h-full w-full object-cover animate-[fadeIn_0.45s_ease_both]"
            src={toDisplaySrc(form.bgVideo)}
            autoPlay
            muted
            loop
            playsInline
          />
        ) : null}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--bg)_55%,transparent)_0%,transparent_30%,transparent_48%,color-mix(in_srgb,var(--bg)_82%,transparent)_80%,var(--bg-card)_100%)]" />

        {form.poster ? (
          <img
            key={form.poster}
            src={toDisplaySrc(form.poster)}
            alt=""
            draggable={false}
            className="absolute top-6 left-7 max-h-27 max-w-70 object-contain drop-shadow-[0_6px_18px_rgba(0,0,0,0.55)] animate-[fadeIn_0.35s_ease_both]"
          />
        ) : null}
        <span className="absolute top-6 right-6 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-medium text-white/75 backdrop-blur-sm">
          {t("addGame.previewHint")}
        </span>

        <div className="absolute inset-x-7 bottom-6 flex items-end gap-5">
          {form.box ? (
            <img
              key={form.box}
              src={toDisplaySrc(form.box)}
              alt=""
              draggable={false}
              className="h-40 w-auto shrink-0 rounded-md shadow-[0_14px_32px_rgba(0,0,0,0.6)] animate-[popIn_0.3s_ease-out_both]"
            />
          ) : null}
          <div className="flex min-w-0 flex-col gap-2 pb-1">
            <span className="text-[12px] font-medium text-(--text-soft)">{expansionName}</span>
            <h3 className="truncate text-[26px] leading-[1.1] font-[650] text-(--text) [font-family:var(--font-heading,inherit)] [font-stretch:115%]">
              {form.name.trim() || t("addGame.previewGame")}
            </h3>
            <span className="flex items-center gap-2 text-[12px] text-(--muted)">
              <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-[7px] border border-(--border-strong) bg-(--bg-elevated)">
                {form.icon ? <img src={toDisplaySrc(form.icon)} alt="" className="h-5 w-5 object-contain" /> : null}
              </span>
              {form.showOnMain ? t("addGame.onHome") : t("addGame.notOnHome")}
            </span>
          </div>
        </div>
      </section>

      <div className="flex w-full shrink-0 flex-col border-l border-(--border) md:w-95">
        <ModalHeader
          icon="fa-solid fa-gamepad"
          title={initial ? t("common.editGame") : t("common.addGame")}
          onClose={onClose}
        />

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5 will-change-transform">
          <div className="flex flex-col gap-2">
            <span className="field-label">{t("addGame.expansion")}</span>
            <div role="radiogroup" aria-label={t("addGame.expansion")} className="grid grid-cols-3 gap-2">
              {expansions.map(([key, media]) => {
                const selected = form.expansion === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => handleExpansionChange(key)}
                    className={`group flex flex-col gap-1.5 rounded-lg p-1.5 text-left transition-colors cursor-pointer ${
                      selected ? "bg-(--bg-hover) ring-2 ring-(--primary)" : "hover:bg-(--bg-elevated)"
                    }`}
                  >
                    <span className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-md bg-black">
                      <img
                        src={toDisplaySrc(media.box || media.poster)}
                        alt=""
                        draggable={false}
                        className={`h-full w-full object-cover transition-[opacity,scale] duration-200 ${
                          selected ? "opacity-100" : "opacity-65 group-hover:scale-[1.03] group-hover:opacity-90"
                        }`}
                      />
                    </span>
                    <span className={`line-clamp-2 text-[11px] leading-tight ${selected ? "text-(--text)" : "text-(--muted)"}`}>
                      {media.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="field-label" htmlFor="add-game-name">{t("addGame.name")}</label>
            <input
              id="add-game-name"
              className="field-input"
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder={t("addGame.namePlaceholder")}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="field-label">{t("addGame.executable")}</span>
            <div className="flex items-center gap-2">
              <TooltipSimple content={form.exePath || t("addGame.selectExe")} side="top" align="center" sideOffset={6}>
                <input
                  className="field-input min-w-0 flex-1 truncate cursor-pointer"
                  value={form.exePath ? fileName(form.exePath) : ""}
                  readOnly
                  onClick={pickExe}
                  placeholder={t("addGame.selectExe")}
                />
              </TooltipSimple>
              <button className="ghost-btn shrink-0 rounded-lg px-3 py-2 text-[12px] cursor-pointer" onClick={pickExe}>
                <i className="fa-solid fa-folder-open mr-1.5" />
                {t("common.search")}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <span className="text-[13px] font-semibold text-(--text-soft)">{t("addGame.multimedia")}</span>
            <MediaField
              label={t("addGame.videoBg")}
              value={form.bgVideo}
              options={videoOptions}
              placeholder={t("addGame.selectVideo")}
              onChange={(val) => setForm((prev) => ({ ...prev, bgVideo: val }))}
              onUpload={() => void pickCustom("scenes")}
            />
            <MediaField
              label={t("addGame.poster")}
              value={form.poster}
              options={posterOptions}
              placeholder={t("addGame.selectPoster")}
              onChange={(val) => setForm((prev) => ({ ...prev, poster: val }))}
              onUpload={() => void pickCustom("logos")}
            />
            <MediaField
              label={t("addGame.icon")}
              value={form.icon}
              options={iconOptions}
              placeholder={t("addGame.selectIcon")}
              onChange={(val) => setForm((prev) => ({ ...prev, icon: val }))}
              onUpload={() => void pickCustom("icos")}
            />
          </div>

          <Checkbox
            checked={form.showOnMain}
            onChange={(val) => setForm((prev) => ({ ...prev, showOnMain: val }))}
            label={t("addGame.showOnHome")}
          />
        </div>

        <ModalFooter>
          <button className="ghost-btn rounded-lg px-4 py-2 text-[13px] cursor-pointer" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            className="play-btn rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-40 cursor-pointer"
            onClick={handleSave}
            disabled={busy || !form.name.trim() || !form.exePath.trim()}
          >
            {busy ? t("common.saving") : initial ? t("common.save") : t("common.add")}
          </button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

interface MediaFieldProps {
  label: string;
  value: string;
  options: SelectOption[];
  placeholder: string;
  onChange: (value: string) => void;
  onUpload: () => void;
}

/** A media picker: the bundled files in a dropdown and a button to use a file of the user. */
function MediaField({ label, value, options, placeholder, onChange, onUpload }: MediaFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="field-label">{label}</span>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Select value={value} options={options} onChange={onChange} placeholder={placeholder} />
        </div>
        <TooltipSimple content={t("addGame.useCustom")} side="top">
          <button className="icon-btn cursor-pointer" onClick={onUpload} aria-label={t("addGame.useCustom")}>
            <i className="fa-solid fa-upload text-[12px]" />
          </button>
        </TooltipSimple>
      </div>
    </div>
  );
}
