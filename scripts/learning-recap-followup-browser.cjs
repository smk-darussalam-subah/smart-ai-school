/* Local component proof only: real UI, synthetic actions; no school API/identity/database. */
const {
  chromium,
} = require('C:/Users/USER/.codex/tools/diis/node-tools/node_modules/@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const output = process.argv[2];
if (!output || fs.existsSync(path.join(output, 'browser.json')))
  throw Error('Fresh output directory required');
fs.mkdirSync(output, { recursive: true });
const checks = [],
  screenshots = [],
  consoleErrors = [];
const check = (name, value) => {
  checks.push({ name, pass: !!value });
  assert.ok(value, name);
};
const id = '00000000-0000-4000-8000-000000000002';
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const [name, viewport, colorScheme, isMobile] of [
      ['desktop-light', { width: 1440, height: 900 }, 'light', false],
      ['desktop-dark', { width: 1440, height: 900 }, 'dark', false],
      ['mobile-light', { width: 390, height: 844 }, 'light', true],
      ['mobile-dark', { width: 390, height: 844 }, 'dark', true],
    ]) {
      const context = await browser.newContext({
        viewport,
        colorScheme,
        isMobile,
        hasTouch: isMobile,
      });
      const page = await context.newPage();
      page.on('pageerror', (e) => consoleErrors.push({ name, kind: 'pageerror', text: e.message }));
      page.on('console', (e) => {
        if (['error', 'warning'].includes(e.type()))
          consoleErrors.push({ name, kind: e.type(), text: e.text() });
      });
      const snap = async (label) => {
        const file = `${name}-${label}.png`,
          target = path.join(output, file);
        await page.screenshot({ path: target, fullPage: true });
        screenshots.push({
          path: file,
          sha256: crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'),
        });
      };
      const action = (key) => page.locator(`[data-learning-action="${key}"]`);
      const focused = (locator) => locator.evaluate((el) => document.activeElement === el);
      const waitFocus = (key) =>
        page.waitForFunction(
          (key) => document.activeElement?.getAttribute('data-learning-action') === key,
          key,
        );
      const openJournal = async (key) => {
        await action(key).click();
        await page.locator('#j-title').waitFor();
        check(`${name}: initial journal focus`, await focused(page.locator('#j-title')));
      };
      await page.goto('http://127.0.0.1:3113/');
      await page.locator(`[data-learning-open="${id}"]`).click();
      await openJournal('summary-journals');
      await page.keyboard.press('Escape');
      await waitFocus('summary-journals');
      check(
        `${name}: Escape restores recreated trigger`,
        await focused(action('summary-journals')),
      );
      await openJournal('summary-journals');
      await page.getByRole('button', { name: 'Batal', exact: true }).click();
      await waitFocus('summary-journals');
      check(`${name}: Batal restores trigger`, await focused(action('summary-journals')));
      await page.getByRole('tab', { name: 'Jurnal', exact: true }).click();
      await openJournal('tab-journals');
      await page.keyboard.press('Escape');
      await waitFocus('tab-journals');
      check(
        `${name}: journal tab retained through refresh`,
        (await page
          .getByRole('tab', { name: 'Jurnal', exact: true })
          .getAttribute('aria-selected')) === 'true',
      );
      await openJournal('tab-journals');
      await page
        .locator('#j-detail')
        .fill('Kegiatan sintetis: mengamati teks, berdiskusi, dan menyusun ringkasan.');
      await page.getByRole('button', { name: 'Simpan jurnal', exact: true }).click();
      await page.getByText('Jurnal berhasil disimpan.', { exact: true }).waitFor();
      await page.locator('form').getByRole('button', { name: 'Tutup', exact: true }).click();
      await waitFocus('tab-journals');
      check(
        `${name}: successful save close restores trigger`,
        await focused(action('tab-journals')),
      );
      await openJournal('tab-journals');
      await page.evaluate(() => {
        window.learningQa.mode = 'save-error';
      });
      await page
        .locator('#j-detail')
        .fill('Draft sintetis yang harus tetap ada ketika penyimpanan ditolak.');
      await page.getByRole('button', { name: 'Simpan jurnal', exact: true }).click();
      await page.getByRole('alert').waitFor();
      check(
        `${name}: save error preserves draft`,
        (await page.locator('#j-detail').inputValue()) ===
          'Draft sintetis yang harus tetap ada ketika penyimpanan ditolak.',
      );
      await page.evaluate(() => {
        window.learningQa.mode = 'ready';
      });
      await page.getByRole('button', { name: 'Batal', exact: true }).click();
      await waitFocus('tab-journals');
      await openJournal('tab-journals');
      await page.evaluate(() => {
        window.learningQa.mode = 'context-slow';
      });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.learningQa.pending.length > 0);
      check(
        `${name}: slow refresh retains loading feedback`,
        (await page.getByText('Memuat data pembelajaran…', { exact: true }).count()) > 0,
      );
      await page.evaluate(() => {
        window.learningQa.mode = 'ready';
        window.learningQa.pending.splice(0).forEach((resolve) => resolve());
      });
      await waitFocus('tab-journals');
      check(
        `${name}: slow refresh eventually restores focus`,
        await focused(action('tab-journals')),
      );
      await snap('journal-focus-restored');
      await openJournal('tab-journals');
      await page.evaluate(() => {
        window.learningQa.mode = 'context-slow';
      });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => window.learningQa.pending.length > 0);
      const back = page.getByRole('button', { name: 'Kembali ke rekap', exact: true });
      await back.focus();
      await page.evaluate(() => {
        window.learningQa.mode = 'ready';
        window.learningQa.pending.splice(0).forEach((resolve) => resolve());
      });
      await action('tab-journals').waitFor();
      await page.waitForTimeout(90);
      check(`${name}: user-chosen focus not stolen after slow response`, await focused(back));
      await openJournal('tab-journals');
      await page.evaluate(() => {
        window.learningQa.mode = 'journal-revoked';
      });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.activeElement?.tagName === 'H2');
      check(
        `${name}: removed trigger falls back to detail heading`,
        await page
          .getByRole('heading', { name: 'Ruang pembelajaran', exact: true })
          .evaluate((el) => document.activeElement === el),
      );
      check(
        `${name}: removed capability has no write trigger`,
        (await page.locator('[data-learning-action$="journals"]').count()) === 0,
      );
      await page.getByLabel('Tampilan QA', { exact: true }).selectOption('standalone');
      await page.locator('[data-standalone-journal]').click();
      await page.locator('#j-title').waitFor();
      await page.keyboard.press('Escape');
      await page.waitForFunction(() =>
        document.activeElement?.hasAttribute('data-standalone-journal'),
      );
      check(
        `${name}: non-recap caller restores original trigger`,
        await focused(page.locator('[data-standalone-journal]')),
      );
      await page.getByLabel('Tampilan QA', { exact: true }).selectOption('legacy');
      await page.getByText('Tuntas / Remedial', { exact: true }).waitFor();
      const text = () => page.locator('main').innerText();
      check(
        `${name}: official 90 rejects score 80 in all four views`,
        ((await text()).match(/(?:^|\s)0%/g) ?? []).length === 4,
      );
      if (colorScheme === 'light') await snap('official-kktp-90');
      await page.getByLabel('KKTP QA', { exact: true }).selectOption('65');
      check(
        `${name}: official 65 accepts score 80`,
        ((await text()).match(/100%/g) ?? []).length === 4,
      );
      await page.getByLabel('Semester QA', { exact: true }).selectOption('2');
      check(
        `${name}: semester change uses score 70 not old score 80`,
        (await text()).includes('Rata-rata nilai akhir\n70') &&
          !(await text()).includes('Rata-rata nilai akhir\n80'),
      );
      await page.getByLabel('KKTP QA', { exact: true }).selectOption('90');
      check(
        `${name}: refreshed same-period threshold updates classification`,
        ((await text()).match(/(?:^|\s)0%/g) ?? []).length === 4,
      );
      await page.getByLabel('Status KKTP QA', { exact: true }).selectOption('unavailable');
      check(
        `${name}: unavailable metadata never gives false 0/100`,
        !(await text()).match(/(?:^|\s)(?:0|100)%/) &&
          (await text()).includes('Ketuntasan belum dapat dipastikan'),
      );
      if (colorScheme === 'light') await snap('kktp-unavailable');
      await page.getByLabel('Status KKTP QA', { exact: true }).selectOption('denied');
      check(
        `${name}: denied metadata gives permission message`,
        (await text()).includes('Anda tidak memiliki izin melihat KKTP.'),
      );
      check(
        `${name}: document does not horizontally overflow`,
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      );
      check(
        `${name}: no lifecycle mutations`,
        await page.evaluate(() => window.learningQa.mutations === 0),
      );
      await context.close();
    }
    check('no browser exceptions/warnings', consoleErrors.length === 0);
  } catch (error) {
    fs.writeFileSync(
      path.join(output, 'browser.json'),
      JSON.stringify(
        { pass: false, error: String(error), checks, screenshots, consoleErrors },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    await browser.close();
  }
  fs.writeFileSync(
    path.join(output, 'browser.json'),
    JSON.stringify(
      {
        pass: true,
        scope: 'local production components with synthetic actions',
        checks,
        screenshots,
        consoleErrors,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      pass: true,
      checks: checks.length,
      screenshots: screenshots.length,
      consoleErrors: consoleErrors.length,
    }),
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
