export type PaginationItem = number | 'ellipsis-left' | 'ellipsis-right'

/** Keeps five neighboring pages visible while preserving first and last jumps. */
export function getPaginationItems(currentPage: number, totalPages: number, siblings = 5): PaginationItem[] {
  if (totalPages <= 0) return []
  const current = Math.min(totalPages, Math.max(1, currentPage))
  const start = Math.max(1, current - siblings)
  const end = Math.min(totalPages, current + siblings)
  const items: PaginationItem[] = []
  if (start > 1) {
    items.push(1)
    if (start > 2) items.push('ellipsis-left')
  }
  for (let page = start; page <= end; page += 1) items.push(page)
  if (end < totalPages) {
    if (end < totalPages - 1) items.push('ellipsis-right')
    items.push(totalPages)
  }
  return items
}
