import mammoth from 'mammoth'
import * as pdfjs from 'pdfjs-dist'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

async function extractPdfText(file) {
  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({ data }).promise
  const parts = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    parts.push(content.items.map(item => item.str).join(' '))
  }
  return parts.join('\n\n').trim()
}

async function extractDocxText(file) {
  const arrayBuffer = await file.arrayBuffer()
  const { value } = await mammoth.extractRawText({ arrayBuffer })
  return (value || '').trim()
}

/**
 * Extract plain text from an uploaded project file for knowledge storage / RAG.
 */
export async function extractFileText(file) {
  if (!file) throw new Error('No file provided')
  const name = file.name || ''
  const lower = name.toLowerCase()

  if (lower.endsWith('.pdf')) {
    const text = await extractPdfText(file)
    if (!text) throw new Error('PDF has no extractable text (it may be scanned images only).')
    return text
  }

  if (lower.endsWith('.docx')) {
    const text = await extractDocxText(file)
    if (!text) throw new Error('Word document appears empty or unreadable.')
    return text
  }

  if (lower.endsWith('.doc')) {
    try {
      const text = await extractDocxText(file)
      if (text) return text
    } catch {
      // fall through
    }
    throw new Error('Legacy .doc files are not supported. Open in Word and Save As .docx, then upload again.')
  }

  return (await file.text()).trim()
}
