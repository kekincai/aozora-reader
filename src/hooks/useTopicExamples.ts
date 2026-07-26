import { useEffect, useState } from 'react'
import { searchTopicExamples, type TopicExample } from '../catalog'

/**
 * Owns the asynchronous paging contract for a topic corpus. Topic pages only
 * choose filters and render results; cancellation and stale responses stay here.
 */
export function useTopicExamples(form: string, query: string, pageSize: number) {
  const [examples, setExamples] = useState<TopicExample[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      setLoading(true)
      void searchTopicExamples(form, query, page, pageSize)
        .then(result => {
          if (!active) return
          setExamples(result.examples)
          setPage(result.page.page)
          setTotal(result.page.total)
          setTotalPages(result.page.totalPages)
          setError('')
        })
        .catch(cause => {
          if (!active) return
          setExamples([])
          setTotal(0)
          setTotalPages(1)
          setError(cause instanceof Error ? cause.message : '用例を読み込めませんでした。')
        })
        .finally(() => { if (active) setLoading(false) })
    }, query ? 300 : 0)
    return () => { active = false; window.clearTimeout(timer) }
  }, [form, query, page, pageSize])

  return { examples, page, setPage, total, totalPages, loading, error, resetPage: () => setPage(1) }
}
