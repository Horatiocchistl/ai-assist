import path from 'path'
import fs from 'fs/promises'
import { delay, moveMouseTo, waitForViewportImages } from './human-behavior.js'

// Take a screenshot of the current viewport and save it
export async function captureViewport(page, outputPath) {
  await waitForViewportImages(page)
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await page.screenshot({ path: outputPath, type: 'png' })
  return outputPath
}

// Scroll to an element and screenshot it within the viewport
export async function captureElement(page, selector, outputPath) {
  try {
    const el = await page.$(selector)
    if (!el) return null
    await el.scrollIntoViewIfNeeded()
    await delay(600, 1200)
    await waitForViewportImages(page)
    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    await el.screenshot({ path: outputPath, type: 'png' })
    return outputPath
  } catch {
    return null
  }
}

// Click through every carousel thumbnail and capture the full-size image for each.
// Returns an array of { index, thumbSrc, imagePath } objects.
//
// Amazon's carousel structure (may need tuning after first real run):
//   Thumbnail list: #altImages ul li  (or #imageBlock li.item)
//   Main image:     #landingImage     (or #imgBlkFront)
//
// This is intentionally defensive — we log what we find so selectors can be tuned.
export async function captureCarousel(page, outputDir, onProgress) {
  const captures = []

  // Scroll back to top so carousel is in view
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  await delay(1000, 1800)

  // Find all thumbnail elements
  const thumbSelector = '#altImages ul li.item, #altImages li.imageThumbnail, #imageBlock li.item'
  const thumbCount = await page.evaluate((sel) => {
    return document.querySelectorAll(sel).length
  }, thumbSelector)

  onProgress?.(`Found ${thumbCount} carousel thumbnail(s)`)

  if (thumbCount === 0) {
    // No thumbnails found — capture whatever main image is visible
    const heroPath = path.join(outputDir, 'carousel_01.png')
    const result = await captureElement(page, '#landingImage, #imgBlkFront, .a-dynamic-image', heroPath)
    if (result) captures.push({ index: 1, thumbSrc: null, imagePath: result })
    return captures
  }

  for (let i = 0; i < thumbCount; i++) {
    await delay(800, 1600)

    const thumbEls = await page.$$(thumbSelector)
    const thumb = thumbEls[i]
    if (!thumb) continue

    // Get thumbnail's source for reference
    const thumbSrc = await thumb.$eval('img', img => img.src).catch(() => null)

    // Move mouse to thumbnail naturally before clicking
    const box = await thumb.boundingBox()
    if (box) {
      await moveMouseTo(page, box.x + box.width / 2, box.y + box.height / 2, 15)
      await delay(200, 500)
    }

    await thumb.click()

    // Wait for main image to update to full resolution
    // Amazon swaps src on the main image element after thumbnail click
    await delay(1200, 2400)
    await waitForViewportImages(page, 6000)

    const label = String(i + 1).padStart(2, '0')
    const imagePath = path.join(outputDir, `carousel_${label}.png`)

    const result = await captureElement(page, '#landingImage, #imgBlkFront', imagePath)
    if (result) {
      captures.push({ index: i + 1, thumbSrc, imagePath: result })
      onProgress?.(`Captured carousel image ${i + 1}/${thumbCount}`)
    }
  }

  return captures
}

// Find and capture all A+ content modules on the page.
// Returns array of { index, imagePath } objects.
//
// Amazon A+ content container selectors (may need tuning after first real run):
//   #aplus, #aplus3p_feature_div, #aplusSections
//   Each module: .apm-tablemodule, .aplus-module, section inside #aplus
export async function captureAplusModules(page, outputDir, onProgress) {
  const captures = []

  // Scroll to A+ section first
  const aplusSelector = '#aplus, #aplus3p_feature_div'
  const aplusExists = await page.$(aplusSelector)
  if (!aplusExists) {
    onProgress?.('No A+ content section found')
    return captures
  }

  await aplusExists.scrollIntoViewIfNeeded()
  await delay(1200, 2200)

  // Find individual modules within A+ section
  const moduleSelector = [
    '#aplus .apm-tablemodule',
    '#aplus .aplus-module',
    '#aplus3p_feature_div .apm-tablemodule',
    '#aplus3p_feature_div .aplus-module',
  ].join(', ')

  const moduleCount = await page.evaluate((sel) => {
    return document.querySelectorAll(sel).length
  }, moduleSelector)

  onProgress?.(`Found ${moduleCount} A+ module(s)`)

  if (moduleCount === 0) {
    // Capture entire A+ section as one screenshot
    await waitForViewportImages(page)
    const sectionPath = path.join(outputDir, 'aplus_full.png')
    const result = await captureElement(page, aplusSelector, sectionPath)
    if (result) captures.push({ index: 1, imagePath: result })
    return captures
  }

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
      captures.push({ index: i + 1, imagePath: modulePath })
      onProgress?.(`Captured A+ module ${i + 1}/${moduleEls.length}`)
    } catch {
      onProgress?.(`Could not capture A+ module ${i + 1}`)
    }

    await delay(600, 1200)
  }

  return captures
}
