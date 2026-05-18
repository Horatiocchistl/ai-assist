import { ApifyClient } from 'apify-client'

const TASK_ID = 'y1DSoxZcsZM7MFPzp'

function _safeStr(v) {
  if (v == null) return null
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return null
}

// Field names verified from real actor output JSON
function _normalizeResult(item) {
  if (!item) return null

  return {
    title:                 _safeStr(item.title),
    brand:                 _safeStr(item.brand),
    price:                 item.price?.value != null ? `${item.price.currency}${item.price.value}` : null,
    asin:                  _safeStr(item.asin),
    url:                   _safeStr(item.url),
    inStock:               item.inStock ?? null,
    stars:                 item.stars ?? null,
    reviewsCount:          typeof item.reviewsCount === 'number' ? item.reviewsCount : null,
    monthlyPurchaseVolume: _safeStr(item.monthlyPurchaseVolume),
    breadCrumbs:           _safeStr(item.breadCrumbs),
    bullets:               Array.isArray(item.features) ? item.features.filter(f => typeof f === 'string' && f.trim()) : [],
    attributes:            Array.isArray(item.attributes) ? item.attributes.filter(Boolean) : [],
    productOverview:       Array.isArray(item.productOverview) ? item.productOverview.filter(Boolean) : [],
    importantInformation:  _safeStr(item.importantInformation),
    highResImages:         Array.isArray(item.highResolutionImages) ? item.highResolutionImages : [],
    aplusImages:           Array.isArray(item.aPlusContent?.rawImages) ? item.aPlusContent.rawImages : [],
    description:           typeof item.description === 'string' ? item.description : null,
    bestsellerRanks:       Array.isArray(item.bestsellerRanks) ? item.bestsellerRanks.filter(Boolean) : [],
    seller:                _safeStr(item.seller),
    _raw:                  item,
  }
}

export async function apifyFetchProduct(url, token, emit) {
  if (!token) throw new Error('APIFY_TOKEN not set')

  emit?.({ type: 'log', level: 'info', msg: `APIFY — starting run for ${url}` })

  const client = new ApifyClient({ token })

  const run = await client.task(TASK_ID).call({
    categoryOrProductUrls: [{ url }],
  }, { waitSecs: 180 })

  emit?.({ type: 'log', level: 'info', msg: `APIFY — run complete, fetching results` })

  const { items } = await client.dataset(run.defaultDatasetId).listItems()
  const item = items[0] ?? null

  if (!item) throw new Error('Apify returned empty dataset')

  const result = _normalizeResult(item)
  emit?.({ type: 'log', level: 'info', msg: `APIFY — "${result.title?.slice(0, 80)}" | ${result.bullets.length} bullet(s) | ${result.highResImages.length} image(s)` })

  return result
}
