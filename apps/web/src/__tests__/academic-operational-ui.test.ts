import { readFileSync } from 'node:fs';
import path from 'node:path';

function source(relativePath: string): string {
  return readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
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
