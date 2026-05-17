import { delay } from './human-behavior.js'

// Click every collapsed accordion header on the page and wait for them to open.
// Amazon uses .a-expander-collapsed to mark closed state; clicking the header expands it.
async function _expandAccordions(page) {
  const headers = await page.$$('.a-expander-collapsed .a-expander-header')
  for (const header of headers) {
    await header.click().catch(() => {})
    await delay(350, 550)
  }
  if (headers.length > 0) await delay(400, 700)
}

// Open a page and navigate to url. Returns the Playwright Page object.
export async function openPage(context, url) {
  const page = await context.newPage()

  // Block non-essential third-party requests — same as having an ad-blocker
  await page.route('**/*', (route) => {
    const req = route.request()
    const type = req.resourceType()
    const url = req.url()

    const blocked =
      type === 'media' ||
      (type === 'script' && _isThirdPartyAnalytics(url)) ||
      (type === 'image' && _isTrackingPixel(url))

    if (blocked) route.abort()
    else route.continue()
  })

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })

  // Brief pause after initial load — human takes time to visually register the page
  await delay(1800, 3200)

  // Wait for the main product content to be present
  await _waitForProductContent(page)

  return page
}

async function _waitForProductContent(page) {
  try {
    // Wait for either the product title or the image block — whichever comes first
    await Promise.race([
      page.waitForSelector('#productTitle', { timeout: 15000 }),
      page.waitForSelector('#dp-container', { timeout: 15000 }),
    ])
  } catch {
    // Page may have loaded fine but with a different structure — continue
  }
}

function _isThirdPartyAnalytics(url) {
  const analyticsPatterns = [
    'google-analytics.com',
    'googletagmanager.com',
    'doubleclick.net',
    'amazon-adsystem.com',
    'fls-na.amazon.com',
  ]
  return analyticsPatterns.some(p => url.includes(p))
}

function _isTrackingPixel(url) {
  // Tiny pixel images used for tracking — not product images
  return (
    url.includes('/beacon') ||
    url.includes('/pixel') ||
    url.includes('aax-us-east') ||
    (url.includes('x-amz-') && url.includes('1x1'))
  )
}

// Extract the plain text of product title, bullets, and accordion sections from the DOM.
// Expands any collapsed accordion sections first (Top highlights, Features & Specs, etc.)
export async function extractProductText(page) {
  await _expandAccordions(page)

  return page.evaluate(() => {
    const title = document.querySelector('#productTitle')?.innerText?.trim() || null

    // Scope to the FIRST #feature-bullets only — page may contain bullets from
    // sponsored/related products further down that share the same selector
    const featureBlock = document.querySelector('#feature-bullets, #featurebullets_feature_div')
    const bulletEls = featureBlock
      ? featureBlock.querySelectorAll('ul li span.a-list-item')
      : []
    const bullets = Array.from(bulletEls)
      .map(el => el.innerText.trim())
      .filter(t => t.length > 0)

    // Capture expanded accordion sections (Top highlights, Features & Specs, Measurements, etc.)
    const accordionSections = []
    document.querySelectorAll('.a-expander-container').forEach(container => {
      const heading = container.querySelector('.a-expander-header')?.innerText?.trim()
      if (!heading) return
      const items = Array.from(container.querySelectorAll('.a-expander-content li, .a-expander-content .a-list-item'))
        .map(el => el.innerText.trim())
        .filter(t => t.length > 0)
      if (items.length > 0) accordionSections.push({ heading, items })
    })

    return { title, bullets, accordionSections }
  })
}
