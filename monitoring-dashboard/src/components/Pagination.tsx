import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import ThemedSelect from './ThemedSelect'

const PAGE_SIZE_OPTIONS = [6, 8, 10, 12, 20, 50]

export function usePagination<T>(items: T[], initialPageSize = 10) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSizeState] = useState(initialPageSize)
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize))

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount))
  }, [pageCount])

  const pageItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize]
  )

  const setPageSize = (size: number) => {
    setPageSizeState(size)
    setPage(1)
  }

  return { page, pageSize, pageCount, pageItems, setPage, setPageSize, resetPage: () => setPage(1) }
}

export default function Pagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  itemLabel = 'records',
}: {
  page: number
  pageSize: number
  totalItems: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  itemLabel?: string
}) {
  if (totalItems <= 0) return null
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize))
  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, totalItems)
  const pages = Array.from({ length: pageCount }, (_, index) => index + 1)
    .filter((value) => value === 1 || value === pageCount || Math.abs(value - page) <= 1)

  return (
    <nav aria-label={`${itemLabel} pagination`} className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] px-4 py-3">
      <div className="flex items-center gap-3 text-xs font-semibold text-[var(--muted-foreground)]">
        <span>Showing {start}–{end} of {totalItems} {itemLabel}</span>
        <label className="hidden items-center gap-2 sm:flex">
          <span>Rows</span>
          <div className="w-[5.25rem]">
            <ThemedSelect
              value={String(pageSize)}
              onChange={(value) => onPageSizeChange(Number(value))}
              options={PAGE_SIZE_OPTIONS.map((size) => ({ value: String(size), label: String(size) }))}
              className="min-h-8 py-1 text-xs"
              showIndicator={false}
            />
          </div>
        </label>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center gap-1.5">
          <PageButton label="Previous page" disabled={page === 1} onClick={() => onPageChange(page - 1)}><ChevronLeft size={15} /></PageButton>
          {pages.map((value, index) => {
            const previous = pages[index - 1]
            return (
              <span key={value} className="contents">
                {previous && value - previous > 1 && <span className="px-1 text-xs text-[var(--muted-foreground)]">…</span>}
                <button
                  type="button"
                  onClick={() => onPageChange(value)}
                  aria-label={`Page ${value}`}
                  aria-current={value === page ? 'page' : undefined}
                  className={`flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-xs font-bold transition ${
                    value === page
                      ? 'border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]'
                      : 'border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {value}
                </button>
              </span>
            )
          })}
          <PageButton label="Next page" disabled={page === pageCount} onClick={() => onPageChange(page + 1)}><ChevronRight size={15} /></PageButton>
        </div>
      )}
    </nav>
  )
}

function PageButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] transition hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  )
}
