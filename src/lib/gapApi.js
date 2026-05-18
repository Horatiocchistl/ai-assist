/** API base for Gap Analyzer (Electron serves from :3001, not relative /api). */
export function getGapApiBase() {
  if (typeof window !== 'undefined' && window.location?.port && window.location.port !== '5173') {
    return `${window.location.origin}/api/gap-analyzer`
  }
  return 'http://localhost:3001/api/gap-analyzer'
}

/** Prefer carousel product shot over A+ module for card thumbnails. */
export function pickThumbnailFilename(files) {
  if (!files?.length) return null
  const carousel = files.find(f => /^carousel_\d+\.png$/i.test(f))
  if (carousel) return carousel
  const png = files.find(f => /\.png$/i.test(f))
  return png || null
}
