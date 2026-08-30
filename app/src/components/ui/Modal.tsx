import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Properties for the {@link Modal} component.
 */
interface ModalProps {
  /** Controls the visibility state of the modal. */
  open: boolean;
  /** Callback fired when the modal requests to close (via backdrop, escape key, or close button). */
  onClose: () => void;
  /**
   * Width/height utility classes for the modal card container. @default "w-full max-w-lg max-h-[88vh]"
   */
  className?: string;
  /** The content elements rendered inside the modal body/structure. */
  children: ReactNode;
  /** If true, clicking outside the modal content container triggers `onClose`. @default true */
  closeOnBackdropClick?: boolean;
}

/**
 * Portal-based modal shell rendered directly into `document.body`.
 *
 * @example
 * ```tsx
 * <Modal onClose="{()" open="{isOpen}"> setIsOpen(false)}>
 *   <ModalHeader icon="fa-solid fa-gamepad" onClose="{()" title="Add Game"> setIsOpen(false)} />
 *   <ModalBody>Form content goes here...</ModalBody>
 *   <ModalFooter><Button onClick="{()"> setIsOpen(false)}>Cancel</Button></ModalFooter>
 * </Modal>
 * ```
 */
export function Modal({
  open,
  onClose,
  className = "w-full max-w-lg max-h-[88vh]",
  children,
  closeOnBackdropClick = true,
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 animate-[fadeIn_0.18s_ease_both]"
      onClick={closeOnBackdropClick ? onClose : undefined}
    >
      <div
        className={`flex flex-col overflow-hidden rounded-2xl border border-(--border-strong) bg-(--bg-elevated) shadow-2xl animate-[popIn_0.22s_cubic-bezier(0.34,1.56,0.64,1)_both] ${className}`}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Properties for the {@link ModalHeader} component.
 */
interface ModalHeaderProps {
  /** FontAwesome icon class string rendered in the header badge. */
  icon: string;
  /** Main title heading text. */
  title: string;
  /** Optional secondary subtitle text displayed beneath the title. */
  subtitle?: string;
  /** Callback fired when clicking the close button. */
  onClose: () => void;
}

/** Standard modal header featuring an icon badge, title, optional subtitle, and close button. */
export function ModalHeader({ icon, title, subtitle, onClose }: ModalHeaderProps) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-(--border) px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-(--border-strong) bg-(--primary-soft)">
          <i className={`${icon} text-[13px] text-(--primary-hover)`} />
        </div>
        <div className="flex flex-col">
          <h2 className="text-[14.5px] font-semibold text-(--text)">{title}</h2>
          {subtitle ? <span className="text-[11px] text-(--muted)">{subtitle}</span> : null}
        </div>
      </div>
      <button
        className="flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-lg border border-(--border-strong) bg-(--bg-elevated) text-(--muted) transition-colors hover:bg-(--bg-hover) hover:text-(--text-soft) cursor-pointer"
        onClick={onClose}
      >
        <i className="fa-solid fa-xmark text-[13px]" />
      </button>
    </div>
  );
}

/**
 * Properties for the {@link ModalBody} component.
 */
interface ModalBodyProps {
  /** Content to display within the scrollable body container. */
  children: ReactNode;
  /** Additional CSS utility classes to override or extend layout behavior. */
  className?: string;
}

/**
 * Scrollable modal content area.
 *
 * Utilizes `min-h-0` to guarantee correct flex layout behavior and prevent stale-paint bugs 
 * inside height-capped flex containers.
 */
export function ModalBody({ children, className = "" }: ModalBodyProps) {
  return (
    <div className={`flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5 ${className}`}>{children}</div>
  );
}

/**
 * Properties for the {@link ModalFooter} component.
 */
interface ModalFooterProps {
  /** Action elements (typically buttons) rendered inside the footer. */
  children: ReactNode;
}

/** Right-aligned action button container pinned to the bottom of the modal. */
export function ModalFooter({ children }: ModalFooterProps) {
  return (
    <div className="flex shrink-0 items-center justify-end gap-2 border-t border-(--border) px-6 py-4">
      {children}
    </div>
  );
}