import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import fs from 'fs';
import path from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import BerandaSiswa from '../app/dashboard/akademik/_components/siswa/BerandaSiswa';
import { ModuleCard } from '../app/dashboard/akademik/_components/siswa/ModulSiswa';
import type { SiswaModul } from '../app/dashboard/akademik/_components/siswa/siswa-types';
import { withCompletedModuleProgress } from '../app/dashboard/akademik/_components/siswa/siswa-modul-progress';
import type { ModalState, SiswaScreen } from '../app/dashboard/akademik/_components/siswa/SiswaWorkspace';

const modules: SiswaModul[] = [
  {
    id: 1,
    uuid: 'module-active',
    tp: 'TP aktif',
    judul: 'Modul aktif',
    alokasi: '2 JP',
    kktp: 75,
    status: 'Aktif',
    lms: true,
    prog: 0,
    badge: null,
    mapel: 'Produktif',
  },
  {
    id: 2,
    uuid: 'module-locked',
    tp: 'TP terkunci',
    judul: 'Modul terkunci',
    alokasi: '2 JP',
    kktp: 75,
    status: 'Terkunci',
    lms: false,
    prog: 0,
    badge: null,
    mapel: 'Produktif',
  },
];

type ButtonElement = ReactElement<{ children?: ReactNode; onClick?: () => void }>;

function collectElements(node: ReactNode): ButtonElement[] {
  if (Array.isArray(node)) return node.flatMap(collectElements);
  if (!isValidElement(node)) return [];

  const element = node as ButtonElement;
  return [element, ...collectElements(element.props.children)];
}

function textFromNode(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textFromNode).join('');
  if (!isValidElement(node)) return '';

  return textFromNode((node as ButtonElement).props.children);
}

describe('student LMS progress freshness', () => {
  it('immediately reflects a confirmed completion in the visible module data', () => {
    expect(withCompletedModuleProgress(modules, new Set(['module-active']))).toEqual([
      expect.objectContaining({ uuid: 'module-active', status: 'Selesai', prog: 100 }),
      modules[1],
    ]);
  });

  it('does not mutate source modules or alter unrelated rows', () => {
    const result = withCompletedModuleProgress(modules, new Set(['module-active']));

    expect(result).not.toBe(modules);
    expect(result[0]).not.toBe(modules[0]);
    expect(result[1]).toBe(modules[1]);
    expect(modules[0]).toMatchObject({ status: 'Aktif', prog: 0 });
  });

  it('ignores completions for modules outside the current server payload', () => {
    expect(withCompletedModuleProgress(modules, new Set(['missing-module']))).toEqual(modules);
  });

  it('renders the confirmed completion explicitly in the module list and home confirmation', () => {
    const completedModule = withCompletedModuleProgress(modules, new Set(['module-active']))[0]!;
    const cardMarkup = renderToStaticMarkup(createElement(ModuleCard, {
      module: completedModule,
      isPending: false,
      onOpen: () => undefined,
      onComplete: () => undefined,
    }));
    const homeMarkup = renderToStaticMarkup(createElement(BerandaSiswa, {
      showToast: (_message: string) => undefined,
      go: (_screen: SiswaScreen) => undefined,
      setModal: (_modal: ModalState) => undefined,
      setBadgeCelebration: (_data: { show: boolean; badgeName?: string }) => undefined,
      setActiveModulId: (_id: number | null) => undefined,
      grades: [],
      tasks: [],
      badges: [],
      modules: [completedModule],
      recentlyCompletedModule: completedModule,
      quest: { title: 'Quest', tasks: [] },
      xp: { level: 1, current: 0, next: 100 },
      kehStats: { hadir: 0, izin: 0, sakit: 0, alpha: 0, total: 0, pct: 0 },
    }));

    expect(cardMarkup).toContain('Selesai');
    expect(cardMarkup).toContain('100%');
    expect(homeMarkup).toContain('Selesai');
    expect(homeMarkup).toContain('100%');
  });

  it('keeps complete and open controls as siblings so completing never opens module detail', () => {
    const onOpen = jest.fn();
    const onComplete = jest.fn();
    const card = ModuleCard({
      module: modules[0]!,
      isPending: false,
      onOpen,
      onComplete,
    });
    const buttons = collectElements(card).filter((element) => element.type === 'button');
    const completeButton = buttons.find((button) => textFromNode(button.props.children).includes('Tandai Selesai'));

    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => !collectElements(button.props.children).some((element) => element.type === 'button'))).toBe(true);
    expect(completeButton).toBeDefined();

    completeButton?.props.onClick?.();

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('keeps Wave 4 student runtime entry points out of placeholder mode', () => {
    const base = path.join(__dirname, '../app/dashboard/akademik/_components/siswa');
    const taskDetail = fs.readFileSync(path.join(base, 'TaskDetailModal.tsx'), 'utf8');
    const moduleDetail = fs.readFileSync(path.join(base, 'ModulDetailSiswa.tsx'), 'utf8');
    const lessonModal = fs.readFileSync(path.join(base, 'LessonSessionModal.tsx'), 'utf8');

    expect(taskDetail).not.toContain('Task Detail Modal');
    expect(moduleDetail).not.toContain('Modul Detail screen');
    expect(lessonModal).not.toContain('Lesson Session Modal');
    expect(taskDetail).toContain('startAssessmentResponse');
    expect(taskDetail).toContain('autosaveAssessmentResponse');
    const submitCalls = [...taskDetail.matchAll(/submitAssessmentResponse\([^;]+;/g)].map((match) => match[0]);
    expect(submitCalls).toEqual(['submitAssessmentResponse(task.assessmentSessionId!, answers);']);
  });
});
