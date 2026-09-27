const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

export function weekdayOf(date: string) {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]
}

export function formatJapaneseDate(date: string) {
  const [, month, day] = date.split('-').map(Number)
  return `${month}月${day}日（${weekdayOf(date)}）`
}
