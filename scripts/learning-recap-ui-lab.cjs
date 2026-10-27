const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http');
const repo = path.resolve(__dirname, '..'),
  web = path.join(repo, 'apps/web'),
  output = path.join(repo, '.tasks/evidence/learning-recap-ui-20261021/lab');
const followup = process.argv.includes('--followup'),
  port = followup ? 3113 : 3112;
const fixture = path.join(
    repo,
    followup
      ? 'scripts/fixtures/learning-recap-followup-lab.tsx'
      : 'scripts/fixtures/learning-recap-ui-lab.tsx',
  ),
  stub = path.join(repo, 'scripts/fixtures/learning-recap-actions.ts');
const compiler = require('next/dist/compiled/webpack/webpack');
compiler.init();
fs.mkdirSync(output, { recursive: true });
compiler.webpack(
  {
    mode: 'development',
    devtool: false,
    entry: fixture,
    output: { path: output, filename: 'app.js' },
    resolve: { extensions: ['.tsx', '.ts', '.js'], alias: { '@': path.join(web, 'src') } },
    plugins: [
      new compiler.webpack.NormalModuleReplacementPlugin(
        /(learning-recap-actions|\/jadwal\/actions|^\.\.\/actions)$/,
        (resource) => {
          if (resource.context.includes('apps' + path.sep + 'web')) resource.request = stub;
        },
      ),
    ],
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: path.join(repo, 'scripts/dashboard-ui-lab-loader.cjs'),
          exclude: /node_modules/,
        },
      ],
    },
  },
  async (error, stats) => {
    if (error || stats.hasErrors())
      throw error || Error(stats.toString({ all: false, errors: true }));
    const ts = require('typescript'),
      configModule = { exports: {} };
    new Function(
      'exports',
      'module',
      ts.transpileModule(fs.readFileSync(path.join(web, 'tailwind.config.ts'), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS },
      }).outputText,
    )(configModule.exports, configModule);
    const config = configModule.exports.default;
    config.content = [
      path.join(web, 'src/**/*.{ts,tsx}').replaceAll('\\', '/'),
      fixture.replaceAll('\\', '/'),
    ];
    const css = await require('postcss')([require('tailwindcss')(config)]).process(
      fs.readFileSync(path.join(web, 'src/app/globals.css'), 'utf8'),
      { from: path.join(web, 'src/app/globals.css') },
    );
    fs.writeFileSync(path.join(output, 'style.css'), css.css);
    http
      .createServer((req, res) => {
        const requestPath = new URL(req.url, 'http://127.0.0.1:3112').pathname;
        const candidate = /^\/[A-Za-z0-9_.-]+\.(js|css)$/.test(requestPath)
          ? path.basename(requestPath)
          : null;
        const file = candidate && fs.existsSync(path.join(output, candidate)) ? candidate : null;
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader(
          'Content-Type',
          file
            ? file.endsWith('.js')
              ? 'application/javascript'
              : 'text/css'
            : 'text/html; charset=utf-8',
        );
        res.end(
          file
            ? fs.readFileSync(path.join(output, file))
            : '<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DIIS Rekap — QA Lokal Sintetis</title><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/app.js"></script></html>',
        );
      })
      .listen(port, '127.0.0.1', () =>
        process.stdout.write(`Synthetic lab http://127.0.0.1:${port}/\n`),
      );
  },
);
