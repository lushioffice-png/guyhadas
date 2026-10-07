// A stored source URL, shown in full (never shortened or rewritten), kept
// LTR inside the RTL layout and wrapping instead of breaking the layout.
export function SourceLink({ url }: { url: string }) {
  return (
    <>
      <span className="url-text">{url}</span>
      <a className="link-quiet" href={url} target="_blank" rel="noreferrer">
        פתח עמוד ↗
      </a>
    </>
  );
}
