'use strict';
// Actual API serializer -> JSON -> web parser/action; only storage and auth transport are synthetic.
const fs = require('node:fs'),
  path = require('node:path'),
  cp = require('node:child_process'),
  Module = require('node:module');
const repo = path.resolve(__dirname, '..'),
  ts = require('typescript');
require('reflect-metadata');
require.extensions['.ts'] = (m, file) =>
  m._compile(
    ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      fileName: file,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    file,
  );
require.extensions['.tsx'] = require.extensions['.ts'];
let pages;
const original = Module._load;
Module._load = function (id, parent, main) {
  if (id === '@/lib/action-session')
    return { getActionSession: async () => ({ accessToken: 'local-synthetic' }) };
  if (id === '@/lib/academic-pages-server')
    return { academicPagesResult: (...args) => pages(...args) };
  if (id === '@/lib/api')
    return {
      apiFetchResult: async (p) =>
        p === '/auth/me'
          ? { status: 'success', data: { permissions: ['activity.read', 'activity.manage'] } }
          : { status: 'unavailable' },
    };
  if (id.startsWith('@/'))
    return original.call(this, path.join(repo, 'apps/web/src', id.slice(2)), parent, main);
  return original.call(this, id, parent, main);
};
const {
  ClassActivitiesService,
} = require('../apps/api/src/class-activities/class-activities.service.ts');
const {
  ClassActivitiesController,
} = require('../apps/api/src/class-activities/class-activities.controller.ts');
const { SupportingJournalSchema } = require('../apps/web/src/lib/learning-recap.ts');
const {
  fetchLearningContext,
} = require('../apps/web/src/app/dashboard/akademik/learning-recap-actions.ts');
const ids = {
  journal: '10000000-0000-4000-8000-000000000001',
  teacher: '20000000-0000-4000-8000-000000000001',
  class: '30000000-0000-4000-8000-000000000001',
  session: '40000000-0000-4000-8000-000000000001',
  schedule: '50000000-0000-4000-8000-000000000001',
  assignment: '60000000-0000-4000-8000-000000000001',
};
const date = '2026-10-29T00:00:00.000Z';
const stored = {
  id: ids.journal,
  teacherId: ids.teacher,
  classId: ids.class,
  date: new Date(date),
  title: 'Synthetic journal',
  description: 'Synthetic description',
  category: 'pembelajaran',
  photoUrl: null,
  createdAt: new Date(date),
  class: { id: ids.class, name: 'Synthetic Class' },
  teacher: { id: ids.teacher, user: { fullName: 'Synthetic Teacher' } },
};
const project = (obj, select) =>
  Object.fromEntries(
    Object.entries(select)
      .filter(([, v]) => v)
      .map(([k, v]) => [k, v === true ? obj[k] : project(obj[k], v.select)]),
  );
const db = {
  teacher: { findFirst: async () => ({ id: ids.teacher }) },
  classActivity: { findMany: async (q) => [project(stored, q.select)], count: async () => 1 },
};
const checks = [],
  check = (name, pass) => {
    checks.push({ name, pass });
    if (!pass) throw Error(name);
  };
async function response(Service) {
  return JSON.parse(
    JSON.stringify(
      await new ClassActivitiesController(new Service(db, {})).findAll(
        { scope: 'own' },
        { keycloakId: 'synthetic', roles: ['GURU'] },
      ),
    ),
  );
}
async function main() {
  const relative = 'apps/api/src/class-activities/class-activities.service.ts';
  const baseline = cp.execFileSync(
    'git',
    ['show', 'fc93bd295e97f9d735928c2a64915704fe4204f4:' + relative],
    { cwd: repo, encoding: 'utf8' },
  );
  const virtual = path.join(repo, relative),
    old = new Module(virtual, module);
  old.filename = virtual;
  old.paths = Module._nodeModulePaths(path.dirname(virtual));
  old._compile(
    ts.transpileModule(baseline, {
      fileName: virtual,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        esModuleInterop: true,
      },
    }).outputText,
    virtual,
  );
  check(
    'Frozen baseline producer is rejected by actual web schema',
    !SupportingJournalSchema.safeParse((await response(old.exports.ClassActivitiesService)).data[0])
      .success,
  );
  const result = await response(ClassActivitiesService);
  check(
    'Current actual producer passes actual web schema after JSON transport',
    SupportingJournalSchema.safeParse(result.data[0]).success,
  );
  check(
    'Top-level and nested teacher identities agree',
    result.data[0].teacherId === result.data[0].teacher.id,
  );
  if (process.argv.includes('--built')) {
    const built = require('../apps/api/dist/class-activities/class-activities.service.js');
    check(
      'Built API serializer also passes the real web schema',
      SupportingJournalSchema.safeParse((await response(built.ClassActivitiesService)).data[0])
        .success,
    );
  }
  const session = {
    id: ids.session,
    scheduleId: ids.schedule,
    classId: ids.class,
    teachingAssignmentId: ids.assignment,
    assignedTeacherId: ids.teacher,
    assignedTeacherName: 'Synthetic Teacher',
    classNameSnapshot: 'Synthetic Class',
    subjectSnapshot: 'Synthetic Subject',
    roomSnapshot: null,
    serviceDate: date,
    scheduledStartAt: date,
    scheduledEndAt: '2026-10-29T01:00:00.000Z',
    status: 'COMPLETED',
    startedAt: date,
    completedAt: '2026-10-29T01:00:00.000Z',
    missedAt: null,
    cancelledAt: null,
    reassignedAt: null,
    cancellationReason: null,
    reassignmentReason: null,
    canOperate: false,
    operationBlockedReason: null,
    academicYear: { code: '2026/2027' },
    semester: { number: 1 },
    schedule: { jpStart: 1, jpEnd: 1 },
  };
  pages = async (p) => ({
    status: 'success',
    data: p.startsWith('/class-sessions')
      ? { data: [session], total: 1, page: 1, limit: 100 }
      : p.startsWith('/class-activities')
        ? result
        : { data: [], total: 0, page: 1, limit: 100 },
  });
  for (const scope of ['own', 'operations']) {
    const actual = await fetchLearningContext(ids.session, scope);
    check(
      `${scope}: actual recap action reads the produced journal`,
      actual.state === 'ready' &&
        actual.data.context.journals.state === 'ready' &&
        actual.data.context.journals.data.length === 1,
    );
  }
  const out = path.resolve(
    process.argv[2] || path.join(repo, '.tasks/evidence/attendance-journal-contract.json'),
  );
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        checks,
        layer:
          'Production serializer/schema/action with synthetic storage/auth transport; not live authenticated E2E.',
      },
      null,
      2,
    ) + '\n',
  );
  console.log(`Journal contract: ${checks.length}/${checks.length} PASS`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
