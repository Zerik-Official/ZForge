import type { AddonSeverity } from "@/types/domains/addon";

/** Icon and colors of each severity. */
export const SEVERITY_STYLE: Record<AddonSeverity, { icon: string; text: string; badge: string }> = {
  danger: {
    icon: "fa-solid fa-triangle-exclamation",
    text: "text-(--danger)",
    badge: "bg-(--danger)/12 text-(--danger)",
  },
  warning: {
    icon: "fa-solid fa-circle-exclamation",
    text: "text-(--warning)",
    badge: "bg-(--warning)/12 text-(--warning)",
  },
  info: {
    icon: "fa-solid fa-circle-info",
    text: "text-(--info)",
    badge: "bg-(--bg-elevated) text-(--muted)",
  },
};
