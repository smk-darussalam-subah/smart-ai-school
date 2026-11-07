'use strict';
// Isolated production-component QA. No application route, credentials or remote requests.
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http');
const repo = path.resolve(__dirname, '..'),
  web = path.join(repo, 'apps/web');
const out = path.resolve(
  process.argv[2] || path.join(repo, '.tasks/evidence/attendance-wiring-ui'),
);
const fixtures = path.join(__dirname, 'fixtures');
const stub = path.join(fixtures, 'attendance-wiring-ui-actions.ts');
const { measureTextContrast } = require('./attendance-ui-contrast.cjs');
const w = require('next/dist/compiled/webpack/webpack');
w.init();
async function main() {
  const { chromium, expect } = require(process.env.DIIS_PLAYWRIGHT_PATH || '@playwright/test');
  fs.mkdirSync(out, { recursive: true });
  await new Promise((resolve, reject) => {
    const compiler = w.webpack({
      mode: 'development',
      devtool: false,
      entry: path.join(fixtures, 'attendance-wiring-ui-lab.tsx'),
      output: { path: out, filename: 'app.js', chunkFilename: 'chunks/[id].js', publicPath: '/' },
      optimization: { chunkIds: 'deterministic' },
      resolve: { extensions: ['.tsx', '.ts', '.js'], alias: { '@': path.join(web, 'src') } },
      plugins: [
        new w.webpack.NormalModuleReplacementPlugin(/session-attendance-actions$/, (resource) => {
          resource.request = stub;
        }),
        new w.webpack.NormalModuleReplacementPlugin(/^\.\.\/actions$/, (resource) => {
          if (resource.context.includes('executive')) resource.request = stub;
        }),
      ],
      module: {
        rules: [
          {
            test: /\.tsx?$/,
            use: path.join(__dirname, 'dashboard-ui-lab-loader.cjs'),
            exclude: /node_modules/,
          },
        ],
      },
    });
    compiler.run((err, stats) =>
      compiler.close(() =>
        err || stats.hasErrors()
          ? reject(err || Error(stats.toString({ all: false, errors: true })))
          : resolve(),
      ),
    );
  });
  const ts = require('typescript');
  const source = ts.transpileModule(fs.readFileSync(path.join(web, 'tailwind.config.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const configModule = { exports: {} };
  new Function('exports', 'module', source)(configModule.exports, configModule);
  const config = configModule.exports.default;
  config.content = [
    path.join(web, 'src/**/*.{ts,tsx}'),
    path.join(fixtures, 'attendance-wiring-ui-lab.tsx'),
  ].map((p) => p.replaceAll('\\', '/'));
  const css = await require('postcss')([require('tailwindcss')(config)]).process(
    fs.readFileSync(path.join(web, 'src/app/globals.css'), 'utf8'),
    { from: path.join(web, 'src/app/globals.css') },
  );
  fs.writeFileSync(path.join(out, 'style.css'), css.css);
  let chunkDelay = 0;
  const server = http.createServer((req, res) => {
    const route = new URL(req.url, 'http://127.0.0.1').pathname;
    if (route === '/app.js' || route === '/style.css' || /^\/chunks\/\d+\.js$/.test(route)) {
      res.setHeader('Content-Type', route.endsWith('.js') ? 'text/javascript' : 'text/css');
      const send = () => fs.createReadStream(path.join(out, route.slice(1))).pipe(res);
      if (route.startsWith('/chunks/') && chunkDelay) return setTimeout(send, chunkDelay);
      return send();
    }
    res.setHeader('Content-Type', 'text/html');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'self' data:",
    );
    res.end(
      '<!doctype html><html lang="id"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DIIS Local Wiring QA</title><link rel="stylesheet" href="/style.css"><body><div id="root"></div><script src="/app.js"></script></body></html>',
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  const checks = [],
    errors = [],
    consoleErrors = [],
    remoteRequests = [],
    contrast = [],
    layouts = [],
    lazyRequests = [],
    started = new Date().toISOString();
  const check = async (name, fn) => {
    fs.writeFileSync(
      path.join(out, 'PROGRESS.json'),
      JSON.stringify({ running: name, at: new Date().toISOString() }),
    );
    try {
      await fn();
      checks.push({ name, pass: true });
    } catch (error) {
      checks.push({ name, pass: false, error: error.message });
      console.error(`Browser check failed: ${name}: ${error.message}`);
    }
  };
  try {
    browser = await chromium.launch({
      headless: true,
      channel: process.env.DIIS_BROWSER_CHANNEL || 'chrome',
    });
    const page = await browser.newPage();
    page.setDefaultTimeout(7000);
    page.setDefaultNavigationTimeout(10000);
    const settleTheme = async () => {
      await page.mouse.move(0, 0);
      await page.evaluate(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await Promise.race([
          Promise.all(
            document
              .getAnimations()
              .filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime))
              .map((a) => a.finished.catch(() => {})),
          ),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(Error('Theme animations did not settle within 3 seconds')),
              3000,
            ),
          ),
        ]);
      });
    };
    page.on('pageerror', (error) => {
      errors.push(error.message);
      console.error(`Browser exception: ${error.message}`);
    });
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/chunks/'))
        lazyRequests.push(new URL(request.url()).pathname);
      if (new URL(request.url()).hostname !== '127.0.0.1')
        remoteRequests.push(new URL(request.url()).origin);
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const summary = page.getByTestId('summary');
    await expect(summary).toContainText('8 dari 8 siswa-JP');
    await check('download uses current own-scope JP aggregate', async () => {
      const received = page.waitForEvent('download');
      await summary.getByRole('button', { name: 'Unduh CSV ringkasan JP' }).click();
      const download = await received,
        target = path.join(out, 'jp-own-aggregate.csv');
      await download.saveAs(target);
      const csv = fs.readFileSync(target, 'utf8');
      if (!csv.includes('"own","AKL"') || !csv.includes('"TOTAL","8","8","0","6","0","0","2","75"'))
        throw Error('CSV does not match displayed scope/counts');
    });
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      for (const role of ['Guru', 'Kepala Sekolah', 'Super Admin']) {
        await page.getByLabel('Role', { exact: true }).selectOption(role);
        for (const dark of [false, true]) {
          await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
          await page.evaluate(
            (dark) => document.documentElement.classList.toggle('dark', dark),
            dark,
          );
          await page.waitForTimeout(220);
          await settleTheme();
          await check(`layout ${width} ${role} ${dark ? 'dark' : 'light'}`, async () => {
            if (role === 'Guru') await expect(summary).toContainText('8 dari 8 siswa-JP');
            else {
              const executive = page.getByTestId('executive');
              await expect(
                executive
                  .locator(':scope > div')
                  .first()
                  .getByRole('heading', { level: 1, name: 'Dasbor Eksekutif' }),
              ).toBeVisible();
              await expect(
                executive.locator(':scope > div').first().locator('svg').first(),
              ).toBeVisible();
              await expect(summary).toHaveCount(0);
              await expect(page.getByRole('dialog')).toHaveCount(0);
              layouts.push({
                width,
                role,
                dark,
                anchors: await executive.evaluate((el) => {
                  const origin = el.getBoundingClientRect();
                  return [...el.querySelectorAll('h1,h2,section[aria-label]')].map((n) => {
                    const b = n.getBoundingClientRect();
                    return {
                      name: n.getAttribute('aria-label') ?? n.textContent?.trim(),
                      x: b.x - origin.x,
                      y: b.y - origin.y,
                      width: b.width,
                      height: b.height,
                    };
                  });
                }),
              });
            }
            const size = await page.evaluate(() => ({
              width: innerWidth,
              document: document.documentElement.scrollWidth,
              body: document.body.scrollWidth,
            }));
            if (size.document > width || size.body > width) throw Error(JSON.stringify(size));
            if (role !== 'Guru') {
              const panel = page
                .getByTestId('executive')
                .getByRole('region', { name: 'KPI Utama', exact: true });
              const style = await panel.evaluate((el) => ({
                background: getComputedStyle(el).backgroundColor,
                radius: getComputedStyle(el).borderRadius,
                border: getComputedStyle(el).borderTopWidth,
              }));
              if (
                style.background !== (dark ? 'rgb(15, 23, 42)' : 'rgb(255, 255, 255)') ||
                style.radius !== '16px' ||
                style.border !== '1px'
              )
                throw Error('Production panel identity lost: ' + JSON.stringify(style));
              await expect(panel.getByRole('region')).toHaveCount(0);
              await expect(panel.getByRole('definition')).toHaveCount(5);
            }
            if (role === 'Guru') {
              const name = page
                .getByRole('button')
                .filter({ hasText: 'Absen harian' })
                .locator('b')
                .first();
              if ((await name.boundingBox()).width < 150)
                throw Error('Teacher status text squeezed by badges');
            }
            if (
              dark &&
              (await page
                .locator('main')
                .evaluate((el) => getComputedStyle(el).backgroundColor)) !== 'rgb(2, 6, 23)'
            )
              throw Error('Dark media styles not applied');
          });
          const measurement = await page.evaluate(measureTextContrast);
          contrast.push({ width, role, dark, ...measurement });
          await check(`text contrast ${width} ${role} ${dark ? 'dark' : 'light'}`, async () => {
            if (measurement.failures.length) throw Error(JSON.stringify(measurement.failures));
          });
          await page.getByTestId(role === 'Guru' ? 'teacherSurface' : 'executive').screenshot({
            path: path.join(
              out,
              `${width}-${role.replaceAll(' ', '-')}-${dark ? 'dark' : 'light'}.png`,
            ),
          });
          if (role !== 'Guru' && [390, 1440].includes(width)) {
            await page
              .getByTestId('executive')
              .evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
            await page.screenshot({
              path: path.join(
                out,
                `executive-overview-${width}-${role.replaceAll(' ', '-')}-${dark ? 'dark' : 'light'}.png`,
              ),
              fullPage: false,
            });
            await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
          }
        }
      }
    }
    await check('KS and Super Admin executive layout parity', async () => {
      for (const width of [320, 390, 768, 1440])
        for (const dark of [false, true]) {
          const ks = layouts.find(
            (x) => x.width === width && x.dark === dark && x.role === 'Kepala Sekolah',
          );
          const sa = layouts.find(
            (x) => x.width === width && x.dark === dark && x.role === 'Super Admin',
          );
          if (JSON.stringify(ks?.anchors) !== JSON.stringify(sa?.anchors))
            throw Error(`Executive layouts differ at ${width}/${dark}`);
        }
    });
    await page.getByLabel('Role', { exact: true }).selectOption('Guru');
    await page.setViewportSize({ width: 390, height: 844 });
    for (const dark of [false, true]) {
      await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
      await page.evaluate((dark) => document.documentElement.classList.toggle('dark', dark), dark);
      await page.waitForTimeout(220);
      await settleTheme();
      await check(`teacher detail dialog keyboard ${dark ? 'dark' : 'light'}`, async () => {
        const trigger = page.getByRole('button').filter({ hasText: 'Absen harian' });
        await trigger.focus();
        await trigger.press('Enter');
        const dialog = page.getByRole('dialog');
        try {
          await expect(dialog).toBeVisible();
          await expect(dialog).toHaveAccessibleName(/^Detail Sesi/);
          await expect(dialog.getByRole('heading', { name: /^Detail Sesi/ })).toBeFocused();
          const box = await dialog.boundingBox();
          if (box.x < 0 || box.x + box.width > 390) throw Error('Dialog exceeds viewport');
          for (let i = 0; i < 6; i++) {
            await page.keyboard.press('Tab');
            if (!(await dialog.evaluate((el) => el.contains(document.activeElement))))
              throw Error('Focus escaped dialog');
          }
          await page.screenshot({
            path: path.join(out, `teacher-dialog-${dark ? 'dark' : 'light'}.png`),
            fullPage: true,
          });
        } finally {
          await page.keyboard.press('Escape');
        }
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
      });
    }
    const help = page.getByRole('button', { name: 'Penjelasan Nilai mencapai KKTP', exact: true });
    await check('KPI disclosure keyboard and Escape retain focus', async () => {
      await help.focus();
      await help.press('Enter');
      await expect(help).toHaveAttribute('aria-expanded', 'true');
      await help.press('Escape');
      await expect(help).toHaveAttribute('aria-expanded', 'false');
      await expect(help).toBeFocused();
    });
    for (const state of ['denied', 'unavailable', 'mixed']) {
      await page.getByLabel('Data guru').selectOption(state);
      await check(`teacher ${state} recovery`, async () => {
        await expect(page.getByRole('main')).toContainText(
          state === 'unavailable'
            ? 'Daftar ini belum lengkap; coba muat ulang halaman.'
            : 'Sebagian data tidak ditampilkan karena izin akun Anda.',
        );
      });
      await page.screenshot({ path: path.join(out, `teacher-${state}.png`), fullPage: true });
    }
    await page.getByLabel('Data guru').selectOption('filled');
    await page.getByLabel('Role', { exact: true }).selectOption('Super Admin');
    const detailed = page.getByTestId('executive');
    await check('attendance detail code is not requested before opening', async () => {
      if (lazyRequests.length) throw Error('Attendance module loaded before user intent');
    });
    await check('late dialog code cannot reopen an old filter', async () => {
      chunkDelay = 800;
      await detailed.getByRole('button', { name: 'Rincian absensi siswa' }).click();
      await expect(
        detailed.getByRole('status').filter({ hasText: 'Memuat rincian absensi' }),
      ).toBeVisible();
      await detailed.getByLabel('Jurusan', { exact: true }).selectOption('TKR');
      await page.waitForLoadState('networkidle');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      if (!lazyRequests.length) throw Error('Dynamic module was never requested');
      chunkDelay = 0;
      await detailed.getByLabel('Jurusan', { exact: true }).selectOption('AKL');
      await expect(detailed).toContainText('KPI Utama');
    });
    for (const role of ['Kepala Sekolah', 'Super Admin']) {
      await page.getByLabel('Role', { exact: true }).selectOption(role);
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 844 });
        for (const dark of [false, true]) {
          await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
          await page.evaluate(
            (dark) => document.documentElement.classList.toggle('dark', dark),
            dark,
          );
          await page.waitForTimeout(220);
          await settleTheme();
          await check(
            `executive attendance dialog ${role} ${width} ${dark ? 'dark' : 'light'}`,
            async () => {
              const graph = detailed.getByRole('region', {
                name: 'Tren Kehadiran Siswa per JP',
                exact: true,
              });
              const trigger = graph.getByRole('button', { name: 'Rincian absensi siswa' });
              const calls = await page.evaluate(() => ({
                jp: window.attendanceWiringLab.calls,
                executive: window.attendanceWiringLab.executiveCalls,
              }));
              await trigger.focus();
              await trigger.press('Enter');
              const dialog = page.getByRole('dialog', {
                name: 'Rincian absensi siswa',
                exact: true,
              });
              try {
                await expect(dialog).toBeVisible();
                await expect(dialog).toContainText('8 dari 8 siswa-JP');
                await expect(dialog).toContainText('75%');
                const box = await dialog.boundingBox();
                if (box.x < 0 || box.x + box.width > width || box.y < 0 || box.y + box.height > 844)
                  throw Error('Attendance dialog exceeds viewport');
                for (let i = 0; i < 5; i++) {
                  await page.keyboard.press('Tab');
                  if (!(await dialog.evaluate((el) => el.contains(document.activeElement))))
                    throw Error('Focus escaped attendance dialog');
                }
                const measurement = await page.evaluate(measureTextContrast);
                contrast.push({
                  state: `attendance dialog ${role} ${width} ${dark}`,
                  ...measurement,
                });
                if (measurement.failures.length) throw Error(JSON.stringify(measurement.failures));
                const received = page.waitForEvent('download');
                await dialog.getByRole('button', { name: 'Unduh CSV ringkasan JP' }).click();
                const target = path.join(
                  out,
                  `executive-dialog-${role.replaceAll(' ', '-')}-${width}-${dark ? 'dark' : 'light'}.csv`,
                );
                await (await received).saveAs(target);
                if (
                  !fs
                    .readFileSync(target, 'utf8')
                    .includes('"TOTAL","8","8","0","6","0","0","2","75"')
                )
                  throw Error('Dialog CSV does not match graph snapshot');
                const after = await page.evaluate(() => ({
                  jp: window.attendanceWiringLab.calls,
                  executive: window.attendanceWiringLab.executiveCalls,
                }));
                if (JSON.stringify(calls) !== JSON.stringify(after))
                  throw Error('Opening detail fetched a different snapshot');
                await page.screenshot({
                  path: path.join(
                    out,
                    `executive-dialog-${role.replaceAll(' ', '-')}-${width}-${dark ? 'dark' : 'light'}.png`,
                  ),
                  fullPage: false,
                });
              } finally {
                await page.keyboard.press('Escape');
              }
              await expect(dialog).toHaveCount(0);
              await expect(trigger).toBeFocused();
            },
          );
        }
      }
    }
    for (const name of [
      'Lihat data tren',
      'Lihat data SPP',
      'Lihat distribusi nilai',
      'Lihat data korelasi',
    ])
      await check(`keyboard table ${name}`, async () => {
        const control = detailed.locator('summary').filter({ hasText: name });
        await control.focus();
        await control.press('Enter');
        await expect(control.locator('..').getByRole('table')).toBeVisible();
      });
    await check('keyboard filter outline', async () => {
      const control = detailed.getByLabel('Jurusan', { exact: true });
      await control.focus();
      const style = await control.evaluate((el) => ({
        width: getComputedStyle(el).outlineWidth,
        style: getComputedStyle(el).outlineStyle,
      }));
      if (parseFloat(style.width) < 2 || style.style === 'none') throw Error(JSON.stringify(style));
    });
    await page.screenshot({
      path: path.join(out, 'executive-readable-tables.png'),
      fullPage: true,
    });
    const expandedContrast = await page.evaluate(measureTextContrast);
    contrast.push({ state: 'expanded tables', ...expandedContrast });
    await check('expanded table contrast', async () => {
      if (expandedContrast.failures.length) throw Error(JSON.stringify(expandedContrast.failures));
    });
    await page.getByLabel('Role', { exact: true }).selectOption('Guru');
    await page.setViewportSize({ width: 320, height: 900 });
    await page.getByLabel('Kondisi').selectOption('large');
    await check('large JP counts remain contained', async () => {
      await expect(summary).toContainText('136.000 siswa-JP');
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw Error('Large values overflow');
    });
    await page.screenshot({ path: path.join(out, '320-large-counts.png'), fullPage: true });
    for (const [mode, text] of [
      ['unknown', 'belum lengkap'],
      ['zero', '0%'],
      ['empty', 'Belum ada absensi sesi'],
      ['error', 'Coba lagi'],
      ['denied', 'Akses ringkasan'],
    ]) {
      await page.getByLabel('Kondisi').selectOption(mode);
      await check(`state ${mode}`, async () => {
        await expect(summary).toContainText(text);
      });
      await page.screenshot({ path: path.join(out, `state-${mode}.png`), fullPage: true });
      if (mode === 'unknown' || mode === 'denied')
        await check(`${mode} no false 0%`, async () => {
          await expect(summary).not.toContainText('0%');
        });
      if (mode === 'error') {
        const button = summary.getByRole('button', { name: 'Coba lagi' });
        await check('retry target and focus', async () => {
          await button.focus();
          await expect(button).toBeFocused();
          if ((await button.boundingBox()).height < 44) throw Error('Retry target too small');
        });
        const before = await page.evaluate(() => window.attendanceWiringLab.calls);
        await page.waitForTimeout(350);
        await check('no automatic retry', async () => {
          if ((await page.evaluate(() => window.attendanceWiringLab.calls)) !== before)
            throw Error('Unexpected retry');
        });
        await button.press('Enter');
        await check('manual retry once', async () => {
          await expect
            .poll(() => page.evaluate(() => window.attendanceWiringLab.calls))
            .toBe(before + 1);
        });
        await check('failed retry restores focus', async () => {
          await expect(button).toBeFocused();
        });
        await page.evaluate(() => {
          window.attendanceWiringLab.mode = 'complete';
        });
        await button.press('Enter');
        await check('successful retry restores useful focus', async () => {
          await expect(
            summary.getByRole('button', { name: 'Unduh CSV ringkasan JP' }),
          ).toBeFocused();
        });
        await page.screenshot({ path: path.join(out, 'retry-success-focus.png'), fullPage: true });
        await page.getByLabel('Kondisi').selectOption('complete');
        await page.getByLabel('Kondisi').selectOption('error');
        await expect(button).toBeVisible();
        await page.evaluate(() => {
          window.attendanceWiringLab.delay = 250;
        });
        await button.focus();
        await button.press('Enter');
        const manuallyFocusedRegion = summary.locator('section');
        await manuallyFocusedRegion.focus();
        await check('retry does not steal manually selected region focus', async () => {
          await expect(button).toBeVisible();
          await expect(manuallyFocusedRegion).toBeFocused();
        });
        await button.focus();
        await button.press('Enter');
        await page.evaluate(() => {
          window.attendanceWiringLab.mode = 'complete';
        });
        const scopeControl = page.getByLabel('Jurusan lab');
        await scopeControl.focus();
        await scopeControl.selectOption('TKR');
        await check('scope change does not steal retry focus', async () => {
          await expect(summary).toContainText('siswa-JP tercatat');
          await expect(scopeControl).toBeFocused();
        });
        await page.evaluate(() => {
          window.attendanceWiringLab.delay = 0;
        });
      }
      if (mode === 'denied')
        await check('denied no retry', async () => {
          await expect(summary.getByRole('button')).toHaveCount(0);
        });
      if (mode === 'unknown')
        await check('unknown CSV keeps percentage empty', async () => {
          const received = page.waitForEvent('download');
          await summary.getByRole('button', { name: 'Unduh CSV ringkasan JP' }).click();
          const download = await received,
            target = path.join(out, 'jp-unknown-aggregate.csv');
          await download.saveAs(target);
          if (!fs.readFileSync(target, 'utf8').includes('"TOTAL","10","8","2","6","0","0","2",""'))
            throw Error('Unknown CSV was changed to zero');
        });
    }
    await page.evaluate(() => {
      window.attendanceWiringLab.delay = 800;
    });
    await page.getByLabel('Kondisi').selectOption('complete');
    await page.waitForTimeout(50);
    await page.evaluate(() => {
      window.attendanceWiringLab.delay = 0;
    });
    await page.getByLabel('Kondisi').selectOption('denied');
    await page.getByLabel('Jurusan lab').selectOption('TKR');
    await page.getByLabel('Semester lab').selectOption('2');
    await check('fresh denied replaces stale scope', async () => {
      await expect(summary).toContainText('Akses ringkasan');
    });
    await page.waitForTimeout(1000);
    await check('late success cannot replace denial', async () => {
      await expect(summary).toContainText('Akses ringkasan');
      await expect(summary).not.toContainText('75%');
    });
    await page.getByLabel('Kondisi').selectOption('complete');
    await page.getByLabel('Role', { exact: true }).selectOption('Super Admin');
    const executive = page.getByTestId('executive');
    await page.evaluate(() => {
      window.attendanceWiringLab.delay = 800;
    });
    await executive.getByLabel('Jurusan', { exact: true }).selectOption('TKR');
    await check('executive old scope hidden while loading', async () => {
      await expect(executive).not.toContainText('KPI Utama');
    });
    await page.evaluate(() => {
      window.attendanceWiringLab.delay = 0;
    });
    await executive.getByLabel('Jurusan', { exact: true }).selectOption('TKJ');
    await executive.getByLabel('Semester', { exact: true }).selectOption('2');
    await check('executive fresh filters and real zero', async () => {
      await expect(executive).toContainText('KPI Utama');
      await expect(executive.getByLabel('Jurusan', { exact: true })).toHaveValue('TKJ');
      await expect(executive.getByLabel('Semester', { exact: true })).toHaveValue('2');
    });
    await page.waitForTimeout(1000);
    await check('executive late response cannot restore old major', async () => {
      await expect(executive.getByLabel('Jurusan', { exact: true })).toHaveValue('TKJ');
      await expect(executive).toContainText('0%');
    });
    await page.getByLabel('Kondisi').selectOption('error');
    await executive.getByRole('button', { name: 'Segarkan' }).click();
    await check('executive transport error is explicit', async () => {
      await expect(executive).toContainText('Data pilihan belum dapat dimuat');
      await expect(executive).not.toContainText('KPI Utama');
    });
    await page.getByLabel('Kondisi').selectOption('complete');
    await executive.getByRole('button', { name: 'Segarkan' }).click();
    await check('executive retry restores selected scope', async () => {
      await expect(executive).toContainText('KPI Utama');
      await expect(executive.getByLabel('Jurusan', { exact: true })).toHaveValue('TKJ');
    });
    await check('executive filter change closes old attendance details', async () => {
      await executive.getByRole('button', { name: 'Rincian absensi siswa' }).click();
      await expect(
        page.getByRole('dialog', { name: 'Rincian absensi siswa', exact: true }),
      ).toContainText('0%');
      await executive.getByLabel('Jurusan', { exact: true }).selectOption('AKL');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await executive.getByRole('button', { name: 'Rincian absensi siswa' }).click();
      await expect(
        page.getByRole('dialog', { name: 'Rincian absensi siswa', exact: true }),
      ).toContainText('75%');
      await page.keyboard.press('Escape');
    });
    for (const mode of ['unknown', 'attendance-unavailable'])
      await check(`executive dialog ${mode} remains honest`, async () => {
        await page.evaluate((mode) => {
          window.attendanceWiringLab.mode = mode;
        }, mode);
        await executive.getByRole('button', { name: 'Segarkan' }).click();
        const trigger = executive.getByRole('button', { name: 'Rincian absensi siswa' });
        await trigger.click();
        const dialog = page.getByRole('dialog', { name: 'Rincian absensi siswa', exact: true });
        await expect(dialog).toContainText(
          mode === 'unknown' ? 'belum lengkap' : 'Rincian absensi belum tersedia',
        );
        await expect(dialog).not.toContainText('0%');
        await page.keyboard.press('Escape');
        await expect(trigger).toBeFocused();
      });
    await page.evaluate(() => {
      window.attendanceWiringLab.mode = 'complete';
    });
    await executive.getByRole('button', { name: 'Segarkan' }).click();
    await expect(executive).toContainText('KPI Utama');
    await page.screenshot({ path: path.join(out, 'executive-filter-race.png'), fullPage: true });
    await check('no browser exception', async () => {
      if (errors.length) throw Error(errors.join('\n'));
    });
    await check('no console error or external request', async () => {
      if (consoleErrors.length || remoteRequests.length)
        throw Error(JSON.stringify({ consoleErrors, remoteRequests }));
    });
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
    fs.writeFileSync(
      path.join(out, 'RESULT.json'),
      JSON.stringify(
        {
          started,
          finished: new Date().toISOString(),
          checks,
          contrast,
          layouts,
          lazyRequests,
          errors,
          consoleErrors,
          remoteRequests,
          boundary:
            'Actual components with synthetic server-action adapter; not authenticated staging E2E.',
        },
        null,
        2,
      ) + '\n',
    );
  }
  const passed = checks.filter((c) => c.pass).length;
  console.log(`Browser component checks: ${passed}/${checks.length} PASS`);
  if (passed !== checks.length)
    throw Error(`${checks.length - passed} browser checks failed; see RESULT.json`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
