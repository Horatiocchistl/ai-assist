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

export async function runAnalysis(runId, asins, emit, signal) {
  emit({ type: 'log', level: 'info', msg: `Run started — ${asins.length} ASIN(s) queued` })

  const apifyToken = process.env.APIFY_TOKEN || null
  if (apifyToken) {
    emit({ type: 'log', level: 'info', msg: 'Apify token present — structured data will be fetched in parallel with screenshots' })
  } else {
    emit({ type: 'log', level: 'warn', msg: 'APIFY_TOKEN not set — falling back to DOM extraction only' })
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
      // Step 1: Probe the page — log every selector result before touching anything
      emit({ type: 'log', level: 'info', msg: `${logPrefix} — probing page structure` })
      await probePage(page, emit)

      // Step 2: Fire Apify fetch and Playwright visual capture in parallel.
      // Apify handles text/specs; Playwright handles all screenshots.
      emit({ type: 'log', level: 'info', msg: `${logPrefix} — starting parallel Apify fetch + visual capture` })

      const [apifyResult] = await Promise.allSettled([
        apifyToken
          ? apifyFetchProduct(url, apifyToken, emit)
          : Promise.resolve(null),
        _runVisualCapture(page, asin, outputDir, logPrefix, emit, signal, asinResult),
      ])

      // Merge text data — Apify wins; DOM extraction is the fallback
      if (apifyResult.status === 'fulfilled' && apifyResult.value) {
        asinResult.text = apifyResult.value
        emit({ type: 'log', level: 'info', msg: `${logPrefix} — Apify data merged (${asinResult.text.bullets.length} bullet(s), ${Object.keys(asinResult.text.specs).length} spec(s))` })
      } else {
        if (apifyToken) {
          emit({ type: 'log', level: 'warn', msg: `${logPrefix} — Apify failed (${apifyResult.reason?.message}), falling back to DOM extraction` })
        }
        emit({ type: 'log', level: 'info', msg: `${logPrefix} — running DOM extraction as fallback` })
        asinResult.text = await extractProductText(page).catch(() => null)
        _logDomText(asinResult.text, logPrefix, emit)
      }

      // Persist text data alongside screenshots
      if (asinResult.text) {
        await fs.mkdir(outputDir, { recursive: true })
        await fs.writeFile(
          path.join(outputDir, 'product-data.json'),
          JSON.stringify(asinResult.text, null, 2)
        )
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

// All Playwright screenshot steps — runs in parallel with Apify fetch
async function _runVisualCapture(page, asin, outputDir, logPrefix, emit, signal, asinResult) {
  // Hero viewport (above the fold)
  const heroPath = path.join(outputDir, 'hero_viewport.png')
  await captureViewport(page, heroPath, emit)
  emit({ type: 'screenshot', asin, section: 'hero_viewport', path: heroPath })

  // Click through image carousel
  emit({ type: 'log', level: 'info', msg: `${logPrefix} — starting carousel capture` })
  asinResult.carousel = await captureCarousel(page, outputDir, emit)
  emit({ type: 'log', level: 'info', msg: `${logPrefix} — captured ${asinResult.carousel.length} carousel image(s)` })

  // Human-pace scroll — captures viewport at 25 / 50 / 75 %
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
        const pctLabel = Math.round(hit * 100)
        const scrollPath = path.join(outputDir, `scroll_${pctLabel}pct.png`)
        await captureViewport(page, scrollPath, emit)
        scrollCaptures++
      }
    },
    signal
  )
  emit({ type: 'log', level: 'info', msg: `${logPrefix} — scroll complete (${scrollCaptures} viewport captures)` })

  // A+ content modules
  emit({ type: 'log', level: 'info', msg: `${logPrefix} — capturing A+ content` })
  asinResult.aplus = await captureAplusModules(page, outputDir, emit)
  emit({ type: 'log', level: 'info', msg: `${logPrefix} — captured ${asinResult.aplus.length} A+ module(s)` })
}

function _logDomText(text, logPrefix, emit) {
  if (text?.title) {
    emit({ type: 'log', level: 'info', msg: `${logPrefix} — title: "${text.title.slice(0, 100)}"` })
  }
  const overview = text?.overview ?? []
  if (overview.length > 0) {
    emit({ type: 'log', level: 'info', msg: `${logPrefix} — overview specs (${overview.length}): ${overview.join(' | ')}` })
  }
  const bullets = text?.bullets ?? []
  emit({ type: 'log', level: 'info', msg: `${logPrefix} — ${bullets.length} bullet(s) extracted` })
  bullets.slice(0, 3).forEach((b, idx) => {
    emit({ type: 'log', level: 'info', msg: `  bullet ${idx + 1}: "${b.slice(0, 120)}"` })
  })
  const accordions = text?.accordionSections ?? []
  if (accordions.length > 0) {
    emit({ type: 'log', level: 'info', msg: `${logPrefix} — ${accordions.length} accordion section(s): ${accordions.map(s => `"${s.heading}" (${s.items.length})`).join(', ')}` })
  }
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
