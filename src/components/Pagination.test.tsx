// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Pagination } from './Pagination'
import { getPaginationItems } from './pagination-model'

afterEach(cleanup)

describe('getPaginationItems', () => {
  it('shows every page when the result is short', () => {
    expect(getPaginationItems(3, 6)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('keeps five pages on either side of the current page', () => {
    expect(getPaginationItems(20, 50)).toEqual([1, 'ellipsis-left', 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 'ellipsis-right', 50])
  })

  it('does not duplicate the first page near the beginning', () => {
    expect(getPaginationItems(4, 30)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 'ellipsis-right', 30])
  })

  it('does not duplicate the last page near the end', () => {
    expect(getPaginationItems(28, 30)).toEqual([1, 'ellipsis-left', 23, 24, 25, 26, 27, 28, 29, 30])
  })

  it('clamps a current page outside the available range', () => {
    expect(getPaginationItems(99, 3)).toEqual([1, 2, 3])
    expect(getPaginationItems(1, 0)).toEqual([])
  })
})

describe('Pagination', () => {
  it('announces the current page and total result count', () => {
    render(<Pagination page={6} totalPages={20} totalItems={20709} onPageChange={() => undefined}/>)
    expect(screen.getByText('第 6 / 20 页')).toBeTruthy()
    expect(screen.getByText('共 20,709 条')).toBeTruthy()
    expect(screen.getByRole('button', { name: '第 6 页' }).getAttribute('aria-current')).toBe('page')
  })

  it('supports numbered, previous, first, and last navigation', () => {
    const onPageChange = vi.fn()
    render(<Pagination page={6} totalPages={20} onPageChange={onPageChange}/>)
    fireEvent.click(screen.getByRole('button', { name: '第 8 页' }))
    fireEvent.click(screen.getByRole('button', { name: '上一页' }))
    fireEvent.click(screen.getByRole('button', { name: '第一页' }))
    fireEvent.click(screen.getByRole('button', { name: '最后一页' }))
    expect(onPageChange.mock.calls.map(call => call[0])).toEqual([8, 5, 1, 20])
  })

  it('disables backwards navigation on the first page', () => {
    render(<Pagination page={1} totalPages={10} onPageChange={() => undefined}/>)
    expect((screen.getByRole('button', { name: '第一页' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '上一页' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
