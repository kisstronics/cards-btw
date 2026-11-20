export function Loader({
  label = 'Loading…',
  size = 'md',
  overlay = false,
}: {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Full-area dimmed overlay (e.g. over bet tray / table). */
  overlay?: boolean;
}) {
  const body = (
    <div
      className={`app-loader size-${size}${overlay ? ' is-overlay' : ''}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="app-loader-spin" aria-hidden="true" />
      {label ? (
        <span className="app-loader-label">{label}</span>
      ) : (
        <span className="sr-only">Loading</span>
      )}
    </div>
  );

  if (!overlay) return body;

  return <div className="app-loader-overlay">{body}</div>;
}
