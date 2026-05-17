import path from 'path'
import fs from 'fs/promises'
import { delay, moveMouseTo, waitForViewportImages } from './human-behavior.js'

async function fileSizeKb(filePath) {
  try {
    const stat = await fs.stat(filePath)
    return Math.round(stat.size / 1024)
  } catch { return 0 }
}

export async function captureViewport(page, outputPath, emit) {
  await waitForViewportImages(page)
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await page.screenshot({ path: outputPath, type: 'png' })
  const kb = await fileSizeKb(outputPath)
  emit?.({ type: 'log', level: 'info', msg: `  screenshot saved: ${path.basename(outputPath)} (${kb}KB)` })
  return outputPath
}

export async function captureElement(page, selector, outputPath, emit) {
  const candidates = selector.split(',').map(s => s.trim())
  let el = null
  let matchedSel = null

  for (const sel of candidates) {
    el = await page.$(sel)
    if (el) { matchedSel = sel; break }
  }

  if (!el) {
    emit?.({ type: 'log', level: 'warn', msg: `  captureElement: no match for "${selector}"` })
    return null
  }

  emit?.({ type: 'log', level: 'info', msg: `  captureElement: matched "${matchedSel}"` })
  await el.scrollIntoViewIfNeeded()
  await delay(600, 1200)
  await waitForViewportImages(page)
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await el.screenshot({ path: outputPath, type: 'png' })
  const kb = await fileSizeKb(outputPath)
  emit?.({ type: 'log', level: 'info', msg: `  screenshot saved: ${path.basename(outputPath)} (${kb}KB)` })
  return outputPath
}

export async function captureCarousel(page, outputDir, emit) {
  const captures = []

  emit?.({ type: 'log', level: 'info', msg: 'CAROUSEL — scrolling to top' })
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  await delay(1000, 1800)

  // Try each known thumbnail selector and log what hits
  const thumbCandidates = [
    '#altImages ul li.item',
    '#altImages li.imageThumbnail',
    '#imageBlock li.item',
    '#altImages ul li',
    '.imageThumbnail',
  ]

  let thumbSelector = null
  let thumbCount = 0

  for (const sel of thumbCandidates) {
    const count = await page.evaluate(s => document.querySelectorAll(s).length, sel)
    emit?.({ type: 'log', level: count > 0 ? 'info' : 'warn', msg: `CAROUSEL — selector "${sel}" → ${count} element(s)` })
    if (count > 0 && !thumbSelector) {
      thumbSelector = sel
      thumbCount = count
    }
  }

  if (!thumbSelector) {
    emit?.({ type: 'log', level: 'warn', msg: 'CAROUSEL — no thumbnail selector matched, capturing main image only' })
    const heroPath = path.join(outputDir, 'carousel_01.png')
    const heroSel = '#landingImage, #imgBlkFront, .a-dynamic-image'
    const result = await captureElement(page, heroSel, heroPath, emit)
    if (result) captures.push({ index: 1, thumbSrc: null, imagePath: result })
    return captures
  }

  emit?.({ type: 'log', level: 'info', msg: `CAROUSEL — using "${thumbSelector}", ${thumbCount} thumbnail(s) to click through` })

  for (let i = 0; i < thumbCount; i++) {
    await delay(800, 1600)

    const thumbEls = await page.$$(thumbSelector)
    const thumb = thumbEls[i]
    if (!thumb) {
      emit?.({ type: 'log', level: 'warn', msg: `CAROUSEL — thumb[${i}] disappeared, skipping` })
      continue
    }

    const thumbSrc = await thumb.$eval('img', img => img.src).catch(() => null)
    emit?.({ type: 'log', level: 'info', msg: `CAROUSEL — clicking thumb ${i + 1}/${thumbCount} src="${thumbSrc?.slice(0, 80)}"` })

    const box = await thumb.boundingBox()
    if (box) {
      await moveMouseTo(page, box.x + box.width / 2, box.y + box.height / 2, 15)
      await delay(200, 500)
    } else {
      emit?.({ type: 'log', level: 'warn', msg: `CAROUSEL — thumb[${i}] has no bounding box` })
    }

    await thumb.click()
    await delay(1200, 2400)
    await waitForViewportImages(page, 6000)

    // Log what src the main image swapped to
    const mainSrc = await page.$eval(
      '#landingImage, #imgBlkFront',
      img => img.src
    ).catch(() => null)
    emit?.({ type: 'log', level: 'info', msg: `CAROUSEL — main image after click: "${mainSrc?.slice(0, 100)}"` })

    const label = String(i + 1).padStart(2, '0')
    const imagePath = path.join(outputDir, `carousel_${label}.png`)
    const result = await captureElement(page, '#landingImage, #imgBlkFront', imagePath, emit)
    if (result) captures.push({ index: i + 1, thumbSrc, imagePath: result })
  }

  emit?.({ type: 'log', level: 'info', msg: `CAROUSEL — done, ${captures.length} image(s) captured` })
  return captures
}

