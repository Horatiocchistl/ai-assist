import fs from 'fs/promises'
import path from 'path'
import { extractAsin } from '../src/lib/extractAsin.js'

const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp|heic|heif|tiff?)$/i
const COPY_SPEC_RE = /^copy[-_]?spec\.(xlsx|xls|csv)$/i
const SPREADSHEET_RE = /\.(xlsx|xls|csv)$/i
const PRODUCT_DATA = 'product-data.json'
const URL_TEXT_RE = /\.(txt|md|url)$/i
const MAX_URL_FILE_BYTES = 32 * 1024

function mimeFromFilename(name) {
  const ext = name.split('.').pop()?.toLowerCase()
  const map = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    bmp: 'image/bmp',
    heic: 'image/heic',
    heif: 'image/heif',
    tif: 'image/tiff',
    tiff: 'image/tiff',
  }
  return map[ext] || 'application/octet-stream'
}

function labelFromFilename(filename) {
  return filename.replace(/\.[^.]+$/, '')
}

function spreadsheetKind(name) {
  if (COPY_SPEC_RE.test(name)) return 'copy_spec'
  if (SPREADSHEET_RE.test(name)) return 'copy_spec'
  return null
}

function isUrlCandidateFile(fname, size) {
  if (URL_TEXT_RE.test(fname)) return true
  if (fname.includes('.')) return false
  return size > 0 && size <= MAX_URL_FILE_BYTES
}

async function tryParseUrlFromFile(entry, abs, fname) {
  const stat = await fs.stat(abs).catch(() => null)
  if (!stat?.isFile() || stat.size > MAX_URL_FILE_BYTES) return

  if (!isUrlCandidateFile(fname, stat.size)) return

  const text = await fs.readFile(abs, 'utf-8').catch(() => '')
  entry.txtFiles.push({
    filename: fname,
    preview: text.slice(0, 500).trim(),
    hasUrl: !!extractAsin(text),
  })
  const parsed = extractAsin(text)
  if (parsed && !entry.url) {
    entry.url = parsed.url
    entry.asin = parsed.asin
  }
}

async function collectFilesInDir(dirPath, entry, relPrefix = '') {
  let names
  try {
    names = await fs.readdir(dirPath, { withFileTypes: true })
  } catch {
    return
  }

  for (const ent of names) {
    if (ent.name.startsWith('.')) continue
    const abs = path.join(dirPath, ent.name)
    const relName = relPrefix ? `${relPrefix}/${ent.name}` : ent.name

    if (ent.isDirectory()) {
      if (!relPrefix) {
        await collectFilesInDir(abs, entry, ent.name)
      }
      continue
    }

    if (!ent.isFile()) continue

    if (IMAGE_RE.test(ent.name)) {
      entry.images.push({
        filename: relName,
        absolutePath: abs,
        label: labelFromFilename(path.basename(ent.name)),
      })
    } else if (spreadsheetKind(ent.name)) {
      if (!entry.copySpecFile) {
        entry.copySpecFile = { filename: relName, absolutePath: abs }
      }
    } else if (ent.name === PRODUCT_DATA) {
      entry.productDataFile = { filename: relName, absolutePath: abs }
    } else {
      await tryParseUrlFromFile(entry, abs, relName)
    }
  }
}

/**
 * Scan one product directory: images (incl. one subfolder level) + Amazon URL in text files.
 */
async function scanProductDir(dirPath, folderName) {
  const entry = {
    folderName,
    asin: null,
    url: null,
    images: [],
    txtFiles: [],
    copySpecFile: null,
    productDataFile: null,
    warnings: [],
  }

  await collectFilesInDir(dirPath, entry)

  entry.images.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { sensitivity: 'base' }))
  entry.images.forEach((img, i) => { img.sort_index = i })

  if (!entry.images.length) {
    entry.warnings.push('No image files found')
  }
  if (!entry.url) {
    entry.warnings.push('No Amazon URL found in text files')
  }

  return entry
}

