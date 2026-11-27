import { useEffect, useState } from "react";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/Modal";
import { t, useLocale } from "@/locales/i18n";
import { bootApi, errorCode } from "@/services/api";
import { onUpdateProgress, subscribe } from "@/services/api/events";
import type { UpdateInfo, UpdateProgress } from "@/types/domains/boot";
import { formatBytes } from "@/utils/formatters";

interface UpdateDialogProps {
  update: UpdateInfo;
  onClose: () => void;
}

/** Release notes without the Markdown marks, line by line. */
function plainNotes(notes: string): string[] {
  return notes
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^#{1,6}\s+/, "")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"),
    )
    .filter((line, index, lines) => line.trim() !== "" || (index > 0 && lines[index - 1].trim() !== ""));
}

/**
 * Tells that a newer launcher version is published, with its notes, and installs it.
 * The launcher restarts by itself once the installer finishes.
 */
export function UpdateDialog({ update, onClose }: UpdateDialogProps) {
  useLocale();
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribe(onUpdateProgress(setProgress)), []);

  async function install() {
    setInstalling(true);
    setError(null);
    try {
      await bootApi.installUpdate();
    } catch (e) {
      setInstalling(false);
      setError(t(`common.errors.codes.${errorCode(e)}`));
    }
  }

  const percent = progress?.total ? Math.min(100, (progress.downloaded / progress.total) * 100) : null;

  return (
    <Modal open onClose={installing ? () => undefined : onClose} className="w-full max-w-lg max-h-[80vh]">
      <ModalHeader
        icon="fa-solid fa-circle-arrow-up"
        title={t("update.title", { version: update.version })}
        subtitle={t("update.subtitle", { current: update.currentVersion })}
        onClose={installing ? () => undefined : onClose}
      />
      <ModalBody className="gap-3">
        {update.notes ? (
          <div className="flex flex-col gap-1 text-[12.5px] leading-relaxed text-(--text-soft)">
            {plainNotes(update.notes).map((line, index) => (
              <p key={index} className={line.trim().startsWith("- ") ? "pl-3" : ""}>
                {line}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-[12.5px] text-(--muted)">{t("update.noNotes")}</p>
        )}
        {installing ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[12px] text-(--muted)">
              <span>{t("update.downloading")}</span>
              <span className="tabular-nums">
                {progress ? `${formatBytes(progress.downloaded)}${progress.total ? ` / ${formatBytes(progress.total)}` : ""}` : ""}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-(--bg-input)">
              <div
                className="h-full bg-(--primary) transition-[width] duration-200"
                style={{ width: `${percent ?? 0}%` }}
              />
            </div>
          </div>
        ) : null}
        {error ? <span className="text-[12px] text-(--danger)">{error}</span> : null}
      </ModalBody>
      <ModalFooter>
        <button
          className="ghost-btn rounded-lg px-4 py-2 text-[13px] disabled:opacity-40 cursor-pointer"
          onClick={onClose}
          disabled={installing}
        >
          {t("update.later")}
        </button>
        <button
          className="play-btn rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-40 cursor-pointer"
          onClick={() => void install()}
          disabled={installing}
        >
          {installing ? t("update.installing") : t("update.install")}
        </button>
      </ModalFooter>
    </Modal>
  );
}
