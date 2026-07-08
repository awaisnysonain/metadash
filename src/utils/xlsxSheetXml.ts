/** Low-level helpers for patching Excel worksheet XML while preserving charts/styles. */

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function colToLetter(col: number): string {
  let s = '';
  let n = col;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function cellAddr(col: number, row: number): string {
  return `${colToLetter(col)}${row}`;
}

export function cellXml(address: string, value: string | number, style?: number): string {
  const isNum = typeof value === 'number';
  const t = isNum ? 'n' : 'str';
  const sAttr = style != null ? ` s="${style}"` : '';
  const v = isNum ? String(value) : escapeXml(String(value));
  return `<x:c r="${address}"${sAttr} t="${t}"><x:v>${v}</x:v></x:c>`;
}

export function rowXml(rowNum: number, values: (string | number | null | undefined)[], startCol = 1): string {
  const cells = values
    .map((v, i) => {
      if (v == null || v === '') return '';
      return cellXml(cellAddr(startCol + i, rowNum), v);
    })
    .join('');
  return `<x:row r="${rowNum}">${cells}</x:row>`;
}

export function splitSheetXml(xml: string): { prefix: string; sheetData: string; suffix: string } {
  const start = xml.indexOf('<x:sheetData>');
  const end = xml.indexOf('</x:sheetData>');
  if (start < 0 || end < 0) throw new Error('Invalid worksheet XML: missing sheetData');
  return {
    prefix: xml.slice(0, start),
    sheetData: xml.slice(start, end + '</x:sheetData>'.length),
    suffix: xml.slice(end + '</x:sheetData>'.length),
  };
}

export function extractHeaderRow(sheetXml: string): string {
  const { sheetData } = splitSheetXml(sheetXml);
  const m = sheetData.match(/<x:row r="1"[\s\S]*?<\/x:row>/);
  return m ? m[0] : '';
}

export function rebuildSheetData(
  sheetXml: string,
  dataRows: (string | number | null | undefined)[][],
  options?: { headerRow?: string; startRow?: number; startCol?: number }
): string {
  const { prefix, suffix } = splitSheetXml(sheetXml);
  const header = options?.headerRow ?? extractHeaderRow(sheetXml);
  const startRow = options?.startRow ?? 2;
  const startCol = options?.startCol ?? 1;
  const body = dataRows.map((values, i) => rowXml(startRow + i, values, startCol)).join('');
  return `${prefix}<x:sheetData>${header}${body}</x:sheetData>${suffix}`;
}

export function setCellInSheetXml(xml: string, address: string, value: string | number): string {
  const isNum = typeof value === 'number';
  const t = isNum ? 'n' : 'str';
  const v = isNum ? String(value) : escapeXml(String(value));
  const cellRe = new RegExp(`(<x:c r="${address}"[^>]*>)([\\s\\S]*?)(</x:c>)`);
  const match = xml.match(cellRe);
  if (!match) return xml;
  let open = match[1];
  if (open.includes(' t=')) open = open.replace(/ t="[^"]*"/, ` t="${t}"`);
  else open = open.replace(/(<x:c r="[^"]+")/, `$1 t="${t}"`);
  return xml.replace(cellRe, `${open}<x:v>${v}</x:v>${match[3]}`);
}

export function setCellsInSheetXml(
  xml: string,
  cells: Record<string, string | number | null | undefined>
): string {
  let next = xml;
  for (const [addr, value] of Object.entries(cells)) {
    if (value == null || value === '') continue;
    next = setCellInSheetXml(next, addr, value);
  }
  return next;
}
