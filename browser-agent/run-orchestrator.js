import path from 'path'
import fs from 'fs/promises'
import { fileURLToPath } from 'url'
import { getBrowserContext, saveSession } from './browser-session.js'
import { openPage, extractProductText } from './page-navigator.js'
import { humanScrollPage, delay } from './human-behavior.js'
import { captureViewport, captureCarousel, captureAplusModules } from './screenshot-capture.js'
import { probePage } from './page-probe.js'
import { apifyFetchProduct } from './apify-client.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CAPTURES_ROOT = path.join(__dirname, '..', 'captures')

function _normalizeDomData(dom) {
  if (!dom) return null

  // Map "Label: Value" strings from overview/accordion → { name, value } rows
  const splitRow = (line, fallbackName) => {
    const idx = line.indexOf(': ')
    if (idx === -1) return { name: fallbackName || 'Detail', value: line }
    return { name: line.slice(0, idx).trim(), value: line.slice(idx + 2).trim() }
  }

  const overviewRows = (dom.overview || []).map(l => splitRow(l))
  const accordionRows = (dom.accordionSections || []).flatMap(s =>
    (s.items || []).map(item => splitRow(item, s.heading))
  )

  return {
    title:                 dom.title || null,
    brand:                 null,
    price:                 null,
    asin:                  null,
    url:                   null,
    inStock:               null,
    stars:                 null,
    reviewsCount:          null,
    monthlyPurchaseVolume: null,
    breadCrumbs:           null,
    bullets:               Array.isArray(dom.bullets) ? dom.bullets.filter(b => typeof b === 'string' && b.trim()) : [],
    attributes:            [],
    productOverview:       [...overviewRows, ...accordionRows],
    importantInformation:  null,
    highResImages:         [],
    aplusImages:           [],
    description:           null,
    bestsellerRanks:       [],
    seller:                null,
  }
}

export async function runAnalysis(runId, asins, emit, signal) {
  emit({ type: 'log', level: 'info', msg: `Run started — ${asins.length} ASIN(s) queued` })

  const apifyToken = process.env.APIFY_TOKEN || null
  if (apifyToken) {
    emit({ type: 'log', level: 'info', msg: 'Apify token present — structured data fetched in parallel with screenshots' })
  } else {
    emit({ type: 'log', level: 'warn', msg: 'APIFY_TOKEN not set — falling back to DOM extraction' })
  }

  let context
  try {
    context = await getBrowserContext(false) // headed — for M5 Metal + auth handling
    emit({ type: 'log', level: 'info', msg: 'Browser session ready' })
  } catch (err) {
    emit({ type: 'log', level: 'error', msg: `Failed to launch browser: ${err.message}` })
    return
  }

  const results = []

  for (let i = 0; i < asins.length; i++) {
    if (signal?.aborted) {
      emit({ type: 'log', level: 'warn', msg: 'Run aborted by user' })
      break
    }

    const { asin, url } = asins[i]
    const outputDir = path.join(CAPTURES_ROOT, runId, asin)
    const logPrefix = `[${i + 1}/${asins.length}] ${asin}`

    emit({ type: 'asin_start', asin, url, index: i + 1, total: asins.length })
    emit({ type: 'log', level: 'info', msg: `${logPrefix} — opening page` })

    let page
    try {
      page = await openPage(context, url)
      emit({ type: 'log', level: 'info', msg: `${logPrefix} — page loaded` })
    } catch (err) {
      emit({ type: 'log', level: 'error', msg: `${logPrefix} — navigation failed: ${err.message}` })
      emit({ type: 'asin_error', asin, error: err.message })
      results.push({ asin, status: 'error', error: err.message })
      continue
    }

    // Check for CAPTCHA or sign-in redirect
    const blocked = await _checkForBlock(page)
    if (blocked) {
      emit({ type: 'log', level: 'warn', msg: `${logPrefix} — ${blocked}. Pausing — handle in browser window then this ASIN will retry.` })
      emit({ type: 'asin_blocked', asin, reason: blocked })
      await delay(30000, 60000) // give consultant time to resolve in the browser
      await page.close()
      results.push({ asin, status: 'blocked', error: blocked })
      continue
    }

    const asinResult = { asin, url, text: null, carousel: [], aplus: [] }

    try {
      // Step 1: Probe the page
      emit({ type: 'log', level: 'info', msg: `${logPrefix} — probing page structure` })
      await probePage(page, emit)

      // Steps 2–6: Apify data fetch + Playwright visual capture run in parallel
      emit({ type: 'log', level: 'info', msg: `${logPrefix} — starting parallel Apify fetch + visual capture` })

      const [apifyResult] = await Promise.allSettled([
        apifyToken
          ? apifyFetchProduct(url, apifyToken, emit)
          : Promise.resolve(null),
        _runVisualCapture(page, asin, outputDir, logPrefix, emit, signal, asinResult),
      ])

      if (apifyResult.status === 'fulfilled' && apifyResult.value) {
        asinResult.text = apifyResult.value
        const t = asinResult.text
        emit({ type: 'log', level: 'info', msg: `${logPrefix} — Apify: ${t.bullets.length} bullet(s), ${t.attributes.length} attribute(s), ${t.highResImages.length} high-res image(s)` })
      } else {
        if (apifyToken) {
          emit({ type: 'log', level: 'warn', msg: `${logPrefix} — Apify failed (${apifyResult.reason?.message ?? 'unknown'}), falling back to DOM extraction` })
        }
        const domRaw = await extractProductText(page).catch(() => null)
        asinResult.text = domRaw ? _normalizeDomData(domRaw) : null
        if (asinResult.text?.title) {
          emit({ type: 'log', level: 'info', msg: `${logPrefix} — DOM title: "${asinResult.text.title.slice(0, 100)}"` })
        }
      }

      // Save structured data alongside screenshots
      if (asinResult.text) {
        await fs.mkdir(outputDir, { recursive: true })
        await fs.writeFile(path.join(outputDir, 'product-data.json'), JSON.stringify(asinResult.text, null, 2))
        emit({ type: 'log', level: 'info', msg: `${logPrefix} — product-data.json saved` })
      }

      asinResult.status = 'captured'
      emit({ type: 'asin_complete', asin, carouselCount: asinResult.carousel.length, aplusCount: asinResult.aplus.length })
      emit({ type: 'log', level: 'info', msg: `${logPrefix} — complete` })

    } catch (err) {
      emit({ type: 'log', level: 'error', msg: `${logPrefix} — error during capture: ${err.message}` })
      asinResult.status = 'error'
      asinResult.error = err.message
      emit({ type: 'asin_error', asin, error: err.message })
    } finally {
      await page.close().catch(() => {})
    }

    results.push(asinResult)

    // Human-pace delay between pages — only if more ASINs remain
    if (i < asins.length - 1 && !signal?.aborted) {
      const pauseMs = 15000 + Math.random() * 30000 // 15–45 seconds
      const pauseSec = Math.round(pauseMs / 1000)
      emit({ type: 'log', level: 'info', msg: `Waiting ${pauseSec}s before next page…` })
      await delay(pauseMs, pauseMs)
    }
  }

  await saveSession().catch(() => {})

  const completed = results.filter(r => r.status === 'captured').length
  const errors = results.filter(r => r.status === 'error' || r.status === 'blocked').length
  emit({ type: 'run_complete', completed, errors, total: asins.length })
  emit({ type: 'log', level: 'info', msg: `Run finished — ${completed} captured, ${errors} failed` })

  return results
}

