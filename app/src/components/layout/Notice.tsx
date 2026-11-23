import type { ReactNode } from "react";

type NoticeTone = "warning" | "danger" | "info";

const TONES: Record<NoticeTone, { box: string; text: string }> = {
  warning: { box: "border-(--warning)/25 bg-(--warning)/8", text: "text-(--warning)" },
  danger: { box: "border-(--danger)/25 bg-(--danger)/8", text: "text-(--danger)" },
  info: { box: "border-(--info)/25 bg-(--info)/8", text: "text-(--info)" },
};

/**
 * Properties for the {@link Notice} component.
 */
interface NoticeProps {
  tone: NoticeTone;
  /** Font Awesome class of the icon. */
  icon: string;
  title: ReactNode;
  description?: ReactNode;
  /** Button or link on the right side. */
  action?: ReactNode;
  /** Extra content below, such as a progress bar. */
  children?: ReactNode;
}

/**
 * A highlighted message inside a page: a warning, an error or a hint, with an optional action.
 */
export function Notice({ tone, icon, title, description, action, children }: NoticeProps) {
  const colors = TONES[tone];
  return (
    <div className={`flex flex-col gap-3 rounded-(--radius) border px-4 py-3.5 ${colors.box}`}>
      <div className="flex items-start gap-3">
        <i className={`${icon} mt-0.5 text-[13px] ${colors.text}`} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={`text-[13px] font-semibold ${colors.text}`}>{title}</span>
          {description ? <span className="text-[12.5px] leading-relaxed text-(--text-soft)">{description}</span> : null}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
