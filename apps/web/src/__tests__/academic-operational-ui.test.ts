import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as vm from 'node:vm';

function source(relativePath: string): string {
  return readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

type WorkerEvent = {
  data?: { json: () => unknown };
  notification?: { data?: { url?: unknown }; close: () => void };
  request?: {
    method: string;
    url: string;
    mode?: string;
    destination?: string;
  };
  waitUntil: (promise: Promise<unknown>) => void;
  respondWith?: (promise: Promise<unknown>) => void;
};
type WorkerHandler = (event: WorkerEvent) => void;

function loadServiceWorkerHarness() {
  const listeners = new Map<string, WorkerHandler[]>();
  const shownNotifications: Array<{ title: string; options: { data?: { url?: string } } }> = [];
  const openWindow = jest.fn().mockResolvedValue(undefined);
  const sandboxSelf = {
    location: { origin: 'https://staging.smkdarussalamsubah.sch.id' },
    skipWaiting: jest.fn(),
    addEventListener: (type: string, handler: WorkerHandler) => {
      listeners.set(type, [...(listeners.get(type) ?? []), handler]);
    },
    registration: {
      showNotification: jest.fn((title: string, options: { data?: { url?: string } }) => {
        shownNotifications.push({ title, options });
        return Promise.resolve();
      }),
    },
    clients: {
      claim: jest.fn(),
      matchAll: jest.fn().mockResolvedValue([]),
      openWindow,
    },
  };
  const sandbox = {
    self: sandboxSelf,
    caches: {
      open: jest.fn().mockResolvedValue({ addAll: jest.fn(), put: jest.fn() }),
      keys: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(true),
      match: jest.fn().mockResolvedValue(undefined),
    },
    fetch: jest.fn().mockResolvedValue({
      status: 200,
      clone() {
        return this;
      },
    }),
    Response: class Response {
      body: unknown;
      init: unknown;
      constructor(body?: unknown, init?: unknown) {
        this.body = body;
        this.init = init;
      }
    },
    URL,
    Promise,
  };
  vm.runInNewContext(source('../public/sw.js'), sandbox, { filename: 'sw.js' });

  const first = (type: string): WorkerHandler => {
    const handler = listeners.get(type)?.[0];
    if (!handler) throw new Error(`Service worker handler ${type} tidak terdaftar`);
    return handler;
  };
  const runEvent = async (type: string, event: Omit<WorkerEvent, 'waitUntil'>) => {
    const waits: Promise<unknown>[] = [];
    first(type)({
      ...event,
      waitUntil: (promise) => {
        waits.push(Promise.resolve(promise));
      },
    });
    await Promise.all(waits);
  };

  return {
    async pushUrl(payload: unknown): Promise<string | undefined> {
      await runEvent('push', {
        data: payload === undefined ? undefined : { json: () => payload },
      });
      return shownNotifications.at(-1)?.options.data?.url;
    },
    async pushMalformedJson(): Promise<string | undefined> {
      await runEvent('push', {
        data: { json: () => { throw new Error('bad payload'); } },
      });
      return shownNotifications.at(-1)?.options.data?.url;
    },
    async clickTarget(url: unknown): Promise<string | undefined> {
      await runEvent('notificationclick', {
        notification: { data: { url }, close: jest.fn() },
      });
      return openWindow.mock.calls.at(-1)?.[0];
    },
    async fetchHandled(request: WorkerEvent['request']): Promise<boolean> {
      const waits: Promise<unknown>[] = [];
      let handled = false;
      let response: Promise<unknown> | undefined;
      first('fetch')({
        request,
        waitUntil: (promise) => {
          waits.push(Promise.resolve(promise));
        },
        respondWith: (promise) => {
          handled = true;
          response = Promise.resolve(promise);
        },
      });
      await Promise.all(waits);
      if (response) await response;
      return handled;
    },
  };
}

describe('academic operational UI contracts', () => {
  it('keeps the KS schedule and assessment surfaces read-only and truthful', () => {
    const ksWorkspace = source('app/dashboard/akademik/_components/KsWorkspace.tsx');

    expect(ksWorkspace).toContain('realSumatif?: AssessmentSessionData[]');
    expect(ksWorkspace).toContain('mode pantau');
    expect(ksWorkspace).not.toContain('Jadwal manual disimpan');
    expect(ksWorkspace).not.toContain('Slot jadwal dikosongkan');
    expect(ksWorkspace).not.toContain('handleSumatifAction');
    expect(ksWorkspace).not.toContain('Sumatif disetujui');
  });

  it('does not present local session state as persisted completion or settings', () => {
    const sessionFlow = source('app/dashboard/akademik/_components/SessionFlowModal.tsx');

    expect(sessionFlow).toContain('Tutup Alur');
    expect(sessionFlow).toContain('onAbsen(');
    expect(sessionFlow).toContain('onJurnal(');
    expect(sessionFlow).not.toContain('Tandai Selesai');
    expect(sessionFlow).not.toContain('Selesai Sesi');
    expect(sessionFlow).not.toContain('durationMinutes');
    expect(sessionFlow).not.toContain('randomizeOrder');
  });

  it('uses native buttons for every editable schedule entry', () => {
    const scheduleMatrix = source('app/dashboard/jadwal/_components/JadwalMatrix.tsx');

    expect(scheduleMatrix.match(/aria-label=\{`Edit jadwal/g)).toHaveLength(2);
    expect(scheduleMatrix).toContain('focus-visible:ring-2');
    expect(scheduleMatrix).not.toMatch(/<td[^>]*onClick=/);
    expect(scheduleMatrix).not.toMatch(/<div[^>]*onClick=/);
  });

  it('keeps Waka teaching and curriculum work available as explicit modes', () => {
    const modeSwitcher = source('app/dashboard/akademik/_components/AcademicRoleModeSwitcher.tsx');
    const academicPage = source('app/dashboard/akademik/page.tsx');

    expect(modeSwitcher).toContain('Pengajaran Saya');
    expect(modeSwitcher).toContain('Operasional Kurikulum');
    expect(modeSwitcher).toContain('role="tablist"');
    expect(modeSwitcher).toContain('role="tabpanel"');
    expect(academicPage).toContain('isDualRoleWaka');
    expect(academicPage).toContain('teacherId=${encodeURIComponent(ownTeacherId)}');
  });

  it('loads schedule pages and assignment choices from server-driven actions', () => {
    const schedulePage = source('app/dashboard/jadwal/page.tsx');
    const scheduleMatrix = source('app/dashboard/jadwal/_components/JadwalMatrix.tsx');
    const scheduleForm = source('app/dashboard/jadwal/_components/JadwalForm.tsx');

    expect(schedulePage).not.toContain('/schedules?limit=500');
    expect(scheduleMatrix).toContain('fetchScheduleList({');
    expect(scheduleMatrix).toContain('<TablePagination');
    expect(scheduleForm).toContain('searchScheduleAssignments({');
    expect(scheduleForm).toContain('JP_SLOTS.map');
  });

  it('hides operational shortcuts that are not granted by authority', () => {
    const operations = source('app/dashboard/akademik/_components/AcademicOperationsWorkspace.tsx');
    const academicPage = source('app/dashboard/akademik/page.tsx');

    expect(operations).toContain('availableWorkflows');
    expect(operations).toContain('workflowAccess[workflow.key]');
    expect(academicPage).toContain("reviewRpp: authority.can('rpp.curriculum.review')");
    expect(academicPage).toContain("authority.can('rpp.final.approve')");
  });

  it('keeps the RPP review dialog open until the request succeeds', () => {
    const rppBoard = source('app/dashboard/rpp/_components/RppBoard.tsx');

    expect(rppBoard).toContain("run(() => reviewRpp(item.id, decision, note.trim() || undefined), onClose)");
    expect(rppBoard).toContain("if (!result.success) setError(result.error ?? 'Aksi gagal diproses')");
    expect(rppBoard).toContain('else onSuccess?.();');
    expect(rppBoard).toContain('!open && !pending && onClose()');
    expect(rppBoard).toContain('Review Modul Ajar');
    expect(rppBoard).not.toMatch(/delegasi KS|final approval|Final Approval|Review & Approve/);
    expect(rppBoard).not.toMatch(/run\(\(\) => reviewRpp[\s\S]*?\);\s*onClose\(\);/);
  });

  it('uses scoped report class options and human-readable audit actors', () => {
    const reportPage = source('app/dashboard/rapor/page.tsx');
    const reportHub = source('app/dashboard/rapor/_components/RaporHub.tsx');
    const ksPipeline = source('app/dashboard/akademik/_components/ks/RaporPipelineKs.tsx');

    expect(reportPage).toContain("'/report-cards/options/classes'");
    expect(reportPage).not.toContain("'/classes?page=1&limit=200'");
    expect(reportHub).toContain('classes.filter((item) => item.canManageDraft)');
    expect(reportHub).toContain("report?.canManageDraft && report.status === 'draft'");
    expect(reportHub).toContain('report.checkedByName');
    expect(reportHub).toContain('report.statusEvents.map');
    expect(reportHub).toContain('<ConfirmTransitionDialog');
    expect(reportHub).toContain('<RecoveryDialog');
    expect(reportHub).toContain('incidentReference');
    expect(reportHub).toContain('Mode bantuan Super Admin.');
    expect(reportHub).toContain('akan tercatat atas identitas Anda');
    expect(reportHub).not.toContain('window.confirm');
    expect(reportHub).not.toContain("Diperiksa oleh: {report.checkedBy ?? '-'}");
    expect(ksPipeline).toContain('href="/dashboard/rapor"');
    expect(ksPipeline).not.toContain('transitionReport');
    expect(ksPipeline).not.toContain('fetchReportCardsByClass');
    expect(reportPage).toContain("canRecover={authority.can('report.recover') && authority.hasRole('SUPER_ADMIN')}");
    expect(reportPage).toContain("canGenerate={!authority.hasRole('SUPER_ADMIN')");
    expect(reportPage).not.toContain("canGenerate={authority.can('report.wali.manage') && authority.hasRole('SUPER_ADMIN'");
    expect(reportPage).toContain("canCheck={!authority.hasRole('SUPER_ADMIN')");
    expect(reportPage).toContain("canPublish={authority.can('report.publish') && authority.hasRole('SUPER_ADMIN', 'KEPALA_SEKOLAH')}");
    expect(reportPage).toContain("canDistribute={authority.can('report.distribute') && authority.hasRole('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA')}");
  });

  it('keeps family and student report entry points on the canonical report module', () => {
    const ortuWorkspace = source('app/dashboard/akademik/_components/ortu/OrtuWorkspace.tsx');
    const nilaiOrtu = source('app/dashboard/akademik/_components/ortu/NilaiOrtu.tsx');
    const nilaiSiswa = source('app/dashboard/akademik/_components/siswa/NilaiSiswa.tsx');
    const siswaWorkspace = source('app/dashboard/akademik/_components/siswa/SiswaWorkspace.tsx');
    const reportPage = source('app/dashboard/rapor/page.tsx');
    const reportHub = source('app/dashboard/rapor/_components/RaporHub.tsx');

    expect(ortuWorkspace).toContain('router.push(learnerReportHref(activeStudentId))');
    expect(ortuWorkspace).toContain('onFetchNotifications={fetchMyNotifications}');
    expect(siswaWorkspace).toContain('onFetchNotifications={fetchMyNotifications}');
    expect(reportPage).toContain('const isLearnerReportViewer = authority.hasRole(\'SISWA\', \'ORANG_TUA\')');
    expect(reportPage).toContain("&& !authority.hasRole('SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA', 'GURU', 'WAKA_KURIKULUM', 'KAPROG', 'INDUSTRI')");
    expect(reportPage).toContain("if (authority.hasRole('INDUSTRI')) redirect('/dashboard')");
    expect(reportPage).toContain("if (!isLearnerReportViewer && !authority.can('report.read')) redirect('/dashboard')");
    expect(reportPage).toContain("const learnerShell = authority.hasRole('ORANG_TUA') ? 'parent' : authority.hasRole('SISWA') ? 'student' : null");
    expect(reportPage).toContain('learnerShell={learnerShell}');
    expect(reportHub).toContain("learnerShell?: 'student' | 'parent' | null");
    expect(reportHub).toContain('<LearnerAppShell');
    expect(reportHub).toContain("shell === 'parent' ? 'ortu-app' : 'siswa-app'");
    expect(reportHub).toContain("document.documentElement.setAttribute('data-theme'");
    expect(reportHub).toContain('learnerNotificationCenterHref');
    expect(ortuWorkspace).toContain('initialStudentId');
    expect(ortuWorkspace).toContain('fallbackStudentId={activeStudentId}');
    expect(reportHub).toContain("const dashboardHref = learnerDashboardHref(shell === 'parent' ? studentId : undefined)");
    expect(reportHub).toContain('href={dashboardHref}');
    expect(siswaWorkspace).toContain('openNotifications');
    expect(nilaiOrtu).toContain('Rapor resmi');
    expect(nilaiSiswa).toContain("router.push('/dashboard/rapor')");
    expect(nilaiSiswa).toContain('Rapor resmi');
    expect(ortuWorkspace).not.toContain("import RaporModal from './RaporModal'");
    expect(ortuWorkspace).not.toContain("type: 'rapor'");
    expect(nilaiSiswa).not.toContain('Rapor akan tersedia');
  });

  it('locks report generation UI to the active period and supports selected-child filtering', () => {
    const reportPage = source('app/dashboard/rapor/page.tsx');
    const reportHub = source('app/dashboard/rapor/_components/RaporHub.tsx');

    expect(reportPage).toContain('const studentId = one(sp.studentId)');
    expect(reportPage).toContain("query.set('studentId', studentId)");
    expect(reportHub).toContain('Tahun ajaran aktif');
    expect(reportHub).toContain('Semester aktif');
    expect(reportHub).toContain('generateReports({ classId, academicYear: defaultAcademicYear, semester: defaultSemester })');
    expect(reportHub).toContain('KKTP snapshot');
    expect(reportHub).not.toContain('id="report-year"');
    expect(reportHub).not.toContain('setAcademicYear');
    expect(reportHub).not.toContain('setSemester');
  });

  it('wires push notification history to user-bound logs and handles service-worker push events', () => {
    const actions = source('app/dashboard/akademik/actions.ts');
    const toggle = source('components/shared/PushNotificationToggle.tsx');
    const siswaWorkspace = source('app/dashboard/akademik/_components/siswa/SiswaWorkspace.tsx');
    const siswaAnnouncements = source('app/dashboard/akademik/_components/siswa/PengumumanModal.tsx');
    const ortuWorkspace = source('app/dashboard/akademik/_components/ortu/OrtuWorkspace.tsx');
    const ortuAnnouncements = source('app/dashboard/akademik/_components/ortu/PengumumanModal.tsx');
    const sw = source('../public/sw.js');

    expect(actions).toContain("apiCall('/push/my-notifications', 'GET')");
    expect(toggle).toContain('onFetchNotifications');
    expect(toggle).not.toContain('recipient: string');
    expect(siswaWorkspace).toContain('onFetchNotifications={fetchMyNotifications}');
    expect(ortuWorkspace).toContain('onFetchNotifications={fetchMyNotifications}');
    expect(actions).toContain('targetHref?: string | null');
    expect(siswaAnnouncements).toContain('learnerNotificationTargetHref(notification)');
    expect(ortuAnnouncements).toContain('learnerNotificationTargetHref(notification, fallbackStudentId)');
    expect(siswaAnnouncements).toContain('window.location.href = notificationTargetHref(item)');
    expect(ortuAnnouncements).toContain('window.location.href = notificationTargetHref(item, fallbackStudentId)');
    expect(siswaAnnouncements).toContain('<LearnerNotificationDialog');
    expect(ortuAnnouncements).toContain('<LearnerNotificationDialog');
    expect(siswaWorkspace).toContain('aria-label="Notifikasi dan pengumuman"');
    expect(ortuWorkspace).toContain('aria-label="Notifikasi dan pengumuman"');
    expect(sw).toContain("self.addEventListener('push'");
    expect(sw).toContain('showNotification');
    expect(sw).toContain('function safeSameOriginPath');
    expect(sw).toContain("candidate.startsWith('//')");
    expect(sw).toContain("candidate.includes('\\\\')");
    expect(sw).toContain('new URL(candidate, self.location.origin)');
    expect(sw).toContain("self.addEventListener('notificationclick'");
    expect(sw).toContain('clients.openWindow(targetUrl)');
  });

  it('does not cache authenticated pages or navigation documents in the service worker', async () => {
    const sw = loadServiceWorkerHarness();

    await expect(sw.fetchHandled({
      method: 'GET',
      url: 'https://staging.smkdarussalamsubah.sch.id/dashboard/rapor',
      mode: 'navigate',
      destination: 'document',
    })).resolves.toBe(false);
    await expect(sw.fetchHandled({
      method: 'GET',
      url: 'https://staging.smkdarussalamsubah.sch.id/consent',
      mode: 'navigate',
      destination: 'document',
    })).resolves.toBe(false);
    await expect(sw.fetchHandled({
      method: 'GET',
      url: 'https://staging.smkdarussalamsubah.sch.id/api/v1/report-cards',
      destination: '',
    })).resolves.toBe(false);
    await expect(sw.fetchHandled({
      method: 'GET',
      url: 'https://staging.smkdarussalamsubah.sch.id/manifest.json',
      destination: 'manifest',
    })).resolves.toBe(true);
  });

  it('sanitizes service-worker notification URLs behaviorally', async () => {
    const sw = loadServiceWorkerHarness();

    await expect(sw.pushUrl({ url: '/dashboard/rapor?studentId=s1#nilai' }))
      .resolves.toBe('/dashboard/rapor?studentId=s1#nilai');
    await expect(sw.pushUrl({ url: '//evil.example/steal' }))
      .resolves.toBe('/dashboard');
    await expect(sw.pushUrl({ url: 'https://evil.example/dashboard' }))
      .resolves.toBe('/dashboard');
    await expect(sw.pushUrl({ url: '/dashboard\\rapor' }))
      .resolves.toBe('/dashboard');
    await expect(sw.pushUrl({ url: '/%E0%A4%A' }))
      .resolves.toBe('/dashboard');
    await expect(sw.pushUrl(undefined))
      .resolves.toBe('/dashboard');
    await expect(sw.pushMalformedJson())
      .resolves.toBe('/dashboard');
    await expect(sw.clickTarget('//evil.example/steal'))
      .resolves.toBe('/dashboard');
    await expect(sw.clickTarget('/dashboard/rapor'))
      .resolves.toBe('/dashboard/rapor');
  });

  it('keeps multi-role Super Admin out of routine report authoring and sends note versions', () => {
    const academicPage = source('app/dashboard/akademik/page.tsx');
    const workspace = source('app/dashboard/akademik/_components/AkademikWorkspace.tsx');
    const hub = source('app/dashboard/rapor/_components/RaporHub.tsx');
    const hubActions = source('app/dashboard/rapor/actions.ts');
    const academicActions = source('app/dashboard/akademik/actions.ts');
    const waliReports = source('app/dashboard/akademik/_components/guru/RaporWaliKelas.tsx');

    expect(academicPage).toContain("canManageReportCards={!authority.hasRole('SUPER_ADMIN')}");
    expect(workspace).toContain("NAV_ALL.filter((n) => n.key !== 'rapor')");
    expect(workspace).toContain('if (!canManageReportCards)');
    expect(hub).toContain('report.updatedAt), onClose');
    expect(hubActions).toContain('{ notes, expectedUpdatedAt }');
    expect(academicActions).toContain('{ notes, expectedUpdatedAt }');
    expect(waliReports).toContain('report.updatedAt');
  });

  it('loads frozen report sections atomically and ignores stale responses', () => {
    const modal = source('components/academic/shared/RaporModal.tsx');
    const actions = source('app/dashboard/akademik/actions.ts');

    expect(actions).toContain('/:studentId/official-sections'.replace(':studentId', '${studentId}'));
    expect(modal).toContain('fetchOfficialReportSections(');
    expect(modal).toContain('requestIdRef.current !== requestId');
    expect(modal).toContain('setSectionB(null)');
    expect(modal).toContain('loadedKey === sectionKey');
    expect(modal).not.toContain('Promise.all([');
    expect(modal).not.toContain('fetchMuatanLokal(');
  });

  it('uses authoritative teacher identity and exposes KAPROG scope', () => {
    const academicPage = source('app/dashboard/akademik/page.tsx');
    const operations = source('app/dashboard/akademik/_components/AcademicOperationsWorkspace.tsx');

    expect(academicPage).toContain("'/teaching-assignments/me/context'");
    expect(operations).toContain("options.scope?.type === 'major'");
    expect(operations).toContain("options.scope.labels.join(', ')");
  });

  it('uses structured confirmations for destructive academic actions', () => {
    const rppBoard = source('app/dashboard/rpp/_components/RppBoard.tsx');
    const activityList = source('app/dashboard/kegiatan/_components/KegiatanList.tsx');

    expect(rppBoard).toContain('<ConfirmDialog');
    expect(activityList).toContain('<ConfirmDialog');
    expect(rppBoard).not.toContain('window.confirm');
    expect(activityList).not.toContain('window.confirm');
  });

  it('renders class activity images only through the authenticated media route', () => {
    const activityList = source('app/dashboard/kegiatan/_components/KegiatanList.tsx');
    const mediaRoute = source('app/api/class-activities/[id]/media/route.ts');

    expect(activityList).toContain('src={`/api/class-activities/${item.id}/media`}');
    expect(activityList).not.toContain(': item.photoUrl');
    expect(activityList).toContain('Foto eksternal lama tidak ditampilkan');
    expect(activityList).toContain('Maksimal 5 MiB');
    expect(mediaRoute).toContain("'Cache-Control': 'private, no-store, max-age=0, no-transform'");
  });

  it('gives the mobile navigation trigger and sheet an accessible name', () => {
    const mobileNav = source('components/layout/MobileNav.tsx');

    expect(mobileNav).toContain('aria-label="Buka menu navigasi"');
    expect(mobileNav).toContain('<SheetTitle className="sr-only">Menu navigasi</SheetTitle>');
  });
});
