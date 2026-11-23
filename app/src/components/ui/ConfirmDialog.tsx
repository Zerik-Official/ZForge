import { Modal } from "@/components/ui/Modal";

/**
 * Properties for the {@link ConfirmDialog} component.
 */
interface ConfirmDialogProps {
  /** Shows the confirm button in the danger color, for actions that delete something. */
  destructive?: boolean;
  /** Controls whether the dialog is visible. */
  open: boolean;
  /** FontAwesome icon class applied to the leading badge. */
  icon?: string;
  /** Main message heading displayed in the dialog. */
  title: string;
  /** Supporting text shown beneath the title. */
  description: string;
  /** Label used for the confirmation action button. @default "Sí" */
  confirmLabel?: string;
  /** Label used for the cancel action button. @default "No" */
  cancelLabel?: string;
  /** Callback fired when the user confirms the action. */
  onConfirm: () => void;
  /** Callback fired when the user cancels or closes the prompt. */
  onCancel: () => void;
}

/**
 * Small confirm/cancel prompt built on the shared `Modal` shell.
 *
 * Intended for destructive or high-impact actions where a quick confirmation is
 * needed before proceeding.
 *
 * @example
 * ```tsx
 * <ConfirmDialog
 *   open={isOpen}
 *   title="Update game"
 *   description="This will download the latest patch and restart the launcher."
 *   onConfirm={handleConfirm}
 *   onCancel={() => setIsOpen(false)}
 * />
 * ```
 */
export function ConfirmDialog({
  open,
  icon = "fa-solid fa-cloud-arrow-up",
  title,
  description,
  confirmLabel = "Sí",
  cancelLabel = "No",
  onConfirm,
  onCancel,
  destructive = false,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onCancel} className="w-full max-w-sm" closeOnBackdropClick={false}>
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-start gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[7px] ${destructive ? "bg-(--danger)/12" : "bg-(--bg-elevated)"}`}>
            <i className={`${icon} text-[14px] ${destructive ? "text-(--danger)" : "text-(--primary)"}`} />
          </div>
          <div className="flex flex-col gap-1.5">
            <h3 className="text-[15px] font-semibold text-(--text)">{title}</h3>
            <p className="text-[13px] leading-relaxed text-(--muted)">{description}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button className="ghost-btn rounded-[7px] px-4 py-2 text-[13px] cursor-pointer" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={`rounded-[7px] px-4 py-2 text-[13px] font-semibold cursor-pointer ${
              destructive ? "bg-(--danger) text-(--on-primary) transition-[filter] hover:brightness-110" : "play-btn"
            }`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
