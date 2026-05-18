/** Geocode via Nominatim (cache miss) with Supabase geocode_cache persistence. */

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const USER_AGENT = 'AI-Assist/1.0 (local weather lookup)'

const US_STATE_ABBR = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/i

let lastNominatimAt = 0

export class GeocodeError extends Error {
  constructor(message) {
    super(message)
    this.name = 'GeocodeError'
  }
}

function parseLatLon(s) {
  const parts = String(s).split(',').map((p) => p.trim())
  if (parts.length !== 2) return null
  const lat = Number(parts[0])
  const lon = Number(parts[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
  return { lat, lon }
}

export function normalizeGeocodeKey(raw) {
  if (!raw || typeof raw !== 'string') return null
  const s = raw.trim().replace(/\s+/g, ' ')
  if (!s) return null

  const latlon = parseLatLon(s)
  if (latlon) {
    const lat = Math.round(latlon.lat * 10000) / 10000
    const lon = Math.round(latlon.lon * 10000) / 10000
    return `latlon:${lat},${lon}`
  }
  return s.toLowerCase()
}

function looksUS(query) {
  return (
    /\b\d{5}(-\d{4})?\b/.test(query)
    || US_STATE_ABBR.test(query)
    || /\b(united states|usa|u\.s\.a\.?)\b/i.test(query)
  )
}

function queryHasDisambiguation(query) {
  return (
    US_STATE_ABBR.test(query)
    || /,\s*\S/.test(query)
    || /\b\d{5}(-\d{4})?\b/.test(query)
    || /\b(united states|usa|u\.s\.a\.?)\b/i.test(query)
  )
}

async function throttleNominatim() {
  const now = Date.now()
  const wait = 1000 - (now - lastNominatimAt)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastNominatimAt = Date.now()
}

function scoreResult(query, result) {
  let score = Number(result.importance) || 0
  const qLower = query.toLowerCase()
  const addr = result.address || {}
  const state = (addr.state || '').toLowerCase()
  const country = (addr.country || '').toLowerCase()
  const postcode = addr.postcode || ''
  if (state && qLower.includes(state)) score += 10
  if (country && qLower.includes(country)) score += 5
  if (postcode && qLower.includes(postcode)) score += 15
  return score
}

function pickBestResult(query, results) {
  if (!results.length) return null
  if (results.length === 1) return results[0]

  if (queryHasDisambiguation(query)) {
    let best = results[0]
    let bestScore = -Infinity
    for (const r of results) {
      const s = scoreResult(query, r)
      if (s > bestScore) {
        bestScore = s
        best = r
      }
    }
    return best
  }

  const primaryName = (results[0].name || '').toLowerCase()
  const regions = new Set()
  for (const r of results) {
    if ((r.name || '').toLowerCase() === primaryName) {
      const addr = r.address || {}
      regions.add(`${addr.state || ''}|${addr.country || ''}`)
    }
  }
  if (regions.size > 1) {
    const lines = results.slice(0, 5).map((r, i) => `  ${i + 1}. ${r.display_name}`)
    throw new GeocodeError(
      `AMBIGUOUS_LOCATION — multiple places match '${query}'. Provide state, zip, or lat,lon.\nMatches:\n${lines.join('\n')}`,
    )
  }
  return results[0]
}

async function geocodeNominatim(locationRaw) {
  await throttleNominatim()
  const params = new URLSearchParams({
    q: locationRaw.trim(),
    format: 'json',
    limit: '5',
    addressdetails: '1',
    'accept-language': 'en',
  })
  if (looksUS(locationRaw)) params.set('countrycodes', 'us')

  const res = await fetch(`${NOMINATIM_URL}?${params}`, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'en',
    },
  })
  if (!res.ok) {
    throw new GeocodeError(`Geocoding service error (${res.status}). Try again later.`)
  }
  const results = await res.json()
  if (!Array.isArray(results) || results.length === 0) {
    throw new GeocodeError(
      `Could not find location '${locationRaw}'. Try zip, city + state, or lat,lon.`,
    )
  }
  return pickBestResult(locationRaw, results)
}

async function cacheInsert(supabase, row) {
  const { error } = await supabase.from('geocode_cache').insert(row)
  if (error && error.code !== '23505') {
    console.warn('[geocode] cache insert failed:', error.message)
  }
}

export async function resolveLocation(supabase, locationRaw) {
  const trimmed = locationRaw.trim()
  const key = normalizeGeocodeKey(trimmed)
  if (!key) throw new GeocodeError('location is empty')

  const latlon = parseLatLon(trimmed)
  if (latlon) {
    const displayName = `${latlon.lat},${latlon.lon}`
    if (supabase) {
      await cacheInsert(supabase, {
        query_key: key,
        query_original: trimmed,
        latitude: latlon.lat,
        longitude: latlon.lon,
        display_name: displayName,
        source: 'latlon',
      })
    }
    return { lat: latlon.lat, lon: latlon.lon, displayName, fromCache: false }
  }

  if (supabase) {
    const { data: row, error } = await supabase
      .from('geocode_cache')
      .select('latitude, longitude, display_name')
      .eq('query_key', key)
      .maybeSingle()
    if (error) console.warn('[geocode] cache lookup failed:', error.message)
    if (row) {
      return {
        lat: row.latitude,
        lon: row.longitude,
        displayName: row.display_name,
        fromCache: true,
      }
    }
  }

  const result = await geocodeNominatim(trimmed)
  const lat = parseFloat(result.lat)
  const lon = parseFloat(result.lon)
  const displayName = result.display_name

  if (supabase) {
    await cacheInsert(supabase, {
      query_key: key,
      query_original: trimmed,
      latitude: lat,
      longitude: lon,
      display_name: displayName,
      source: 'nominatim',
      nominatim_place_id: result.place_id ?? null,
    })
  }

  return { lat, lon, displayName, fromCache: false }
}
