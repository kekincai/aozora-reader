import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { getPaginationItems } from './pagination-model'

type PaginationProps = {
  page: number
  totalPages: number
  totalItems?: number
  onPageChange: (page: number) => void
  label?: string
}

export function Pagination({ page, totalPages, totalItems, onPageChange, label = '分页' }: PaginationProps) {
  if (totalPages <= 1) return totalItems === undefined ? null : <p className="pagination-summary">共 {totalItems.toLocaleString()} 条</p>
  const items = getPaginationItems(page, totalPages)
  const go = (nextPage: number) => {
    if (nextPage !== page && nextPage >= 1 && nextPage <= totalPages) onPageChange(nextPage)
  }
  return <nav className="pagination" aria-label={label}>
    <p className="pagination-summary"><strong>第 {page} / {totalPages} 页</strong>{totalItems !== undefined && <span>共 {totalItems.toLocaleString()} 条</span>}</p>
    <div className="pagination-controls">
      <button className="pagination-edge" onClick={() => go(1)} disabled={page === 1} aria-label="第一页"><ChevronsLeft size={16}/></button>
      <button className="pagination-step" onClick={() => go(page - 1)} disabled={page === 1}><ChevronLeft size={16}/><span>上一页</span></button>
      <div className="pagination-pages">
        {items.map(item => typeof item === 'number'
          ? <button key={item} className={item === page ? 'active' : ''} aria-current={item === page ? 'page' : undefined} aria-label={`第 ${item} 页`} onClick={() => go(item)}>{item}</button>
          : <span key={item} aria-hidden="true">…</span>)}
      </div>
      <button className="pagination-step" onClick={() => go(page + 1)} disabled={page === totalPages}><span>下一页</span><ChevronRight size={16}/></button>
      <button className="pagination-edge" onClick={() => go(totalPages)} disabled={page === totalPages} aria-label="最后一页"><ChevronsRight size={16}/></button>
    </div>
  </nav>
}
