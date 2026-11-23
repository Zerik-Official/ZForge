/**
 * Properties for the {@link PageState} component.
 */
interface PageStateProps {
  /** Error to show instead of the loading spinner. */
  error: string | null;
}

/**
 * Placeholder for a page whose data is still loading or failed to load.
 */
export function PageState({ error }: PageStateProps) {
  return (
    <div className="flex h-full min-h-60 items-center justify-center px-12 pt-10 text-(--muted)">
      {error ? (
        <span className="flex items-center gap-2 text-[13px] text-(--danger)">
          <i className="fa-solid fa-circle-exclamation" />
          {error}
        </span>
      ) : (
        <i className="fa-solid fa-spinner fa-spin text-[18px]" aria-hidden="true" />
      )}
    </div>
  );
}
