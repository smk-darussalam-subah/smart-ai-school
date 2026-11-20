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

  it('reads the editable row while accepting the published rubric summary shape', () => {
    const file = editSheet(3, (xml) => xml.replace('</sheetData>',
      `<row r="3">${cell('D3', 'Total bobot Q001')}<c r="E3"><f>SUM(E2:E2)</f><v>100</v></c></row>` +
      `<row r="4">${cell('A4', 'Q001')}${cell('D4', 'Total bobot Q001')}<c r="E4"><f>SUM(E2:E2)</f><v>100</v></c></row></sheetData>`));
    const result = previewOfficeQuestions(file, subject);
    expect(result).toMatchObject({
      errors: [{ code: 'Q001', message: 'Rubrik baris 4 berisi formula Excel. Gunakan nilai atau teks.' }],
      rows: [{ code: 'Q001', question: { answer: 'b' } }],
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
