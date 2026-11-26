import { MultipleChoiceQuestionSchema } from '../assessment/assessment-contract';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { exportOfficeQuestions } from '../question-bank/office-question-export';
import { previewOfficeQuestions } from '../question-bank/office-question-import';

const subject = 'IPAS';
const question = {
  subject,
  type: 'multiple_choice',
  body: 'Berapa gaya yang dibutuhkan?',
  options: [{ id: 'a', text: '10 N' }, { id: 'b', text: '20 N' }],
  difficulty: 'medium',
  answer: 'b',
  tags: [],
  rubric: null,
};
it('uses option content rather than alt text to distinguish images and rejects an identical image choice', () => {
  const a = { id: 'a', text: 'Diagram', parts: [
    { type: 'image', mediaId: '00000000-0000-4000-8000-000000000080', alt: 'Diagram' },
  ] };
  const b = { id: 'b', text: 'Diagram', parts: [
    { type: 'image', mediaId: '00000000-0000-4000-8000-000000000081', alt: 'Diagram' },
  ] };
  const { rubric: _rubric, ...input } = question;
  expect(MultipleChoiceQuestionSchema.parse({ ...input, options: [a, b] })).toMatchObject({ options: [a, b], answer: 'b' });
  expect(MultipleChoiceQuestionSchema.safeParse({
    ...input,
    options: [a, { ...b, text: 'Alt kedua', parts: [{ ...a.parts[0], alt: 'Alt kedua' }] }],
  }).success).toBe(false);
  expect(MultipleChoiceQuestionSchema.safeParse({
    ...input, options: [{ id: 'a', text: ' gaya ' }, { id: 'b', text: 'GAYA' }],
  }).success).toBe(false);
});

const book = exportOfficeQuestions([question], [], 'xlsx').bytes;
const cell = (coordinate: string, value: string) =>
  `<c r="${coordinate}" t="inlineStr"><is><t>${value}</t></is></c>`;

function editSheet(sheet: number, edit: (xml: string) => string): Buffer {
  const files = unzipSync(book);
  const name = `xl/worksheets/sheet${sheet}.xml`;
  files[name] = strToU8(edit(strFromU8(files[name]!)));
  return Buffer.from(zipSync(files));
}

describe('Office question preview', () => {
  it('reports a row with missing code while preserving other valid rows', () => {
    const file = editSheet(1, (xml) => xml.replace('</sheetData>',
      `<row r="3">${cell('D3', 'Soal tanpa kode')}</row></sheetData>`));
    const result = previewOfficeQuestions(file, subject);
    expect(result.rows.map(({ code }) => code)).toEqual(['Q001']);
    expect(result.errors).toEqual([{ code: 'Soal baris 3', message: 'Kode soal harus seperti Q001.' }]);
  });

  it('normalizes codes before rejecting duplicates', () => {
    const file = editSheet(1, (xml) => xml.replace('</sheetData>',
      `<row r="3">${cell('A3', 'q001')}</row></sheetData>`));
    const result = previewOfficeQuestions(file, subject);
    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([{ code: 'Q001', message: 'Kode soal tercantum lebih dari satu kali.' }]);
  });

  it('reports orphan links and formula cells on auxiliary sheets', () => {
    const file = editSheet(2, (xml) => xml.replace('</sheetData>',
      `<row r="2">${cell('A2', 'Q999')}${cell('B2', 'p1')}</row>` +
      `<row r="3">${cell('A3', 'Q001')}<c r="C3"><f>1+1</f><v>2</v></c></row></sheetData>`));
    const result = previewOfficeQuestions(file, subject);
    expect(result.errors).toEqual([
      { code: 'Q001', message: 'Pasangan baris 3 berisi formula Excel. Gunakan nilai atau teks.' },
      { code: 'Q999', message: 'Kode pada lembar Pasangan tidak memiliki soal induk.' },
    ]);
  });

  it('accepts the rubric summary shape but withholds rows with formula errors', () => {
    const file = editSheet(3, (xml) => xml.replace('</sheetData>',
      `<row r="3">${cell('D3', 'Total bobot Q001')}<c r="E3"><f>SUM(E2:E2)</f><v>100</v></c></row>` +
      `<row r="4">${cell('A4', 'Q001')}${cell('D4', 'Total bobot Q001')}<c r="E4"><f>SUM(E2:E2)</f><v>100</v></c></row></sheetData>`));
    const result = previewOfficeQuestions(file, subject);
    expect(result).toMatchObject({
      errors: [{ code: 'Q001', message: 'Rubrik baris 4 berisi formula Excel. Gunakan nilai atau teks.' }],
      rows: [],
    });
  });
});

describe('Naskah cetak siswa', () => {
  it('retains multilingual question text and choices without serializing keys or rubrics', () => {
    const exportFile = exportOfficeQuestions([
      { ...question, body: 'السَّلَامُ ꦲꦤꦕꦫꦏ <b>kode</b>' },
      {
        ...question, type: 'essay', body: 'Jelaskan hasil pengamatan.',
        answer: 'PANDUAN-PRIVAT', rubric: [{ id: 'r1', name: 'RUBRIK-PRIVAT', maxScore: 4, weight: 100 }],
      },
      {
        ...question, type: 'matching', body: 'Pasangkan pilihan.',
        options: [{ id: 'p1', prompt: 'Benda pertama', match: 'Zat kedua' },
          { id: 'p2', prompt: 'Benda kedua', match: 'Air pertama' }],
        answer: JSON.stringify({ p1: 'p1', p2: 'p2' }),
      },
    ], [], 'student-print');
    const html = exportFile.bytes.toString('utf8');
    expect(exportFile.mime).toBe('text/html; charset=utf-8');
    expect(html).toContain('السَّلَامُ ꦲꦤꦕꦫꦏ &lt;b&gt;kode&lt;/b&gt;');
    expect(html).toContain('<ol type="A"><li dir="auto">10 N</li><li dir="auto">20 N</li></ol>');
    expect(html).toContain('<ol type="A"><li dir="auto">Air pertama</li><li dir="auto">Zat kedua</li></ol>');
    expect(html).not.toMatch(/PANDUAN-PRIVAT|RUBRIK-PRIVAT|Kunci jawaban/);
  });
});