async function _runVisualCapture(page, asin, outputDir, logPrefix, emit, signal, asinResult) {
  const heroPath = path.join(outputDir, 'hero_viewport.png')
  await captureViewport(page, heroPath, emit)
  emit({ type: 'screenshot', asin, section: 'hero_viewport', path: heroPath })

  emit({ type: 'log', level: 'info', msg: `${logPrefix} — starting carousel capture` })
  asinResult.carousel = await captureCarousel(page, outputDir, emit)
  emit({ type: 'log', level: 'info', msg: `${logPrefix} — captured ${asinResult.carousel.length} carousel image(s)` })

  emit({ type: 'log', level: 'info', msg: `${logPrefix} — scrolling page` })
  let scrollCaptures = 0
  const capturedScrollMilestones = new Set()
  await humanScrollPage(
    page,
    async (scrollY, pageHeight) => {
      const pct = scrollY / pageHeight
      const hit = [0.25, 0.5, 0.75].find(t => Math.abs(pct - t) < 0.04)
      if (hit && !capturedScrollMilestones.has(hit)) {
        capturedScrollMilestones.add(hit)
        const scrollPath = path.join(outputDir, `scroll_${Math.round(hit * 100)}pct.png`)
        await captureViewport(page, scrollPath, emit)
        scrollCaptures++
      }
    },
    signal
  )
  emit({ type: 'log', level: 'info', msg: `${logPrefix} — scroll complete (${scrollCaptures} viewport captures)` })

  emit({ type: 'log', level: 'info', msg: `${logPrefix} — capturing A+ content` })
  asinResult.aplus = await captureAplusModules(page, outputDir, emit)
  emit({ type: 'log', level: 'info', msg: `${logPrefix} — captured ${asinResult.aplus.length} A+ module(s)` })
}

async function _checkForBlock(page) {
  const url = page.url()
  if (url.includes('/ap/signin') || url.includes('/gp/sign-in')) return 'Amazon sign-in required'
  if (url.includes('/errors/validateCaptcha')) return 'CAPTCHA detected'

  const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 500) || '')
  if (bodyText.toLowerCase().includes('robot')) return 'Bot detection triggered'
  if (bodyText.toLowerCase().includes('captcha')) return 'CAPTCHA on page'

  return null
}
