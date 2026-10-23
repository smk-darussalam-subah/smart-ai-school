'use strict';
// Loopback-only component lab. No Next route, identity provider or database.
const path = require('node:path'),
  fs = require('node:fs'),
  http = require('node:http');
const repo = path.resolve(__dirname, '..'),
  web = path.join(repo, 'apps/web');
const out = path.join(repo, '.tasks/evidence/session-activation-wave-20261020/ui-lab');
const w = require('next/dist/compiled/webpack/webpack');
w.init();
const ts = require('typescript');
const fixtures = path.join(__dirname, 'fixtures');
const stub = path.join(fixtures, 'dashboard-ui-actions.ts');
fs.mkdirSync(out, { recursive: true });
async function main() {
  await new Promise((resolve, reject) => {
    const compiler = w.webpack({
      mode: 'development',
      devtool: false,
      entry: path.join(fixtures, 'dashboard-ui-lab.tsx'),
      output: { path: out, filename: 'app.js' },
      resolve: {
        extensions: ['.tsx', '.ts', '.js'],
        alias: { '@': path.join(web, 'src'), 'next/navigation': stub },
      },
      plugins: [
        new w.webpack.NormalModuleReplacementPlugin(
          /(?:session-actions|jadwal\/actions|jadwal\\actions)$/,
          (resource) => {
            resource.request = stub;
          },
        ),
        new w.webpack.NormalModuleReplacementPlugin(/^\.\.\/actions$/, (resource) => {
          if (resource.context.includes('jadwal')) resource.request = stub;
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
    compiler.run((err, stats) => {
      compiler.close(() => {});
      if (err || stats.hasErrors())
        reject(err || Error(stats.toString({ all: false, errors: true })));
      else resolve();
    });
  });
  const configSource = ts.transpileModule(
    fs.readFileSync(path.join(web, 'tailwind.config.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  const configModule = { exports: {} };
  new Function('exports', 'module', configSource)(configModule.exports, configModule);
  const config = configModule.exports.default;
  config.content = [
    path.join(web, 'src/**/*.{ts,tsx}').replaceAll('\\', '/'),
    path.join(fixtures, 'dashboard-ui-lab.tsx').replaceAll('\\', '/'),
  ];
  const css = await require('postcss')([require('tailwindcss')(config)]).process(
    fs.readFileSync(path.join(web, 'src/app/globals.css'), 'utf8'),
    { from: path.join(web, 'src/app/globals.css') },
  );
  fs.writeFileSync(path.join(out, 'style.css'), css.css);
  const server = http.createServer((req, res) => {
    const route = new URL(req.url, 'http://127.0.0.1').pathname;
    if (route === '/app.js' || route === '/style.css') {
      res.setHeader('content-type', route.endsWith('.js') ? 'text/javascript' : 'text/css');
      return fs.createReadStream(path.join(out, route.slice(1))).pipe(res);
    }
    res.setHeader('content-type', 'text/html');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'self' data:",
    );
    res.end(
      '<!doctype html><html lang="id"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DIIS QA Komponen Lokal</title><link rel="stylesheet" href="/style.css"><body><div id="root"></div><script src="/app.js"></script></body></html>',
    );
  });
  server.listen(3110, '127.0.0.1', () =>
    console.log('Local synthetic component lab: http://127.0.0.1:3110'),
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