describe('Office choice integrity', () => {
  const withOptionE = {
    ...question,
    options: [
      ...question.options,
      { id: 'c', text: '30 N' },
      { id: 'd', text: '40 N' },
      { id: 'e', text: '50 N' },
    ],
  };

  it('round-trips plain A–E without changing the key', () => {
    for (const format of ['xlsx', 'docx'] as const) {
      const result = previewOfficeQuestions(exportOfficeQuestions([{ ...withOptionE, answer: 'e' }], [], format).bytes, subject);
      expect(result.errors).toEqual([]);
      expect(result.rows).toMatchObject([{ question: { options: withOptionE.options, answer: 'e' } }]);
    }
  });

  it.each(['a', 'e'])('preserves native Word Equation in E and keeps key %s', (answer) => {
    const files = unzipSync(exportOfficeQuestions([{ ...withOptionE, answer }, question], [], 'docx').bytes);
    const content = strFromU8(files['word/document.xml']!)
      .replace('E. 50 N</w:t></w:r>', 'E. </w:t></w:r><m:oMath><m:r><m:t>50</m:t></m:r></m:oMath>');
    files['word/document.xml'] = strToU8(content);
    const result = previewOfficeQuestions(Buffer.from(zipSync(files)), subject);
    expect(result.errors).toEqual([]);
    const imported = result.rows[0]?.question;
    expect(imported).toMatchObject({ type: 'multiple_choice', answer,
      options: [...withOptionE.options.slice(0, 4), { id: 'e', parts: [{ type: 'formula', latex: '50' }] }],
    });
  });

  it('round-trips an option with text, an image and a formula through Word and Excel', () => {
    const image = {
      id: '00000000-0000-4000-8000-000000000080', width: 1, height: 1, contentType: 'image/png',
      bytes: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jT1cAAAAASUVORK5CYII=', 'base64'),
    };
    const first = { id: 'a', text: 'Gaya pada grafik', parts: [
      { type: 'text', text: 'Pilih ' },
      { type: 'image', mediaId: image.id, alt: 'Gambar gaya' },
      { type: 'formula', latex: String.raw`F = m \times a` },
    ] };
    for (const mode of ['docx', 'xlsx'] as const) {
      const file = exportOfficeQuestions([{ ...question, options: [first, question.options[1]!] }], [image], mode);
      const parsed = previewOfficeQuestions(file.bytes, subject);
      expect(parsed.errors).toEqual([]);
      expect(parsed.rows[0]?.question).toMatchObject({ answer: 'b', options: [
        { id: 'a', parts: [ first.parts[0], { type: 'image', mediaId: parsed.rows[0]?.assets[0]?.optionRef, alt: 'Gambar gaya' }, first.parts[2] ] },
        question.options[1],
      ] });
      expect(parsed.rows[0]?.assets[0]?.image.bytes.equals(image.bytes)).toBe(true);
    }
  });

  it.each(['a', 'e'])('withholds XLSX question with a drawing in E and key %s', (answer) => {
    const files = unzipSync(exportOfficeQuestions([{ ...withOptionE, answer }, question], [], 'xlsx').bytes);
    const name = 'xl/worksheets/sheet1.xml';
    files[name] = strToU8(strFromU8(files[name]!).replace('</worksheet>', '<drawing r:id="rId1"/></worksheet>'));
    files['xl/worksheets/_rels/sheet1.xml.rels'] = strToU8('<Relationships><Relationship Id="rId1" Target="../drawings/drawing1.xml"/></Relationships>');
    files['xl/drawings/drawing1.xml'] = strToU8('<wsDr><oneCellAnchor><from><col>8</col><row>1</row></from><pic/></oneCellAnchor></wsDr>');
    const result = previewOfficeQuestions(Buffer.from(zipSync(files)), subject);
    expect(result.rows.map(({ code }) => code)).toEqual(['Q002']);
    expect(result.errors).toEqual([{ code: 'Q001', message: expect.stringContaining('opsi E') }]);

    files['xl/drawings/drawing1.xml'] = strToU8('<wsDr><absoluteAnchor><pic/></absoluteAnchor></wsDr>');
    expect(() => previewOfficeQuestions(Buffer.from(zipSync(files)), subject)).toThrow('tidak dapat dikaitkan dengan satu soal');
  });

  it('recognizes legacy Office signatures and rejects a gap in option letters', () => {
    const legacy = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expect(() => previewOfficeQuestions(legacy, subject)).toThrow('Simpan Sebagai');
    const file = editSheet(1, (xml) => xml.replace('</row></sheetData>', cell('I2', 'Opsi E') + '</row></sheetData>'));
    const result = previewOfficeQuestions(file, subject);
    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([{ code: 'Q001', message: expect.stringContaining('tanpa melewati huruf') }]);
  });
});
