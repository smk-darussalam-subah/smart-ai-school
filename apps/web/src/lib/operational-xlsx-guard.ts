const MAX_XML_BYTES = 16 * 1024 * 1024;

interface ZipEntry {
  name: string;
  offset: number;
  compressed: number;
  uncompressed: number;
  method: number;
  flags: number;
}

function zipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('Struktur XLSX tidak valid.');
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  if (count === 0xffff || offset >= bytes.length || count > 256)
    throw new Error('Struktur XLSX tidak didukung.');
  const entries: ZipEntry[] = [];
  const names = new Set<string>();
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50)
      throw new Error('Struktur XLSX tidak valid.');
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const uncompressed = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > end || flags & 1 || ![0, 8].includes(method))
      throw new Error('XLSX terenkripsi atau tidak didukung.');
    const name = new TextDecoder('utf-8', { fatal: true }).decode(
      bytes.slice(offset + 46, offset + 46 + nameLength),
    );
    if (names.has(name)) throw new Error('Struktur XLSX tidak valid.');
    names.add(name);
    total += uncompressed;
    if (total > MAX_XML_BYTES || /(?:^|\/)\.\.(?:\/|$)/.test(name))
      throw new Error('XLSX terlalu besar atau tidak aman.');
    entries.push({ name, offset: localOffset, compressed, uncompressed, method, flags });
    offset = next;
  }
  return entries;
}

async function readEntry(bytes: Uint8Array, entry: ZipEntry): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = entry.offset;
  if (offset + 30 > bytes.length || view.getUint32(offset, true) !== 0x04034b50)
    throw new Error('Struktur XLSX tidak valid.');
  const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
  if (start + entry.compressed > bytes.length) throw new Error('Struktur XLSX tidak valid.');
  const input = bytes.slice(start, start + entry.compressed);
  let output: Uint8Array;
  if (entry.method === 0) output = input;
  else {
    const reader = new Blob([input])
      .stream()
      .pipeThrough(new DecompressionStream('deflate-raw'))
      .getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > entry.uncompressed || length > MAX_XML_BYTES)
          throw new Error('XLSX terlalu besar atau tidak aman.');
        chunks.push(value);
      }
    } catch (error) {
      await reader.cancel();
      throw error;
    } finally {
      reader.releaseLock();
    }
    output = new Uint8Array(length);
    let written = 0;
    for (const chunk of chunks) {
      output.set(chunk, written);
      written += chunk.length;
    }
  }
  if (output.length !== entry.uncompressed) throw new Error('Struktur XLSX tidak valid.');
  return output;
}

export async function guardOperationalXlsx(
  bytes: Uint8Array,
  expectedSheet: string,
): Promise<void> {
  const entries = zipEntries(bytes);
  if (
    entries.some(({ name }) =>
      /(?:vbaProject|externalLinks|embeddings|activeX|connections\.xml)/i.test(name),
    )
  ) {
    throw new Error('XLSX dengan macro, link, atau objek eksternal tidak didukung.');
  }
  const workbook = entries.find(({ name }) => name === 'xl/workbook.xml');
  const worksheet = entries.find(({ name }) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  if (
    !workbook ||
    !worksheet ||
    entries.filter(({ name }) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).length !== 1
  ) {
    throw new Error(`XLSX harus memiliki satu sheet bernama ${expectedSheet}.`);
  }
  let workbookBytes: Uint8Array | undefined;
  let worksheetBytes: Uint8Array | undefined;
  for (const entry of entries) {
    const contents = await readEntry(bytes, entry);
    if (entry.name === workbook.name) workbookBytes = contents;
    if (entry.name === worksheet.name) worksheetBytes = contents;
  }
  const decode = (contents: Uint8Array) =>
    new TextDecoder('utf-8', { fatal: true }).decode(contents);
  const parser = new DOMParser();
  const workbookXml = parser.parseFromString(decode(workbookBytes!), 'application/xml');
  const sheets = Array.from(workbookXml.getElementsByTagNameNS('*', 'sheet'));
  if (
    workbookXml.getElementsByTagName('parsererror').length ||
    sheets.length !== 1 ||
    sheets[0]?.getAttribute('name') !== expectedSheet ||
    (sheets[0]?.getAttribute('state') && sheets[0]?.getAttribute('state') !== 'visible')
  ) {
    throw new Error(`XLSX harus memiliki satu sheet terlihat bernama ${expectedSheet}.`);
  }
  const sheetXml = parser.parseFromString(decode(worksheetBytes!), 'application/xml');
  if (
    sheetXml.getElementsByTagName('parsererror').length ||
    sheetXml.getElementsByTagNameNS('*', 'f').length
  ) {
    throw new Error('Formula XLSX tidak boleh digunakan untuk impor.');
  }
  if (sheetXml.getElementsByTagNameNS('*', 'hyperlink').length)
    throw new Error('Link eksternal XLSX tidak didukung.');
}
