// Runs at the start of each page visit.
// Probes every key selector and logs what the page actually contains.
// This is the primary debugging tool — if something breaks, this output shows why.

const SELECTORS = {
  // Product identity
  title:           '#productTitle',
  price:           '.a-price .a-offscreen, #priceblock_ourprice',

  // Bullets
  bullets:         '#feature-bullets ul li span.a-list-item',
  bulletsAlt:      '#featurebullets_feature_div li span',

  // Main image
  heroImage:       '#landingImage',
  heroImageAlt:    '#imgBlkFront',
  heroImageAlt2:   '.a-dynamic-image[data-old-hires]',

  // Carousel thumbnails
  thumbsMain:      '#altImages ul li.item',
  thumbsAlt1:      '#altImages li.imageThumbnail',
  thumbsAlt2:      '#imageBlock li.item',
  thumbsAlt3:      '#altImages ul li',
  thumbsAlt4:      '.imageThumbnail',

  // A+ content
  aplus:           '#aplus',
  aplus3p:         '#aplus3p_feature_div',
  aplusModules:    '#aplus .apm-tablemodule',
  aplusAlt:        '#aplus .aplus-module',
  aplusAlt2:       '#aplus3p_feature_div .apm-tablemodule',

  // Page sections
  dpContainer:     '#dp-container',
  imageBlock:      '#imageBlock, #imageBlock_feature_div',
  productOverview: '#productOverview_feature_div',
  brandSection:    '#brand',
}

export async function probePage(page, emit) {
  const url = page.url()
  emit({ type: 'log', level: 'info', msg: `PROBE — url: ${url}` })

  const title = await page.title()
  emit({ type: 'log', level: 'info', msg: `PROBE — document.title: "${title.slice(0, 100)}"` })

  // Check every selector
  emit({ type: 'log', level: 'info', msg: 'PROBE — selector results:' })
  const results = await page.evaluate((selectors) => {
    const out = {}
    for (const [key, sel] of Object.entries(selectors)) {
      const els = document.querySelectorAll(sel)
      out[key] = {
        count: els.length,
        firstText: els[0]?.innerText?.slice(0, 80)?.trim() || null,
        firstSrc:  els[0]?.src || els[0]?.querySelector('img')?.src || null,
      }
    }
    return out
  }, SELECTORS)

  for (const [key, val] of Object.entries(results)) {
    if (val.count > 0) {
      const detail = val.firstSrc
        ? `src="${val.firstSrc.slice(0, 80)}"`
        : val.firstText
          ? `text="${val.firstText}"`
          : ''
      emit({ type: 'log', level: 'info', msg: `  FOUND  [${key}] — ${val.count} element(s)  ${detail}` })
    } else {
      emit({ type: 'log', level: 'warn', msg: `  MISS   [${key}] — 0 elements` })
    }
  }

  // Log all img elements in the main image block area
  const imageBlockImgs = await page.evaluate(() => {
    const block = document.querySelector('#imageBlock, #imageBlock_feature_div, #img-canvas')
    if (!block) return []
    return Array.from(block.querySelectorAll('img')).slice(0, 20).map(img => ({
      id: img.id || null,
      class: img.className?.slice(0, 60) || null,
      src: img.src?.slice(0, 100) || null,
      dataSrc: img.getAttribute('data-old-hires')?.slice(0, 100) || img.getAttribute('data-a-dynamic-image')?.slice(0, 100) || null,
      width: img.naturalWidth,
      height: img.naturalHeight,
    }))
  })

  emit({ type: 'log', level: 'info', msg: `PROBE — image block contains ${imageBlockImgs.length} img element(s):` })
  for (const img of imageBlockImgs) {
    emit({ type: 'log', level: 'info', msg: `  img id="${img.id}" class="${img.class}" ${img.width}x${img.height} src="${img.src}"` })
  }

  // Scroll height
  const dims = await page.evaluate(() => ({
    scrollHeight: document.body.scrollHeight,
    viewportHeight: window.innerHeight,
    viewportWidth: window.innerWidth,
  }))
  emit({ type: 'log', level: 'info', msg: `PROBE — page dims: scroll=${dims.scrollHeight}px viewport=${dims.viewportWidth}x${dims.viewportHeight}` })

  return results
}
