import { ApifyClient } from 'apify-client'

const ACTOR_ID = 'BG3WDrGdteHgZgbPK'

// Field names verified from real actor output JSON
function _normalizeResult(item) {
  if (!item) return null

  return {
    title:                 item.title || null,
    brand:                 item.brand || null,
    price:                 item.price?.value != null ? `${item.price.currency}${item.price.value}` : null,
    asin:                  item.asin || null,
    url:                   item.url || null,
    inStock:               item.inStock ?? null,
    stars:                 item.stars ?? null,
    reviewsCount:          item.reviewsCount ?? null,
    monthlyPurchaseVolume: item.monthlyPurchaseVolume || null,
    breadCrumbs:           item.breadCrumbs || null,
    bullets:               Array.isArray(item.features) ? item.features.filter(Boolean) : [],
    attributes:            Array.isArray(item.attributes) ? item.attributes : [],
    productOverview:       Array.isArray(item.productOverview) ? item.productOverview : [],
    importantInformation:  item.importantInformation || null,
    highResImages:         Array.isArray(item.highResolutionImages) ? item.highResolutionImages : [],
    aplusImages:           Array.isArray(item.aPlusContent?.rawImages) ? item.aPlusContent.rawImages : [],
    description:           item.description || null,
    bestsellerRanks:       Array.isArray(item.bestsellerRanks) ? item.bestsellerRanks : [],
    seller:                item.seller || null,
    _raw:                  item,
  }
}

export async function apifyFetchProduct(url, token, emit) {
  if (!token) throw new Error('APIFY_TOKEN not set')

  emit?.({ type: 'log', level: 'info', msg: `APIFY — starting run for ${url}` })

  const client = new ApifyClient({ token })

  const run = await client.actor(ACTOR_ID).call({
    categoryOrProductUrls: [{ url }],
    maxItemsPerStartUrl: 1,
    language: 'en',
    countryCode: 'US',
    proxyCountry: 'AUTO_SELECT_PROXY_COUNTRY',
    scrapeProductDetails: true,
    scrapeProductVariantPrices: false,
    scrapeSellers: false,
    useCaptchaSolver: false,
    maxOffers: 0,
    maxProductVariantsAsSeparateResults: 0,
    locationDeliverableRoutes: ['PRODUCT', 'SEARCH', 'OFFERS'],
  }, { waitSecs: 180 })

  emit?.({ type: 'log', level: 'info', msg: `APIFY — run complete, fetching results` })

  const { items } = await client.dataset(run.defaultDatasetId).listItems()
  const item = items[0] ?? null

  if (!item) throw new Error('Apify returned empty dataset')

  const result = _normalizeResult(item)
  emit?.({ type: 'log', level: 'info', msg: `APIFY — "${result.title?.slice(0, 80)}" | ${result.bullets.length} bullet(s) | ${result.highResImages.length} image(s)` })

  return result
}