export async function captureAplusModules(page, outputDir, emit) {
  const captures = []

  const aplusCandidates = ['#aplus', '#aplus3p_feature_div']
  let aplusEl = null
  let aplusSel = null

  for (const sel of aplusCandidates) {
    aplusEl = await page.$(sel)
    if (aplusEl) { aplusSel = sel; break }
    emit?.({ type: 'log', level: 'warn', msg: `APLUS — "${sel}" not found` })
  }

  if (!aplusEl) {
    emit?.({ type: 'log', level: 'warn', msg: 'APLUS — no A+ content section found on this page' })
    return captures
  }

  emit?.({ type: 'log', level: 'info', msg: `APLUS — found section via "${aplusSel}"` })
  await aplusEl.scrollIntoViewIfNeeded()
  await delay(1200, 2200)

  const moduleCandidates = [
    `${aplusSel} .apm-tablemodule`,
    `${aplusSel} .aplus-module`,
    `${aplusSel} > div`,
  ]

  let moduleSelector = null
  let moduleCount = 0

  for (const sel of moduleCandidates) {
    const count = await page.evaluate(s => document.querySelectorAll(s).length, sel)
    emit?.({ type: 'log', level: count > 0 ? 'info' : 'warn', msg: `APLUS — module selector "${sel}" → ${count} element(s)` })
    if (count > 0 && !moduleSelector) {
      moduleSelector = sel
      moduleCount = count
    }
  }

  if (!moduleSelector) {
    emit?.({ type: 'log', level: 'warn', msg: 'APLUS — no modules found, capturing entire section as one image' })
    await waitForViewportImages(page)
    const sectionPath = path.join(outputDir, 'aplus_full.png')
    const result = await captureElement(page, aplusSel, sectionPath, emit)
    if (result) captures.push({ index: 1, imagePath: result })
    return captures
  }

  emit?.({ type: 'log', level: 'info', msg: `APLUS — ${moduleCount} module(s) via "${moduleSelector}"` })
  const moduleEls = await page.$$(moduleSelector)

  for (let i = 0; i < moduleEls.length; i++) {
    const el = moduleEls[i]
    await el.scrollIntoViewIfNeeded()
    await delay(900, 1800)
    await waitForViewportImages(page)

    const label = String(i + 1).padStart(2, '0')
    const modulePath = path.join(outputDir, `aplus_${label}.png`)

    try {
      await fs.mkdir(path.dirname(modulePath), { recursive: true })
      await el.screenshot({ path: modulePath, type: 'png' })
      const kb = await fileSizeKb(modulePath)
      emit?.({ type: 'log', level: 'info', msg: `APLUS — module ${i + 1}/${moduleCount} saved (${kb}KB)` })
      captures.push({ index: i + 1, imagePath: modulePath })
    } catch (err) {
      emit?.({ type: 'log', level: 'error', msg: `APLUS — module ${i + 1} screenshot failed: ${err.message}` })
    }

    await delay(600, 1200)
  }

  return captures
}
