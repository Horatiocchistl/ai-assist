import * as XLSX from 'xlsx'

/**
 * Parse copy-spec spreadsheet to JSON for LLM (rows of string values per sheet).
 */
export function parseCopySpecBuffer(buffer, filename) {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (ext === 'csv') {
    const text = new TextDecoder().decode(buffer)
    return { sheets: { Sheet1: parseCsv(text) } }
  }

  const wb = XLSX.read(buffer, { type: 'array' })
  const sheets = {}
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name]
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    sheets[name] = rows
      .map(row => (Array.isArray(row) ? row : [row]).map(c => String(c ?? '').trim()))
      .filter(row => row.some(cell => cell.length > 0))
  }
  return { sheets }
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  return lines.map(line => {
    const cells = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        inQ = !inQ
        continue
      }
      if (ch === ',' && !inQ) {
        cells.push(cur.trim())
        cur = ''
        continue
      }
      cur += ch
    }
    cells.push(cur.trim())
    return cells
  })
}
