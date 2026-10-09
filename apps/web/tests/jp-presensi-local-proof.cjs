// Isolated browser proof of shared UI components, not a claim of backend persistence.
const { createRequire } = require('node:module');
const { mkdirSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
const qaRequire = createRequire('C:/Users/USER/.codex/tools/diis/node-tools/package.json');
const { chromium } = qaRequire('playwright');
const hostDate = process.env.JP_PROOF_BROWSER_DATE ?? '2026-10-08';
assert(/^2026-10-(08|22)$/.test(hostDate), 'Use a documented synthetic browser clock date');
const output = resolve(__dirname, '../../../.tasks/evidence/jp-presensi-followup-20261008/browser-' + hostDate);
mkdirSync(output, { recursive: true });
const base = 'http://127.0.0.1:3107/local-preview/jp-presensi';
const results = [];
const viewports = [
  { width: 360, height: 844 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 768, height: 1050 },
  { width: 844, height: 390 },
  { width: 1440, height: 1050 },
];
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  try {
    for (const viewport of viewports) {
      const { width, height } = viewport;
      const context = await browser.newContext({
        viewport,
        reducedMotion: 'reduce',
        permissions: ['geolocation'],
      });
      const page = await context.newPage();
      // Deliberately differs from Oct 6 fixture; preview must bind its own data period.
      await page.clock.setFixedTime(new Date(hostDate + 'T03:00:00Z'));
      page.setDefaultTimeout(10000);
      console.log('Checking viewport ' + width);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const checkOverflow = async (view) => {
        const dimensions = await page.evaluate(() => ({
          content: document.documentElement.scrollWidth,
          viewport: innerWidth,
        }));
        if (dimensions.content > dimensions.viewport + 1) {
          await page.screenshot({
            path: resolve(output, `overflow-${view}-${width}.png`),
            fullPage: true,
          });
          console.log(
            await page.evaluate(() =>
              [...document.querySelectorAll('main *')]
                .filter(
                  (element) =>
                    element.getBoundingClientRect().right > innerWidth + 1 &&
                    element.getBoundingClientRect().width > 0,
                )
                .slice(0, 12)
                .map((element) => ({
                  tag: element.tagName,
                  classes: element.className,
                  right: element.getBoundingClientRect().right,
                })),
            ),
          );
        }
        assert(
          dimensions.content <= dimensions.viewport + 1,
          `${width} ${view}: document overflow ${JSON.stringify(dimensions)}`,
        );
        results.push({ width, height, view, documentOverflow: false });
      };
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.locator('[data-preview-ready="true"]').waitFor();
      await page.getByRole('heading', { name: 'Penjadwalan Mengajar', exact: true }).waitFor();
      const headingFont = await page
        .getByRole('heading', { name: 'Penjadwalan Mengajar', exact: true })
        .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
      assert.equal(headingFont, width < 640 ? 20 : 24, 'Responsive page heading size');
      await page.screenshot({ path: resolve(output, `schedule-top-${width}.png`) });
      await checkOverflow('schedule');
      await page.getByRole('button', { name: 'Coba Tambah Slot', exact: true }).click();
      await page.screenshot({ path: resolve(output, `slot-${width}.png`), fullPage: true });
      await page.getByLabel('Hari pratinjau slot', { exact: true }).selectOption('2');
      assert.equal(await page.getByLabel('JP mulai pratinjau').locator('option').count(), 10);
      await page.getByLabel('Hari pratinjau slot', { exact: true }).selectOption('5');
      assert.equal(await page.getByLabel('JP mulai pratinjau').locator('option').count(), 8);
      await page.screenshot({ path: resolve(output, `schedule-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Presensi Guru', exact: true }).click();
      await page.getByText('Datang 07.45–08.00 WIB', { exact: true }).waitFor();
      await page.screenshot({ path: resolve(output, `teacher-top-${width}.png`) });
      await checkOverflow('teacher');
      await page.getByLabel('Uji sapaan otomatis').check();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Presensi Masuk Sekarang', exact: true })
        .waitFor();
      await page.keyboard.press('Tab');
      assert(
        await page
          .getByRole('dialog')
          .evaluate((element) => element.contains(document.activeElement)),
        'Modal keyboard focus escapes',
      );
      await page.keyboard.press('Escape');
      await page.getByLabel('Uji sapaan otomatis').uncheck();
      await page.getByLabel('Aturan kehadiran pratinjau').selectOption('TU');
      await page.getByText('Jam masuk tenaga kependidikan: 07.00 WIB.', { exact: true }).waitFor();
      await page.getByLabel('Aturan kehadiran pratinjau').selectOption('PRINCIPAL');
      await page
        .getByText('Kepala sekolah tidak terikat batas waktu kehadiran.', { exact: false })
        .waitFor();
      await page.getByLabel('Aturan kehadiran pratinjau').selectOption('NO_SCHEDULE');
      await page
        .getByText('Tidak ada jadwal mengajar hari ini. Anda tidak ditandai', { exact: false })
        .waitFor();
      await page.getByLabel('Aturan kehadiran pratinjau').selectOption('TEACHER');
      await page.getByLabel('Simulasikan gagal simpan').check();
      await page.getByRole('button', { name: 'Presensi Masuk Sekarang', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Presensi Masuk Sekarang', exact: true }).click();
      await dialog.getByRole('alert').filter({ hasText: 'presensi belum tersimpan' }).waitFor();
      assert.equal(await dialog.getByText('Presensi berhasil', { exact: true }).count(), 0);
      await page.screenshot({ path: resolve(output, `save-error-${width}.png`) });
      await dialog.getByRole('button', { name: 'Nanti', exact: true }).click();
      await page.getByLabel('Simulasikan gagal simpan').uncheck();
      await page.getByLabel('Skenario lokasi').selectOption('GPS_FAILED');
      await page.getByRole('button', { name: 'Presensi Masuk Sekarang', exact: true }).click();
      await dialog.getByText('Belum terverifikasi', { exact: true }).waitFor();
      assert.equal(await dialog.getByText('Di luar area', { exact: true }).count(), 0);
      await page.screenshot({ path: resolve(output, `gps-blocked-${width}.png`) });
      await dialog.getByRole('button', { name: 'Nanti', exact: true }).click();
      await page.getByLabel('Skenario lokasi').selectOption('INSIDE');
      await page.getByRole('button', { name: 'Presensi Masuk Sekarang', exact: true }).click();
      await dialog.getByText('Di area sekolah', { exact: true }).first().waitFor();
      await page.screenshot({ path: resolve(output, `popup-masuk-${width}.png`) });
      await dialog.getByRole('button', { name: 'Presensi Masuk Sekarang', exact: true }).click();
      await dialog.getByRole('link', { name: 'Buka Jadwal Hari Ini', exact: true }).waitFor();
      await dialog.getByText('XI TKJ 1 + XI TKJ 2', { exact: true }).waitFor();
      assert(
        await dialog
          .getByRole('link', { name: 'Buka Jadwal Hari Ini', exact: true })
          .evaluate((element) => {
            const box = element.getBoundingClientRect();
            return box.top >= 0 && box.bottom <= innerHeight;
          }),
        'Schedule CTA must remain in viewport',
      );
      await page.screenshot({ path: resolve(output, `popup-jadwal-${width}.png`) });
      await checkOverflow('success-schedule');
      await dialog.getByRole('button', { name: 'Selesai', exact: true }).click();
      await page.screenshot({ path: resolve(output, `teacher-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Rekap Super Admin', exact: true }).click();
      await page.getByRole('heading', { name: 'Rekap Pegawai', exact: true }).waitFor();
      const searchWidth = await page
        .getByPlaceholder('Nama pegawai…', { exact: true })
        .evaluate((element) => element.getBoundingClientRect().width);
      assert(searchWidth >= 160, 'Employee search must remain usable, not collapse under filters');
      await page.screenshot({ path: resolve(output, `admin-top-${width}.png`) });
      await (
        width < 768
          ? page.getByText('Kepala sekolah · tidak terikat batas jam', { exact: true })
          : page.getByRole('cell', { name: 'Tidak terikat jam', exact: true })
      )
        .first()
        .waitFor();
      await checkOverflow('admin');
      await page.screenshot({ path: resolve(output, `admin-${width}.png`), fullPage: true });
      const detailButtons =
        width < 768
          ? page.getByRole('button', { name: 'Detail', exact: true })
          : page.getByRole('button', { name: /^Detail / });
      await detailButtons.first().click();
      await page.getByRole('dialog').getByRole('heading', { name: 'Detail Pegawai' }).waitFor();
      await checkOverflow('admin-detail');
      await page.screenshot({ path: resolve(output, `admin-detail-${width}.png`) });
      const adminDialog = page.getByRole('dialog');
      await adminDialog.getByRole('button', { name: 'Koreksi', exact: true }).click();
      assert(
        await adminDialog
          .getByRole('button', { name: 'Simpan koreksi teraudit', exact: true })
          .isDisabled(),
      );
      await adminDialog.getByLabel('Masuk (WIB)', { exact: true }).fill('07:50');
      await adminDialog
        .getByLabel('Alasan koreksi', { exact: true })
        .fill('Alasan sintetis untuk uji koreksi lokal');
      await adminDialog
        .getByRole('button', { name: 'Simpan koreksi teraudit', exact: true })
        .click();
      await adminDialog.getByText('Koreksi manual', { exact: true }).waitFor();
      await adminDialog.getByRole('button', { name: 'Catatan', exact: true }).click();
      await adminDialog
        .getByLabel('Catatan baru', { exact: true })
        .fill('Catatan sintetis pemeriksaan antarmuka');
      await adminDialog.getByRole('button', { name: 'Tambah catatan', exact: true }).click();
      await adminDialog
        .getByText('Catatan sintetis pemeriksaan antarmuka', { exact: true })
        .waitFor();
      await adminDialog.getByRole('button', { name: 'Tutup', exact: true }).click();
      await page.getByRole('button', { name: 'Kebijakan presensi', exact: true }).click();
      await page
        .getByRole('dialog')
        .getByLabel('Guru: batas hadir sebelum mengajar (menit)', { exact: true })
        .waitFor();
      assert.equal(
        await page
          .getByRole('dialog')
          .getByLabel('Guru: batas hadir sebelum mengajar (menit)', { exact: true })
          .inputValue(),
        '15',
      );
      await checkOverflow('attendance-policy');
      await page.screenshot({ path: resolve(output, `policy-${width}.png`) });
      await page.keyboard.press('Escape');
      assert.deepEqual(errors, [], `${width}: JavaScript errors`);
      results.push({
        width,
        height,
        headingFont,
        roles: ['teacher', 'TU', 'principal', 'no-schedule'],
        JP: { Tuesday: 10, Friday: 8 },
        automaticGreetingGrantedInside: true,
        keyboardFocusTrapped: true,
        failedSaveFalseSuccess: false,
        GPSMissingNotOutside: true,
        JavaScriptErrors: errors,
      });
      await page.goto(base + '/period', { waitUntil: 'domcontentloaded' });
      await page.locator('[data-period-ready="true"]').waitFor();
      const form = page.getByRole('dialog', { name: 'Edit Slot Jadwal' });
      await form.waitFor();
      await form.getByRole('combobox', { name: 'JP mulai', exact: true }).click();
      assert.equal(await page.getByRole('option').count(), 12, 'Actual form must use future semester 12 JP');
      await page.getByRole('option', { name: /^JP 11 / }).click();
      await form.getByRole('button', { name: 'Uji validasi' }).click();
      await form.getByRole('status').filter({ hasText: 'Tidak ada data disimpan' }).waitFor();
      await form.getByRole('button', { name: 'Batal', exact: true }).focus();
      await page.keyboard.press('Tab');
      assert(await form.evaluate((element) => element.contains(document.activeElement)), 'Actual form retains keyboard focus');
      await checkOverflow('actual-future-period-form');
      await page.screenshot({ path: resolve(output, `future-period-form-${width}.png`) });
      await form.getByRole('button', { name: 'Batal', exact: true }).click();
      await page.getByLabel('Cakupan semester sintetis').selectOption('VARIED');
      await page.getByRole('button', { name: 'Buka formulir semester 2' }).click();
      await form.getByRole('status').filter({ hasText: 'Waktu JP bervariasi' }).waitFor();
      await form.getByRole('combobox', { name: 'JP mulai', exact: true }).click();
      assert.equal(await page.getByRole('option').count(), 10, 'JP choices must intersect all occurrences');
      await page.getByRole('option', { name: /^JP 10 / }).click();
      await checkOverflow('actual-varied-period-form');
      await form.getByRole('button', { name: 'Batal', exact: true }).click();
      await page.getByLabel('Cakupan semester sintetis').selectOption('GAP');
      await page.getByRole('button', { name: 'Buka formulir semester 2' }).click();
      await form.getByRole('status').filter({ hasText: 'Cakupan bel semester belum lengkap' }).waitFor();
      assert(await form.getByRole('button', { name: 'Uji validasi' }).isDisabled(), 'Coverage hole cannot submit');
      await checkOverflow('actual-missing-period-form');
      assert.deepEqual(errors, [], `${width}: no JavaScript errors including actual period form`);
      results.push({ width, height, view: 'period-form-regression', futureJP: 12, intersectedJP: 10, incompleteCoverageSubmit: false, productionForm: true, syntheticMutationBlocked: true });
      writeFileSync(resolve(output, 'browser-proof.json'), JSON.stringify(results, null, 2));
      await context.close();
    }
    writeFileSync(resolve(output, 'browser-proof.json'), JSON.stringify(results, null, 2));
    console.log(
      JSON.stringify({ passed: true, viewports, checks: results.length, evidence: output }),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
