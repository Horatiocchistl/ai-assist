import { delay } from './human-behavior.js'

// Click every collapsed expander on the page, then scroll lazy-load sections
// into view so Amazon fires the AJAX request that populates their content.
// Amazon tracks collapsed state via aria-expanded="false" on the toggle anchor.
// "Features & Specs" and "Measurements" use btf-lazy-load-target — their content
// only arrives after the visible div is scrolled into the viewport.
async function _expandAccordions(page, emit) {
  // Pass 1 — click all collapsed toggles
  const targets = await page.$$('[aria-expanded="false"]')
  let clicked = 0
  for (const el of targets) {
    await el.scrollIntoViewIfNeeded().catch(() => {})
    await delay(200, 350)
    // Playwright click first; fall back to JS click for AUI event listeners
    await el.click().catch(async () => el.evaluate(n => n.click()).catch(() => {}))
    await delay(350, 550)
    clicked++
  }
  emit?.({ type: 'log', level: 'info', msg: `ACCORDIONS — clicked ${clicked} collapsed section(s)` })
  if (clicked > 0) await delay(600, 1000)

  // Pass 2 — scroll every lazy-load content div into view to trigger AJAX
  // These divs are now visible (toggle was clicked) but empty until in viewport
  const lazyEls = await page.$$('.btf-lazy-load-target')
  if (lazyEls.length > 0) {
    emit?.({ type: 'log', level: 'info', msg: `ACCORDIONS — ${lazyEls.length} lazy section(s) found, scrolling to trigger load` })
    for (const el of lazyEls) {
      await el.scrollIntoViewIfNeeded().catch(() => {})
      // Wait for AJAX to populate; poll until real content appears (max 6 s)
      await _waitForLazyContent(page, el, emit)
    }
    await delay(500, 800)
  }
}

async function _waitForLazyContent(page, el, emit) {
  const start = Date.now()
  while (Date.now() - start < 6000) {
    const hasContent = await el.evaluate(node =>
      node.querySelectorAll('li, tr, .a-list-item').length > 0
    ).catch(() => false)
    if (hasContent) return
    await delay(400, 400)
  }
  emit?.({ type: 'log', level: 'warn', msg: 'ACCORDIONS — lazy section timed out waiting for content' })
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

    // Product overview table — .po-* rows (Brand, Weight, Scent, Dimensions, etc.)
    // These live in the Top highlights expander as a <table role="list"> with <tr role="listitem">
    const overview = Array.from(
      document.querySelectorAll('table[role="list"] tr[role="listitem"], .a-normal tr[role="listitem"]')
    ).map(tr => {
      const key = tr.querySelector('.a-text-bold')?.innerText?.trim()
      const val = Array.from(tr.querySelectorAll('td')).pop()?.innerText?.trim()
      return (key && val) ? `${key}: ${val}` : null
    }).filter(Boolean)

    // Scope to the FIRST #feature-bullets only — page may contain bullets from
    // sponsored/related products further down that share the same selector
    const featureBlock = document.querySelector('#feature-bullets, #featurebullets_feature_div')
    const bulletEls = featureBlock
      ? featureBlock.querySelectorAll('ul li span.a-list-item')
      : []
    const bullets = Array.from(bulletEls)
      .map(el => el.innerText.trim())
      .filter(t => t.length > 0)

    // Capture expanded accordion sections — list-based AND table-based (Features & Specs, Measurements)
    const accordionSections = []
    document.querySelectorAll('.a-expander-container').forEach(container => {
      const heading = container.querySelector('.a-expander-header')?.innerText?.trim()
      if (!heading) return

      // List-style content (Top highlights bullets)
      const listItems = Array.from(
        container.querySelectorAll('.a-expander-content li, .a-expander-content .a-list-item')
      ).map(el => el.innerText.trim()).filter(t => t.length > 0)

      // Table-style content (Features & Specs, Measurements use <table class="a-keyvalue"> th/td rows)
      const tableItems = Array.from(
        container.querySelectorAll('.a-expander-content table tr, .a-expander-content .a-keyvalue tr')
      ).map(tr => {
        const th = tr.querySelector('th')?.innerText?.trim()
        const td = tr.querySelector('td')?.innerText?.trim()
        return (th && td) ? `${th}: ${td}` : null
      }).filter(Boolean)

      const items = listItems.length > 0 ? listItems : tableItems
      if (items.length > 0) accordionSections.push({ heading, items })
    })

    return { title, overview, bullets, accordionSections }
  })
}
