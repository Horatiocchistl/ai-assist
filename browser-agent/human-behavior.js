// Human-pace timing and interaction utilities

export function delay(minMs, maxMs) {
  const ms = minMs + Math.random() * (maxMs - minMs)
  return new Promise(r => setTimeout(r, ms))
}

// Move mouse to a random position within a bounding box
export async function moveMouseTo(page, x, y, spread = 40) {
  const tx = x + (Math.random() - 0.5) * spread
  const ty = y + (Math.random() - 0.5) * spread
  await page.mouse.move(tx, ty, { steps: 8 + Math.floor(Math.random() * 8) })
}

// Scroll the viewport by `amount` pixels in smooth increments
export async function smoothScroll(page, amount) {
  const steps = 3 + Math.floor(Math.random() * 4)
  const stepSize = amount / steps
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, stepSize)
    await delay(60, 140)
  }
}

// Full human-pace scroll through the page, calling onPosition(scrollY) at each pause
// Caller uses onPosition to decide when to take screenshots
export async function humanScrollPage(page, onPosition, signal) {
  const pageHeight = await page.evaluate(() => document.body.scrollHeight)
  let scrollY = 0

  while (scrollY < pageHeight - 50) {
    if (signal?.aborted) break

    // Scroll chunk: 300–700px
    const chunk = 300 + Math.random() * 400
    scrollY = Math.min(scrollY + chunk, pageHeight)

    await page.evaluate(y => window.scrollTo({ top: y, behavior: 'smooth' }), scrollY)

    // Wait for content to settle after scroll
    await delay(900, 2600)

    // Occasional longer pause — simulates reading
    if (Math.random() < 0.2) await delay(1500, 3500)

    // Jitter mouse position slightly while "reading"
    const vw = await page.evaluate(() => window.innerWidth)
    await moveMouseTo(page, vw * 0.3 + Math.random() * vw * 0.4, 300 + Math.random() * 300)

    await onPosition(scrollY, pageHeight)

    // Re-check page height — lazy content may have expanded it
    const newHeight = await page.evaluate(() => document.body.scrollHeight)
    if (newHeight > pageHeight) {
      // Page grew (lazy load expanded it) — update reference
    }
  }
}

// Wait until all visible images in the viewport have fully loaded
export async function waitForViewportImages(page, timeoutMs = 8000) {
  await page.evaluate((timeout) => {
    return new Promise((resolve) => {
      const imgs = Array.from(document.querySelectorAll('img'))
        .filter(img => {
          const rect = img.getBoundingClientRect()
          return rect.top < window.innerHeight && rect.bottom > 0 && !img.complete
        })
      if (imgs.length === 0) return resolve()
      let loaded = 0
      const done = () => { if (++loaded >= imgs.length) resolve() }
      const timer = setTimeout(resolve, timeout)
      imgs.forEach(img => {
        img.addEventListener('load', done, { once: true })
        img.addEventListener('error', done, { once: true })
      })
    })
  }, timeoutMs)
}
