import { useEffect, useState } from "react";

// Client-side pagination for long lists/tables.
export function usePagination<T>(items: T[], pageSize: number, resetKey?: unknown) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  useEffect(() => setPage(0), [resetKey]);
  const safe = Math.min(page, pageCount - 1);
  return {
    page: safe,
    pageCount,
    setPage,
    rows: items.slice(safe * pageSize, safe * pageSize + pageSize),
    from: items.length ? safe * pageSize + 1 : 0,
    to: Math.min(items.length, safe * pageSize + pageSize),
    total: items.length
  };
}

export function Pager({ page, pageCount, setPage, from, to, total }: { page: number; pageCount: number; setPage: (p: number) => void; from: number; to: number; total: number }) {
  if (total === 0) return null;
  return (
    <nav className="pager" aria-label="עימוד">
      <span className="pager-info">{from}–{to} מתוך {total}</span>
      {pageCount > 1 && (
        <span className="pager-buttons">
          <button type="button" className="btn btn-quiet btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>הקודם</button>
          <span className="pager-info">עמוד {page + 1} מתוך {pageCount}</span>
          <button type="button" className="btn btn-quiet btn-sm" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>הבא</button>
        </span>
      )}
    </nav>
  );
}
