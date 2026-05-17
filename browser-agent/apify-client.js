import https from 'https'

const ACTOR_ID = 'junglee~Amazon-crawler'
const BASE = 'https://api.apify.com/v2'
const RUN_TIMEOUT_MS = 3 * 60 * 1000
const POLL_INTERVAL_MS = 4000

function apifyRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE}${path}`)
    url.searchParams.set('token', token)

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
    }

    const req = https.request(options, (res) => {
      let raw = ''
      res.on('data', chunk => { raw += chunk })
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw)
          if (res.statusCode >= 400) {
            reject(new Error(`Apify ${res.statusCode}: ${parsed?.error?.message || raw.slice(0, 200)}`))
          } else {
            resolve(parsed)
          }
        } catch {
          reject(new Error(`Apify non-JSON response (${res.statusCode}): ${raw.slice(0, 200)}`))
        }
      })
    })

    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

async function _pollUntilDone(runId, token, emit) {
  const deadline = Date.now() + RUN_TIMEOUT_MS
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
    const resp = await apifyRequest('GET', `/actor-runs/${runId}`, null, token)
    const status = resp?.data?.status
    emit?.({ type: 'log', level: 'info', msg: `APIFY — run status: ${status}` })
    if (status === 'SUCCEEDED') return resp.data
    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
      throw new Error(`Apify run ${status}`)
    }
  }
  throw new Error('Apify run timed out after 3 minutes')
}

// Field names from verified real actor output:
// title, asin, url, brand, price {value,currency}, inStock, stars, reviewsCount,
// monthlyPurchaseVolume, breadCrumbs, features (bullets array),
// attributes [{key,value}] (all specs — dimensions, weight, scent, etc.),
// productOverview [{key,value}] (quick summary specs),
// importantInformation {title, items [{title,text}]} (safety, ingredients),
// highResolutionImages (carousel URLs), aPlusContent {rawImages [{name,url}]}
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

  emit?.({ type: 'log', level: 'info', msg: `APIFY — starting actor run for ${url}` })

  const startResp = await apifyRequest(
    'POST',
    `/acts/${ACTOR_ID}/runs`,
    {
      categoryOrProductUrls: [{ url }],
      maxItemsPerStartUrl: 1,
      scrapeProductDetails: true,
      scrapeProductVariantPrices: false,
      scrapeSellers: false,
      proxyCountry: 'AUTO_SELECT_PROXY_COUNTRY',
    },
    token
  )

  const runId = startResp?.data?.id
  const datasetId = startResp?.data?.defaultDatasetId
  if (!runId) throw new Error('Apify did not return a run ID')

  emit?.({ type: 'log', level: 'info', msg: `APIFY — run started (id=${runId}), polling…` })

  await _pollUntilDone(runId, token, emit)

  emit?.({ type: 'log', level: 'info', msg: 'APIFY — run complete, fetching dataset' })

  const dataResp = await apifyRequest('GET', `/datasets/${datasetId}/items?limit=1`, null, token)
  const items = Array.isArray(dataResp) ? dataResp : (dataResp?.data?.items ?? [])
  const item = items[0] ?? null

  if (!item) throw new Error('Apify returned empty dataset')

  const result = _normalizeResult(item)
  emit?.({ type: 'log', level: 'info', msg: `APIFY — "${result.title?.slice(0, 80)}" | ${result.bullets.length} bullet(s) | ${result.attributes.length} attribute(s) | ${result.highResImages.length} image(s)` })

  return result
}
