'use strict';
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http');
const repo = path.resolve(__dirname, '..'),
  web = path.join(repo, 'apps/web');
const output = path.join(repo, '.tasks/evidence/teacher-workflow-gap-20261021/ui-lab');
const fixture = path.join(repo, 'scripts/fixtures/workflow-gap-ui-lab.tsx');
const stub = path.join(repo, 'scripts/fixtures/workflow-gap-actions.ts');
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
      new compiler.webpack.NormalModuleReplacementPlugin(/^\.\.\/actions$/, (resource) => {
        if (resource.context.includes('akademik')) resource.request = stub;
      }),
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
    const ts = require('typescript');
    const configSource = ts.transpileModule(
      fs.readFileSync(path.join(web, 'tailwind.config.ts'), 'utf8'),
      { compilerOptions: { module: ts.ModuleKind.CommonJS } },
    ).outputText;
    const configModule = { exports: {} };
    new Function('exports', 'module', configSource)(configModule.exports, configModule);
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
    const server = http.createServer((request, response) => {
      const name =
        request.url === '/app.js' ? 'app.js' : request.url === '/style.css' ? 'style.css' : null;
      response.setHeader('Cache-Control', 'no-store');
      if (name) {
        response.setHeader(
          'Content-Type',
          name.endsWith('js') ? 'application/javascript' : 'text/css',
        );
        response.end(fs.readFileSync(path.join(output, name)));
      } else {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>DIIS QA Alur Guru Lokal</title><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/app.js"></script>',
        );
      }
    });
    server.listen(3111, '127.0.0.1', () =>
      process.stdout.write('Local synthetic component lab: http://127.0.0.1:3111/\n'),
    );
  },
);
