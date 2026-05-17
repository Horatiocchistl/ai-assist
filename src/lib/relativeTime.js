const UNITS = [
  { limit: 60, divisor: 1, unit: 'second' },
  { limit: 3600, divisor: 60, unit: 'minute' },
  { limit: 86400, divisor: 3600, unit: 'hour' },
  { limit: 604800, divisor: 86400, unit: 'day' },
  { limit: 2592000, divisor: 604800, unit: 'week' },
  { limit: 31536000, divisor: 2592000, unit: 'month' },
]

function pluralize(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/**
 * Format an ISO date as relative time (e.g. "7 hours ago", "2 days ago").
 */
export function formatRelativeTime(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return ''

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 10) return 'just now'

  for (const { limit, divisor, unit } of UNITS) {
    if (seconds < limit) {
      const n = Math.floor(seconds / divisor)
      return `${pluralize(n, unit)} ago`
    }
  }

  const years = Math.floor(seconds / 31536000)
  return `${pluralize(years, 'year')} ago`
}
