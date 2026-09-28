import { createRequire } from 'node:module';
import { copyFile, mkdir, readFile, rmdir, stat, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const playwrightPath =
  process.env.DIIS_PLAYWRIGHT_MODULE ??
  'C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright';
const { chromium } = require(playwrightPath);
const writeExcelFile = require('write-excel-file/node').default;
const { unzipSync, zipSync, strFromU8, strToU8 } = require('fflate');

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const routeDir = path.join(webRoot, 'src/app/diis/qaimp-local');
const routeFile = path.join(routeDir, 'page.tsx');
const generatedTypeDir = path.join(webRoot, '.next/types/app/diis/qaimp-local');
const generatedTypeFile = path.join(generatedTypeDir, 'page.ts');
const fixtureFile = path.join(webRoot, 'tests/fixtures/import-qa-page.tsx.fixture');
const base = `${process.env.DIIS_QA_BASE_URL ?? 'http://localhost:3102'}/diis/qaimp-local`;
const userHeader = 'role,fullName,gender,email,phone,birthDate,niy,employmentStatus,address';
const studentHeader =
  'nis,namaSiswa,jenisKelamin,kelas,tanggalMasuk,status,namaWali,teleponWali,emailWali,reuseWaliByPhone,consentConfirmed';
const studentRows = [
  '00001,QAIMP Siswa A,L,X RPL 1,2026-07-15,active,QAIMP Wali,+6281234567890,,true,true',
  '00002,QAIMP Siswa B,P,X RPL 1,2026-07-15,active,QAIMP Wali,+6281234567890,,true,true',
];
let assertions = 0;

function check(condition, label) {
  if (!condition) throw new Error(label);
  assertions++;
  process.stdout.write(`PASS ${label}\n`);
}

async function setFile(dialog, content, name = 'qa-synthetic.csv') {
  await dialog.locator('input[type=file]').setInputFiles({
    name,
    mimeType: name.endsWith('.csv')
      ? 'text/csv'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(content),
  });
}

async function excel(sheet, data) {
  return Buffer.from(
    await writeExcelFile(
      data.map((line) => line.map((value) => ({ value, type: String }))),
      { sheet },
    ).toBuffer(),
  );
}

function replaceEntry(bytes, name, transform) {
  const entries = unzipSync(bytes);
  entries[name] = strToU8(transform(strFromU8(entries[name])));
  return Buffer.from(zipSync(entries));
}

function encryptedCentralEntry(bytes) {
  const output = Buffer.from(bytes);
  const index = output.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  if (index < 0) throw new Error('Missing central directory');
  output.writeUInt16LE(output.readUInt16LE(index + 8) | 1, index + 8);
  return output;
}

function duplicateEntry(bytes) {
  const entries = unzipSync(bytes);
  entries['xl/worksheets/sheet2.xml'] = entries['xl/worksheets/sheet1.xml'];
  const output = Buffer.from(zipSync(entries));
  const oldName = Buffer.from('xl/worksheets/sheet2.xml');
  const newName = Buffer.from('xl/worksheets/sheet1.xml');
  let offset = 0;
  let replaced = 0;
  while ((offset = output.indexOf(oldName, offset)) !== -1) {
    newName.copy(output, offset);
    replaced++;
    offset += newName.length;
  }
  if (replaced < 2) throw new Error('Duplicate fixture was not constructed');
  return output;
}

async function expectNoOverflow(page, dialog, label) {
  check(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    `${label}: page fits`,
  );
  check(
    await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    `${label}: dialog fits`,
  );
}

async function runUserDialog(page, width) {
  await page.getByRole('button', { name: 'Tambah Pengguna' }).click();
  const dialog = page.getByRole('dialog').first();
  await dialog.getByRole('button', { name: 'Import Massal' }).click();
  await setFile(
    dialog,
    `${userHeader}\nGURU,QAIMP Guru,L,qaimp@example.test,,2026-02-30,N001,GTY,`,
  );
  await dialog.getByText('tanggal lahir tidak valid').waitFor();
  check(
    (await page.locator('output[aria-label="Jumlah panggilan API"]').textContent()) === '0',
    `${width}: invalid user made no request`,
  );
  await dialog.getByRole('button', { name: 'Ubah' }).click();
  await dialog.getByLabel('Tanggal lahir (YYYY-MM-DD)').fill('2024-02-29');
  check(
    await dialog.getByRole('button', { name: /Impor.*pengguna/ }).isDisabled(),
    `${width}: edit invalidates validation`,
  );
  await dialog.getByRole('button', { name: 'Validasi Ulang' }).click();
  check(
    await dialog.getByRole('button', { name: /Impor.*pengguna/ }).isEnabled(),
    `${width}: corrected row revalidated`,
  );
  await dialog.getByRole('button', { name: /Impor.*pengguna/ }).click();
  let confirm = page.getByRole('dialog').last();
  await confirm.getByText(/Pastikan data yang diinput sudah benar/).waitFor();
  check(
    (await page.locator('output[aria-label="Jumlah panggilan API"]').textContent()) === '0',
    `${width}: confirmation precedes request`,
  );
  await confirm.getByRole('button', { name: 'Cek Lagi' }).click();
  check(
    (await page.locator('output[aria-label="Jumlah panggilan API"]').textContent()) === '0',
    `${width}: Cek Lagi cancels request`,
  );
  await page.locator('select[aria-label="Skenario API"]').selectOption('slow');
  await dialog.getByRole('button', { name: /Impor.*pengguna/ }).click();
  confirm = page.getByRole('dialog').last();
  await confirm.getByRole('button', { name: 'Submit' }).evaluate((button) => {
    button.click();
    button.click();
  });
  await page.getByText('1 berhasil').first().waitFor();
  check(
    (await page.locator('output[aria-label="Jumlah panggilan API"]').textContent()) === '1',
    `${width}: double submit made one request`,
  );
  await expectNoOverflow(page, dialog, `${width} user`);
  await dialog.getByRole('button', { name: 'Tutup' }).first().click();
  await page.getByRole('button', { name: 'Tambah Pengguna' }).click();
  check(
    (await page.getByRole('dialog').first().getByText('qa-synthetic.csv').count()) === 0,
    `${width}: user draft cleared on reopen`,
  );
  await page.getByRole('dialog').first().getByRole('button', { name: 'Tutup' }).first().click();

  await page.getByRole('button', { name: 'Tambah Pengguna' }).click();
  const reopened = page.getByRole('dialog').first();
  await reopened.getByRole('button', { name: 'Import Massal' }).click();
  await setFile(
    reopened,
    `${userHeader}\nGURU,QAIMP Lama,L,old@example.test,,2024-01-01,N002,GTY,`,
    'slow.csv',
  );
  await page.waitForFunction(() => typeof window.__releaseSlowImport === 'function');
  await reopened.getByRole('button', { name: 'Tutup' }).first().click();
  await page.getByRole('button', { name: 'Tambah Pengguna' }).click();
  const current = page.getByRole('dialog').first();
  await current.getByRole('button', { name: 'Import Massal' }).click();
  await setFile(
    current,
    `${userHeader}\nGURU,QAIMP Baru,L,new@example.test,,2024-01-01,N003,GTY,`,
    'new.csv',
  );
  await current.getByText('QAIMP Baru').waitFor();
  await page.evaluate(() => window.__releaseSlowImport());
  await page.waitForTimeout(200);
  check(
    (await current.getByText('QAIMP Baru').count()) > 0 &&
      (await current.getByText('QAIMP Lama').count()) === 0,
    `${width}: stale parse cannot replace current draft`,
  );
  await current.getByRole('button', { name: 'Tutup' }).first().click();
}

async function runStudentDialog(page, width) {
  await page.getByRole('button', { name: 'Impor Siswa' }).click();
  const dialog = page.getByRole('dialog').first();
  const downloaded = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Template XLSX' }).click();
  const template = await downloaded;
  check(template.suggestedFilename() === 'template-import-siswa.xlsx', 'XLSX template filename');
  await setFile(dialog, await readFile(await template.path()), template.suggestedFilename());
  await dialog.getByText('File hanya berisi header.').waitFor();
  check(
    (await page.locator('output[aria-label="Jumlah panggilan API"]').textContent()) === '1',
    'reopened template has no request',
  );

  await setFile(dialog, `${studentHeader}\n${studentRows[0].replace('2026-07-15', '2026-02-30')}`);
  await dialog.getByText('tanggal masuk tidak valid').waitFor();
  await dialog.getByRole('button', { name: 'Ubah' }).click();
  await dialog.getByLabel('Tanggal masuk (YYYY-MM-DD)').fill('2026-07-15');
  check(
    (await dialog.getByRole('button', { name: 'Impor 1 siswa' }).count()) === 0,
    `${width}: student edit has no submit before revalidation`,
  );
  await dialog.getByRole('button', { name: 'Validasi Ulang' }).click();
  check(
    await dialog.getByRole('button', { name: 'Impor 1 siswa' }).isEnabled(),
    `${width}: student corrected row revalidated`,
  );

  await setFile(dialog, [studentHeader, '', ...studentRows].join('\n'));
  await dialog.getByRole('button', { name: 'Impor 2 siswa' }).waitFor();
  check(
    (await dialog.getByRole('row').filter({ hasText: '00001' }).first().textContent()).includes(
      '3',
    ),
    'source row survives blank line',
  );
  await page.locator('select[aria-label="Skenario API"]').selectOption('partial');
  await dialog.getByRole('button', { name: 'Impor 2 siswa' }).click();
  await page.getByRole('dialog').last().getByRole('button', { name: 'Submit' }).click();
  await dialog.getByText('synthetic failure').first().waitFor();
  check(
    await dialog.getByRole('button', { name: 'Coba lagi 1 gagal' }).isEnabled(),
    'partial result maps one failed row',
  );
  await page.locator('select[aria-label="Skenario API"]').selectOption('ok');
  await dialog.getByRole('button', { name: 'Coba lagi 1 gagal' }).click();
  await page.getByRole('dialog').last().getByRole('button', { name: 'Submit' }).click();
  await dialog.getByText('2', { exact: true }).first().waitFor();
  check(
    (await page.locator('output[aria-label="Jumlah panggilan API"]').textContent()) === '3',
    'failed-only retry adds one request',
  );
  await expectNoOverflow(page, dialog, `${width} student`);

  const valid = await excel('Siswa', [studentHeader.split(','), studentRows[0].split(',')]);
  await setFile(dialog, valid, 'valid.xlsx');
  await dialog.getByRole('button', { name: 'Impor 1 siswa' }).waitFor();
  check(
    (await dialog.getByText('00001').count()) > 0,
    'production XLSX parser accepts text identity',
  );
  const zipped = unzipSync(valid);
  const formula = replaceEntry(valid, 'xl/worksheets/sheet1.xml', (xml) =>
    xml.replace('</sheetData>', '<row><c><f>1+1</f></c></row></sheetData>'),
  );
  const hidden = replaceEntry(valid, 'xl/workbook.xml', (xml) =>
    xml.replace('name="Siswa"', 'name="Siswa" state="hidden"'),
  );
  const oversized = Buffer.from(
    zipSync({ ...zipped, 'xl/large.xml': new Uint8Array(16 * 1024 * 1024 + 1) }),
  );
  const cases = [
    ['formula', formula, /Formula XLSX/i],
    ['macro', Buffer.from(zipSync({ ...zipped, 'xl/vbaProject.bin': strToU8('mock') })), /macro/i],
    [
      'external',
      Buffer.from(zipSync({ ...zipped, 'xl/externalLinks/externalLink1.xml': strToU8('mock') })),
      /macro/i,
    ],
    ['encrypted', encryptedCentralEntry(valid), /terenkripsi/i],
    ['corrupt', Buffer.from('not-a-zip'), /Struktur XLSX/i],
    [
      'wrong-sheet',
      await excel('Lain', [studentHeader.split(','), studentRows[0].split(',')]),
      /sheet/i,
    ],
    ['hidden-sheet', hidden, /sheet/i],
    ['duplicate-entry', duplicateEntry(valid), /Struktur XLSX/i],
    ['extraction-bound', oversized, /terlalu besar/i],
  ];
  for (const [name, bytes, error] of cases) {
    await setFile(dialog, bytes, `${name}.xlsx`);
    await dialog.getByText(error).first().waitFor();
    check(
      (await dialog.getByRole('button', { name: /Impor.*siswa/ }).count()) === 0,
      `${name}: guard blocks submit`,
    );
  }
  check(
    (await page.locator('output[aria-label="Jumlah panggilan API"]').textContent()) === '3',
    'invalid XLSX cases made no requests',
  );

  await setFile(dialog, [studentHeader, ...Array(37).fill(studentRows[0])].join('\n'));
  await dialog.getByText('Maksimal 36 baris data per file.').waitFor();
  check(
    (await dialog.getByRole('button', { name: /Impor.*siswa/ }).count()) === 0,
    '37 rows expose no submit payload',
  );
  await setFile(dialog, `${studentHeader}\n${studentRows[0]}`);
  await page.locator('select[aria-label="Skenario API"]').selectOption('reject');
  await dialog.getByRole('button', { name: 'Impor 1 siswa' }).click();
  await page.getByRole('dialog').last().getByRole('button', { name: 'Submit' }).click();
  await dialog.getByText(/Permintaan ditolak sebelum impor diproses/).waitFor();
  check(
    await dialog.getByRole('button', { name: 'Impor 1 siswa' }).isEnabled(),
    'confirmed rejection retains explicit retry',
  );

  await setFile(dialog, `${studentHeader}\n${studentRows[1]}`);
  await page.locator('select[aria-label="Skenario API"]').selectOption('network');
  await dialog.getByRole('button', { name: 'Impor 1 siswa' }).click();
  await page.getByRole('dialog').last().getByRole('button', { name: 'Submit' }).click();
  await dialog.getByText(/Hasil impor belum pasti/).waitFor();
  check(
    await dialog.getByRole('button', { name: 'Impor 1 siswa' }).isDisabled(),
    'ambiguous network outcome blocks retry',
  );
  check((await dialog.getByText('00002').count()) > 0, 'ambiguous result retains preview');
  await dialog.getByRole('button', { name: 'Reset' }).click();
  check((await dialog.getByText('00002').count()) === 0, 'reset clears student draft');
  await dialog.getByRole('button', { name: 'Tutup' }).first().click();
}

async function main() {
  await stat(fixtureFile);
  await mkdir(routeDir);
  let copied = false;
  let browser;
  try {
    await copyFile(fixtureFile, routeFile);
    copied = true;
    const chrome =
      process.env.DIIS_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
    browser = await chromium.launch({ headless: true, executablePath: chrome });
    for (const width of [1440, 390]) {
      const page = await browser.newPage({
        viewport: { width, height: width === 390 ? 844 : 900 },
        acceptDownloads: true,
      });
      await page.addInitScript(() => {
        const original = File.prototype.arrayBuffer;
        File.prototype.arrayBuffer = function () {
          if (this.name !== 'slow.csv') return original.call(this);
          return new Promise((resolve, reject) => {
            window.__releaseSlowImport = () => original.call(this).then(resolve, reject);
          });
        };
      });
      page.on('pageerror', (error) => process.stderr.write(`PAGE ERROR ${error.message}\n`));
      page.on('console', (message) => {
        if (message.type() === 'error') process.stderr.write(`CONSOLE ERROR ${message.text()}\n`);
      });
      try {
        await page.goto(base, { waitUntil: 'domcontentloaded' });
        await page.getByText('Synthetic importer QA').waitFor();
        await page.waitForTimeout(1200);
        await runUserDialog(page, width);
        await runStudentDialog(page, width);
      } finally {
        await page.close();
      }
    }
    process.stdout.write(`PASS ${assertions} synthetic browser assertions\n`);
  } finally {
    await browser?.close();
    if (copied) await unlink(routeFile);
    await rmdir(routeDir);
    await new Promise((resolve) => setTimeout(resolve, 300));
    await unlink(generatedTypeFile).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
    await rmdir(generatedTypeDir).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
