import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { naOf } from '@/lib/academic';
import type { GradeItem } from '@/lib/api';
import {
  averageGradeComponents,
  meanGradeScores,
  kktpConfigSnapshot,
  validKktpDraft,
  subjectThreshold,
  gradeCsvCell,
} from '@/lib/grade-consumers';
import Gradebook from '@/app/dashboard/akademik/_components/GradebookPenilaian';
import Capaian from '@/app/dashboard/akademik/_components/CapaianRapor';
import KktpKs from '@/app/dashboard/akademik/_components/ks/KktpKs';

jest.mock('@/app/dashboard/akademik/actions', () => ({
  fetchCpProgress: jest.fn(),
  fetchKktpConfigs: jest.fn(),
  saveKktpConfig: jest.fn(),
  updateGrade: jest.fn(),
}));
jest.mock('@/app/dashboard/akademik/_components/QuestionBankEditor', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/components/academic/shared', () => ({ RaporModal: () => null }));

const grade = (id: string, score: string, type: GradeItem['type'] = 'uh'): GradeItem => ({
  id,
  score,
  type,
  notes: null,
  studentId: 'synthetic-student',
  semester: 1,
  academicYear: '2026/2027',
  student: { id: 'synthetic-student', nis: 'S-001', user: { fullName: 'Siswa Sintetis' } },
  assignment: {
    id: 'synthetic-assignment',
    subject: 'Matematika',
    classId: 'synthetic-class',
    academicYear: '2026/2027',
    class: { id: 'synthetic-class', name: 'Kelas Sintetis' },
  },
});
const grades = [grade('g1', '40'), grade('g2', '100')];
const threshold = { mapel: 'Matematika', kktp: 80, kktpProvenance: 'config' };
const renderGradebook = (extra: Partial<React.ComponentProps<typeof Gradebook>> = {}) =>
  renderToStaticMarkup(
    React.createElement(Gradebook, {
      grades,
      className: 'Kelas Sintetis',
      subject: 'Matematika',
      onInputNilai: () => {},
      academicYear: '2026/2027',
      semester: 1,
      dataState: 'ready',
      thresholdState: 'ready',
      thresholds: [threshold],
      ...extra,
    }),
  );

describe('CM consumer coherence: grade aggregation and official thresholds', () => {
  it('uses mean70 before weighted NA, independent of record order', () => {
    expect(averageGradeComponents(grades)).toEqual({ uh: 70 });
    expect(averageGradeComponents([...grades].reverse())).toEqual({ uh: 70 });
    expect(naOf(averageGradeComponents(grades))).toBe(70);
  });
  it('does not round component means before weighted NA', () => {
    const rows = [grade('a', '1.2'), grade('b', '1.2'), grade('c', '1.3'), grade('d', '99', 'uts')];
    const components = averageGradeComponents(rows);
    expect(components.uh).toBeCloseTo(3.7 / 3, 12);
    expect(naOf(components)).toBe(naOf({ uh: 3.7 / 3, uts: 99 }));
  });
  it('averages each type separately with zero preserved', () => {
    expect(
      averageGradeComponents([
        grade('a', '0'),
        grade('b', '100'),
        grade('c', '20', 'uts'),
        grade('d', '80', 'uts'),
      ]),
    ).toEqual({ uh: 50, uts: 50 });
  });
  it.each(['', 'not-number', '-1', '101', 'Infinity'])(
    'rejects invalid component score %s',
    (score) => {
      expect(averageGradeComponents([grade('bad', score)])).toEqual({});
    },
  );
  it('empty mean is absent, not zero', () => {
    expect(meanGradeScores([])).toBeNull();
  });
  it.each([0, 70, 80, 100])('accepts authoritative threshold %s', (kktp) => {
    expect(subjectThreshold([{ ...threshold, kktp }], 'Matematika')).toBe(kktp);
  });
  it('missing, unconfigured or ambiguous thresholds remain unknown', () => {
    expect(subjectThreshold([], 'Matematika')).toBeNull();
    expect(
      subjectThreshold(
        [{ ...threshold, kktp: null, kktpProvenance: 'unconfigured' }],
        'Matematika',
      ),
    ).toBeNull();
    expect(subjectThreshold([threshold, { ...threshold, kktp: 70 }], 'Matematika')).toBeNull();
  });
  it.each([NaN, -1, 101])('rejects invalid official threshold %s', (kktp) => {
    expect(subjectThreshold([{ ...threshold, kktp }], 'Matematika')).toBeNull();
  });
  it('rejects unrecognized threshold provenance', () => {
    expect(
      subjectThreshold([{ ...threshold, kktpProvenance: 'unverified' }], 'Matematika'),
    ).toBeNull();
  });
  it('real Gradebook has mean70 and official80, with individual record disclosure', () => {
    const html = renderGradebook();
    expect(html).toContain('KKTP 80');
    expect(html).toContain('Remedial (1)');
    expect(html).toContain('Rata-rata 2 catatan');
    expect(html).toContain('Catatan 1');
    expect(html).toMatch(/>70<\/td>/);
    expect(renderGradebook({ grades: [...grades].reverse() })).toBe(html);
  });
  it('status uses official70, not the former75 default', () => {
    const html = renderGradebook({ thresholds: [{ ...threshold, kktp: 70 }] });
    expect(html).toContain('Remedial (0)');
    expect(html).toContain('>Tuntas</span>');
  });
  it.each(['denied', 'unavailable'] as const)(
    'unknown threshold %s cannot produce remedial count or default75',
    (thresholdState) => {
      const html = renderGradebook({ thresholdState });
      expect(html).toContain('KKTP belum tersedia');
      expect(html).toContain('Remedial (—)');
      expect(html).not.toContain('KKTP 75');
      expect(html).toContain('>Belum tersedia</span>');
    },
  );
  it.each(['denied', 'unavailable'] as const)(
    'failed grade read %s is not an empty success',
    (dataState) => {
      const html = renderGradebook({ dataState });
      expect(html).not.toContain('Siswa Sintetis');
      expect(html).not.toContain('Belum ada nilai untuk kelas/mapel ini.');
      expect(html).toContain(
        dataState === 'denied'
          ? 'Anda tidak memiliki izin melihat nilai.'
          : 'Nilai belum dapat dimuat.',
      );
    },
  );
  it('excludes another semester/year even when grades are supplied', () => {
    expect(renderGradebook({ semester: 2 })).not.toContain('Siswa Sintetis');
    expect(renderGradebook({ academicYear: '2027/2028' })).not.toContain('Siswa Sintetis');
  });
  it('keeps homonymous students separate by id', () => {
    const html = renderGradebook({
      grades: [grades[0]!, { ...grades[1]!, studentId: 'another-student' }],
    });
    expect((html.match(/<b class="text-\[#0f2e25\]">Siswa Sintetis/g) ?? []).length).toBe(2);
    expect(html).not.toContain('Rata-rata 2 catatan');
  });
  it('real Capaian preview computes70 and does not pretend thresholds are loaded in SSR', () => {
    const props = {
      grades,
      classId: 'synthetic-class',
      className: 'Kelas Sintetis',
      academicYear: '2026/2027',
      semester: 1,
      dataState: 'ready' as const,
    };
    const html = renderToStaticMarkup(React.createElement(Capaian, props));
    expect(html).toMatch(/>70<\/td>/);
    expect(html).toContain('Belum tersedia');
    expect(
      renderToStaticMarkup(
        React.createElement(Capaian, { ...props, grades: [...grades].reverse() }),
      ),
    ).toBe(html);
  });
});

describe('CM KKTP scoped read and draft validation', () => {
  const row = {
    id: 'synthetic-config',
    subject: 'Matematika',
    academicYear: '2026/2027',
    semester: 1,
    kktp: 80,
  };
  it('reads exact period only; another period cannot be merged', () => {
    expect(kktpConfigSnapshot({ success: true, data: [row] }, '2026/2027', 1)).toEqual({
      state: 'ready',
      values: { Matematika: 80 },
    });
    expect(kktpConfigSnapshot({ success: true, data: [row] }, '2026/2027', 2)).toEqual({
      state: 'unavailable',
      values: {},
    });
    expect(kktpConfigSnapshot({ success: true, data: [row] }, '2027/2028', 1).state).toBe(
      'unavailable',
    );
  });
  it('verified empty configuration is distinct from a read failure', () => {
    expect(kktpConfigSnapshot({ success: true, data: [] }, '2026/2027', 1)).toEqual({
      state: 'ready',
      values: {},
    });
    expect(kktpConfigSnapshot({ success: false }, '2026/2027', 1)).toEqual({
      state: 'unavailable',
      values: {},
    });
    expect(kktpConfigSnapshot({ success: false, state: 'denied' }, '2026/2027', 1).state).toBe(
      'denied',
    );
  });
  it.each([undefined, {}, [row, row], [{ ...row, kktp: 101 }], [{ ...row, kktp: '80' }]])(
    'rejects malformed or ambiguous config %p',
    (data) => {
      expect(kktpConfigSnapshot({ success: true, data }, '2026/2027', 1).state).toBe('unavailable');
    },
  );
  it.each(['', ' ', '-1', '101', '1.5', 'Infinity', 'NaN'])(
    'invalid draft %s cannot save',
    (raw) => {
      expect(validKktpDraft(raw)).toBeNull();
    },
  );
  it.each(['0', '75', '100'])('valid draft %s obeys backend range', (raw) => {
    expect(validKktpDraft(raw)).toBe(Number(raw));
  });
  it('real editor starts loading without editable/default or enabled save', () => {
    const html = renderToStaticMarkup(
      React.createElement(KktpKs, {
        academicYear: '2026/2027',
        semester: 2,
        subjects: [],
        kelasMapel: [],
        showToast: () => {},
      }),
    );
    expect(html).toContain('Memuat konfigurasi KKTP');
    expect(html).not.toContain('value="75"');
    expect(html).not.toContain('type="number"');
    expect(html).toContain('disabled=""');
  });
  it('CSV quotes commas/newlines, neutralizes formula text, keeps numeric zero', () => {
    expect(gradeCsvCell('Nama, "A"\nB')).toBe('"Nama, ""A""\nB"');
    expect(gradeCsvCell('=1+1')).toBe('"\'=1+1"');
    expect(gradeCsvCell(0)).toBe('"0"');
    expect(gradeCsvCell(null)).toBe('""');
  });
  it('production Workspace forwards official read states and period to both consumers', () => {
    const source = readFileSync(
      path.join(__dirname, '../app/dashboard/akademik/_components/AkademikWorkspace.tsx'),
      'utf8',
    );
    expect(source).toContain('thresholds={summaryThresholds}');
    expect(source).toContain('thresholdState={summaryAvailability?.kktp}');
    expect(source.match(/dataState=\{summaryAvailability\?\.grades\}/g)).toHaveLength(2);
  });
  it('rapor prose is ordinary inline flow, not flex fragments', () => {
    const source = readFileSync(
      path.join(__dirname, '../app/dashboard/akademik/_components/CapaianRapor.tsx'),
      'utf8',
    );
    expect(source).not.toContain('mt-2 flex items-start gap-1.5');
    expect(source.match(/<b>mapel yang Anda ampu<\/b>/g)).toHaveLength(2);
  });
});
