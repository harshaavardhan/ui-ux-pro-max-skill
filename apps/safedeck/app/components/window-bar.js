// macOS-style window chrome: traffic-light dots + centered title.
export function WindowBar({ title }) {
  return (
    <div className="window-bar">
      <span className="traffic-dots" aria-hidden="true">
        <i /><i /><i />
      </span>
      {title != null && <span className="wb-title">{title}</span>}
    </div>
  );
}