function isComplete(entry) {
  return !!(entry.url && entry.asin && entry.images.length > 0)
}

function classifyScan(scanned) {
  if (isComplete(scanned)) return 'ready'
  if (scanned.images.length > 0 && !scanned.url) return 'needs_url'
  return 'skip'
}

function formatSkipError(folderName, scanned) {
  const parts = []
  if (scanned.images.length) {
    const names = scanned.images.map(i => i.filename).slice(0, 5)
    const more = scanned.images.length > 5 ? ` +${scanned.images.length - 5} more` : ''
    parts.push(`found ${scanned.images.length} image(s) (${names.join(', ')}${more})`)
  } else {
    parts.push('no images')
  }
  if (!scanned.url) {
    if (scanned.txtFiles.length) {
      parts.push(`no Amazon URL in: ${scanned.txtFiles.map(t => t.filename).join(', ')}`)
    } else {
      parts.push('no text file with URL (.txt, .md, .url)')
    }
  }
  return `"${folderName}": ${parts.join('; ')}`
}

export async function scanPlannedFolder(sourcePath) {
  const errors = []
  const root = path.resolve(sourcePath)
  const stat = await fs.stat(root).catch(() => null)
  if (!stat?.isDirectory()) {
    return { name: path.basename(root), sourcePath: root, asins: [], needsUrl: [], errors: ['Not a directory'] }
  }

  const name = path.basename(root)
  const entries = await fs.readdir(root, { withFileTypes: true })
  const subdirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'))
  const asins = []
  const needsUrl = []

  for (const ent of subdirs) {
    const scanned = await scanProductDir(path.join(root, ent.name), ent.name)
    const kind = classifyScan(scanned)
    if (kind === 'ready') {
      asins.push(scanned)
    } else if (kind === 'needs_url') {
      needsUrl.push(scanned)
    } else {
      errors.push(formatSkipError(ent.name, scanned))
    }
  }

  if (!asins.length && !needsUrl.length) {
    const rootScan = await scanProductDir(root, name)
    const kind = classifyScan(rootScan)
    if (kind === 'ready') {
      asins.push(rootScan)
    } else if (kind === 'needs_url') {
      needsUrl.push(rootScan)
    } else if (subdirs.length === 0) {
      errors.push(formatSkipError(name, rootScan))
    }
  }

  if (!asins.length && !needsUrl.length && !errors.length) {
    errors.push('No folders with image files were found')
  }

  return { name, sourcePath: root, asins, needsUrl, errors }
}

async function buildImportRow(a) {
  const files = []
  for (const img of a.images) {
    const buf = await fs.readFile(img.absolutePath)
    files.push({
      kind: 'image',
      filename: img.filename,
      label: img.label,
      sort_index: img.sort_index,
      buffer: buf,
      mime: mimeFromFilename(img.filename),
    })
  }
  if (a.copySpecFile) {
    const buf = await fs.readFile(a.copySpecFile.absolutePath)
    files.push({
      kind: 'copy_spec',
      filename: a.copySpecFile.filename,
      buffer: buf,
      mime: 'application/octet-stream',
    })
  }
  if (a.productDataFile) {
    const buf = await fs.readFile(a.productDataFile.absolutePath)
    files.push({
      kind: 'product_data',
      filename: a.productDataFile.filename,
      buffer: buf,
      mime: 'application/json',
    })
  }

  return {
    asin: a.asin,
    url: a.url,
    folderName: a.folderName,
    warnings: a.warnings,
    txtFiles: a.txtFiles || [],
    imageNames: a.images.map(i => i.filename),
    files,
    ready: !!(a.url && a.images.length > 0),
  }
}

export async function readPlannedFolderForImport(sourcePath) {
  const scan = await scanPlannedFolder(sourcePath)
  const asins = []
  const needsUrl = []

  for (const a of scan.asins) {
    asins.push(await buildImportRow(a))
  }
  for (const a of scan.needsUrl || []) {
    needsUrl.push(await buildImportRow(a))
  }

  return { ...scan, asins, needsUrl }
}
