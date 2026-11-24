import type { ReactNode } from "react";

/**
 * Properties for the {@link SettingsPage} component.
 */
interface SettingsPageProps {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons shown to the right of the title. */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Layout of a page in the main area: a large title, a short description and the content below.
 */
export function SettingsPage({ title, description, actions, children }: SettingsPageProps) {
  return (
    <div className="mx-auto flex w-full max-w-190 flex-col gap-7 px-12 pt-12 pb-12">
      <header className="flex items-start justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-2.5">
          <h1 className="text-[26px] leading-[1.15] font-[650] text-(--text)">{title}</h1>
          {description ? <p className="max-w-[64ch] text-[13.5px] leading-relaxed text-(--muted)">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2 pt-1">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}

/**
 * Properties for the {@link SettingsGroup} component.
 */
interface SettingsGroupProps {
  title?: ReactNode;
  /** Text or controls shown to the right of the group title. */
  aside?: ReactNode;
  children: ReactNode;
}

/**
 * A titled block of rows sharing one panel, with thin dividers between rows.
 */
export function SettingsGroup({ title, aside, children }: SettingsGroupProps) {
  return (
    <section className="flex flex-col gap-2.5">
      {title || aside ? (
        <div className="flex items-center justify-between gap-4 px-0.5">
          {title ? <h2 className="text-[14px] font-semibold text-(--text-soft) [font-stretch:100%] tracking-normal">{title}</h2> : <span />}
          {aside}
        </div>
      ) : null}
      <div className="rounded-(--radius) border border-(--border) bg-(--bg-card) [&>*+*]:border-t [&>*+*]:border-(--border) [&>*:first-child]:rounded-t-[inherit] [&>*:last-child]:rounded-b-[inherit]">
        {children}
      </div>
    </section>
  );
}

/**
 * Properties for the {@link SettingsRow} component.
 */
interface SettingsRowProps {
  label: ReactNode;
  description?: ReactNode;
  /** Font Awesome class of an optional icon tile on the left. */
  icon?: string;
  /** Control on the right side of the row. */
  control?: ReactNode;
  /** Extra content below the label, such as a status line. */
  children?: ReactNode;
  disabled?: boolean;
}

/**
 * One setting: label and description on the left, its control on the right.
 */
export function SettingsRow({ label, description, icon, control, children, disabled }: SettingsRowProps) {
  return (
    <div className={`flex items-center gap-3.5 px-4.5 py-3.25 ${disabled ? "opacity-55" : ""}`}>
      {icon ? (
        <span className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-[7px] bg-(--bg-elevated) text-[13px] text-(--muted)">
          <i className={icon} />
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-0.75">
        <span className="text-[13.5px] font-[550] text-(--text)">{label}</span>
        {description ? <span className="text-[12.5px] leading-snug text-(--muted)">{description}</span> : null}
        {children}
      </div>
      {control ? <div className="flex shrink-0 items-center gap-2">{control}</div> : null}
    </div>
  );
}
