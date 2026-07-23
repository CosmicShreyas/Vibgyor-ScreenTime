/**
 * Download a 2D array of rows (first row = headers) as a CSV file.
 * Values are quote-escaped so commas/quotes/newlines are safe.
 */
export function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
