/** Extract location text from weather chat messages (verbatim — no geocoding here). */

const SLASH_WEATHER_RE = /^\/?weather\s+(.+)/is
const WEATHER_INTENT_RE = /\b(weather|temperature|forecast|conditions)\b/i
const ZIP_RE = /\b(\d{5})(?:-\d{4})?\b/

export function trimWeatherLocation(raw) {
  if (!raw || typeof raw !== 'string') return null
  const s = raw.trim().replace(/\s+/g, ' ')
  return s || null
}

export function parseWeatherLocation(text) {
  if (!text || typeof text !== 'string') return null

  const slash = text.trim().match(SLASH_WEATHER_RE)
  if (slash) {
    return trimWeatherLocation(slash[1].trim())
  }

  if (!WEATHER_INTENT_RE.test(text)) return null

  const zip = text.match(ZIP_RE)
  if (zip) return zip[1]

  const inFor = text.match(/\b(?:weather|temperature|forecast|conditions)\s+(?:in|for|at)\s+(.+)/is)
  if (inFor) {
    const loc = inFor[1].trim().replace(/[?!]+\s*$/, '').trim()
    return trimWeatherLocation(loc)
  }

  return null
}

export function shouldFetchWeatherDirectly(text) {
  return parseWeatherLocation(text) != null
}
