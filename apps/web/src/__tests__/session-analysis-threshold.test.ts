import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SessionAnalysisPanel from '@/app/dashboard/akademik/_components/SessionAnalysisPanel';

let mockValue: unknown;
let mockStateIndex = 0;
jest.mock('react', () => {
  const actual = jest.requireActual<typeof React>('react');
  return {
    ...actual,
    useState: (initial: unknown) => [mockStateIndex++ === 0 ? mockValue : initial, jest.fn()],
  };
});
jest.mock('@/app/dashboard/akademik/actions', () => ({ fetchSessionAnalysis: jest.fn() }));

function html(value: unknown, provenance: unknown = 'config') {
  mockStateIndex = 0;
  mockValue = {
    session: { id: 'session', title: 'Asesmen', type: 'formatif', status: 'completed' },
    summary: {
      totalStudents: 2, avgScore: 85, minScore: 75, maxScore: 95, medianScore: 85,
      ketuntasanPct: 50, tuntasCount: 1, belumTuntasCount: 1,
      kktpValue: value, kktpProvenance: provenance,
    },
    scoreDistribution: [], itemAnalysis: [],
  };
  return renderToStaticMarkup(React.createElement(SessionAnalysisPanel, { sessionId: 'session' }));
}

describe('official analysis threshold presentation', () => {
  it.each([['config', 80], ['module', 90], ['config', 0]])(
    'shows official %s threshold %s without replacing the server calculation', (source, value) => {
      const text = html(value, source);
      expect(text).toContain(`KKTP ${value}`);
      expect(text).toContain('50% siswa');
      expect(text).toContain('1 dari 2 siswa tuntas');
      expect(text).not.toContain('KKTP (75)');
    },
  );
  it('discloses a system default instead of calling it official configuration', () => {
    expect(html(75, 'system_default')).toContain('KKTP 75 (batas bawaan)');
  });
  it.each([null, undefined, Number.NaN, -1, 101, '80'])(
    'does not invent ketuntasan for absent or invalid metadata %s', (value) => {
      const text = html(value);
      expect(text).toContain('Batas ketuntasan belum tersedia');
      expect(text).not.toContain('50% siswa');
      expect(text).not.toContain('Tuntas: 1/2');
      expect(text).not.toContain('KKTP (75)');
      expect(text).toContain('85');
    },
  );
  it.each(['unconfigured', 'unknown', undefined])('rejects unverified provenance %s', (source) => {
    // Explicit undefined must represent missing metadata, not the fixture default.
    const text = html(80, source ?? null);
    expect(text).toContain('Batas ketuntasan belum tersedia');
    expect(text).not.toContain('50% siswa');
  });
});
