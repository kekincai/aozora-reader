import { japanDate, shiftDate, streakSummary, type DayRecord } from '../state/store'
import { formatJapaneseDate, weekdayOf } from './dates'

/** The last seven days as bookmarks hanging from a line. */
export function StreakStrip({ days, today = japanDate() }: { days: Record<string, DayRecord>; today?: string }) {
  const summary = streakSummary(days, today)
  const dates = Array.from({ length: 7 }, (_, index) => shiftDate(today, index - 6))
  return <div className="streak">
    <ol className="streak-marks" aria-label="この一週間の読書">
      {dates.map(date => {
        const kind = days[date] ? 'is-done' : summary.restDays.has(date) ? 'is-rest' : date === today ? 'is-today' : 'is-miss'
        const label = days[date] ? '読了' : summary.restDays.has(date) ? '休み札' : date === today ? 'まだ' : '未読'
        return <li key={date} className={`${kind} ${date === today ? 'is-current' : ''}`} title={`${formatJapaneseDate(date)} ${label}`}><i aria-hidden="true"/><span>{weekdayOf(date)}</span><span className="sr-only">{label}</span></li>
      })}
    </ol>
    <div className="streak-line">
      <span>累計 <b>{summary.total}</b> 日{summary.current > 0 && <> · 連続 <b>{summary.current}</b> 日</>}</span>
      <span>休み札 残り {summary.restLeft}</span>
    </div>
  </div>
}
