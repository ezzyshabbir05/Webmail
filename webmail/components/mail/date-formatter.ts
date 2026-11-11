/**
 * Gmail-standard date formatter
 * - Today: 3:45 PM
 * - This year: Nov 10
 * - Past years: 11/10/25
 */
export function formatGmailDate(isoOrDateStr?: string): string {
  if (!isoOrDateStr) return ""

  const date = new Date(isoOrDateStr)
  if (isNaN(date.getTime())) return isoOrDateStr

  const now = new Date()
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()

  if (isToday) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  }

  const isThisYear = date.getFullYear() === now.getFullYear()
  if (isThisYear) {
    return date.toLocaleDateString([], { month: "short", day: "numeric" })
  }

  return date.toLocaleDateString([], {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  })
}

export function formatGmailFullDate(isoOrDateStr?: string): string {
  if (!isoOrDateStr) return ""
  const date = new Date(isoOrDateStr)
  if (isNaN(date.getTime())) return isoOrDateStr

  return date.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}
