/** Extract ASIN and canonical Amazon URL from paste input or any text file. */
export function extractAsin(input) {
  if (!input || typeof input !== 'string') return null
  const text = input.trim().replace(/^\uFEFF/, '')

  const patterns = [
    /https?:\/\/(?:www\.)?amazon\.[a-z.]+\/(?:[\w%./-]+\/)*dp\/([A-Z0-9]{10})/i,
    /https?:\/\/(?:www\.)?amazon\.[a-z.]+\/(?:[\w%./-]+\/)*gp\/product\/([A-Z0-9]{10})/i,
    /(?:www\.)?amazon\.[a-z.]+\/(?:[\w%./-]+\/)*dp\/([A-Z0-9]{10})/i,
    /(?:www\.)?amazon\.[a-z.]+\/(?:[\w%./-]+\/)*gp\/product\/([A-Z0-9]{10})/i,
    /\/dp\/([A-Z0-9]{10})/i,
    /\/gp\/product\/([A-Z0-9]{10})/i,
    /[?&]asin=([A-Z0-9]{10})/i,
  ]

  for (const re of patterns) {
    const m = text.match(re)
    if (m) {
      const asin = m[1].toUpperCase()
      return { asin, url: normalizeAmazonUrl(asin) }
    }
  }

  if (/^[A-Z0-9]{10}$/i.test(text)) {
    const asin = text.toUpperCase()
    return { asin, url: normalizeAmazonUrl(asin) }
  }

  if (/amazon/i.test(text)) {
    const loose = text.match(/\b([A-Z0-9]{10})\b/g)
    if (loose) {
      const asin = loose.find(c => /^[A-Z0-9]{10}$/i.test(c) && /[0-9]/.test(c))?.toUpperCase()
      if (asin) return { asin, url: normalizeAmazonUrl(asin) }
    }
  }

  return null
}

export function normalizeAmazonUrl(asin) {
  return `https://www.amazon.com/dp/${asin}`
}
