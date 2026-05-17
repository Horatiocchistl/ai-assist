import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Single persistent browser instance for the session
let _browser = null
let _context = null

const COOKIES_PATH = path.join(__dirname, '..', '.amazon-session.json')

export async function getBrowserContext(headless = false) {
  if (_context) return _context

  _browser = await chromium.launch({
    headless,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
    ],
  })

  _context = await _browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/New_York',
    // Storage state restores cookies if file exists
    storageState: await _loadStorageState(),
  })

  // Mask webdriver flag
  await _context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
  })

  return _context
}

async function _loadStorageState() {
  try {
    const fs = await import('fs/promises')
    await fs.access(COOKIES_PATH)
    return COOKIES_PATH
  } catch {
    return undefined
  }
}

export async function saveSession() {
  if (!_context) return
  await _context.storageState({ path: COOKIES_PATH })
}

export async function closeBrowser() {
  try {
    if (_context) { await _context.close(); _context = null }
    if (_browser) { await _browser.close(); _browser = null }
  } catch { /* already closed */ }
}
