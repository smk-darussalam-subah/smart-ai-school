import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  readStudentTasks,
  readParentSpp,
  type DashboardReadState,
} from '@/lib/learner-dashboard-read';
import type { ApiFetchResult } from '@/lib/api';
import TugasSiswa from '@/app/dashboard/akademik/_components/siswa/TugasSiswa';
import PembayaranOrtu from '@/app/dashboard/akademik/_components/ortu/PembayaranOrtu';
import PayDetailModal from '@/app/dashboard/akademik/_components/ortu/PayDetailModal';
import { mapSppToPembayaran } from '@/app/dashboard/akademik/_components/ortu/ortu-mappers';

const ok = (data: unknown): ApiFetchResult<unknown> => ({
  status: 'success',
  httpStatus: 200,
  data,
});
const task = {
  id: 'task-1',
  type: 'assessment',
  title: 'Tugas nyata',
  subject: 'Matematika',
  guru: null,
  status: 'pending',
};
const payment = { id: 'payment-1', month: 10, year: 2026, amount: '125000', status: 'unpaid' };
const groups = (items: unknown[] = []) => ({
  data: [{ studentId: 'child-a', studentName: 'Anak QA', payments: items }],
});

describe('availability is not empty data', () => {
  it.each([403, 429, 503])(
    'production HTTP client propagates HTTP%s before parsing',
    async (status) => {
      const original = global.fetch;
      global.fetch = jest
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ message: 'Synthetic' }), { status }));
      try {
        const api = jest.requireActual<typeof import('@/lib/api')>('@/lib/api');
        const result = await api.apiFetchResult<unknown>(
          '/student-dashboard/assignments',
          'synthetic-only',
        );
        expect(readStudentTasks(result)).toEqual({
          state: status === 403 ? 'denied' : 'unavailable',
        });
        expect(readParentSpp(result, ['child-a'])).toEqual({
          state: status === 403 ? 'denied' : 'unavailable',
        });
      } finally {
        global.fetch = original;
      }
    },
  );
  it.each([503, 429, 404, 400])(
    'preserves HTTP%s as unavailable, without records',
    (httpStatus) => {
      const result: ApiFetchResult<unknown> = {
        status: 'unavailable',
        httpStatus,
        message: 'PRIVATE SERVER DETAIL',
      };
      expect(readStudentTasks(result)).toEqual({ state: 'unavailable' });
      expect(readParentSpp(result, ['child-a'])).toEqual({ state: 'unavailable' });
    },
  );
  it('preserves denied separately and never carries stale records', () => {
    const result: ApiFetchResult<unknown> = {
      status: 'forbidden',
      httpStatus: 403,
      message: 'denied',
    };
    expect(readStudentTasks(result)).toEqual({ state: 'denied' });
    expect(readParentSpp(result, ['child-a'])).toEqual({ state: 'denied' });
  });
  it.each([null, {}, { data: null }, { data: [{}] }, { data: 'not-an-array' }])(
    'rejects missing/malformed successful payload %p',
    (data) => {
      expect(readStudentTasks(ok(data))).toEqual({ state: 'unavailable' });
      expect(readParentSpp(ok(data), ['child-a'])).toEqual({ state: 'unavailable' });
    },
  );
  it('an identified own student with zero tasks is legitimately empty', () => {
    expect(readStudentTasks(ok({ data: [{ studentId: 'child-a', assignments: [] }] }))).toEqual({
      state: 'ready',
      data: [],
    });
  });
  it('zero groups is not evidence that the own student has no tasks', () => {
    expect(readStudentTasks(ok({ data: [] }))).toEqual({ state: 'unavailable' });
  });
  it('maps real tasks and preserves null deadline, original identity and score', () => {
    const result = readStudentTasks(
      ok({
        data: [
          {
            studentId: 'child-a',
            assignments: [task, { ...task, id: 'task-2', status: 'graded', progress: 95 }],
          },
        ],
      }),
    );
    expect(result.state).toBe('ready');
    if (result.state !== 'ready') throw Error('expected ready');
    expect(result.data[0]).toMatchObject({
      uuid: 'task-1',
      assessmentSessionId: 'task-1',
      status: 'pending',
      deadline: 'Tanpa tenggat',
    });
    expect(result.data[1]?.score).toBe(95);
  });
  it('keeps official remedial lifecycle instead of a premature passed label', () => {
    const result = readStudentTasks(
      ok({
        data: [
          {
            studentId: 'child-a',
            assignments: [
              {
                ...task,
                purpose: 'remedial',
                status: 'graded',
                progress: 95,
                remedialParticipant: {
                  status: 'submitted',
                  assignedAt: '2026-10-25T00:00:00Z',
                  startedAt: null,
                  submittedAt: null,
                  finalizedAt: null,
                },
              },
            ],
          },
        ],
      }),
    );
    expect(result.state === 'ready' && result.data[0]?.status).toBe('submitted');
  });
  it.each([
    { ...task, dueAt: 'invalid' },
    { ...task, status: 'unknown' },
    { ...task, title: null },
  ])('rejects malformed task instead of silently dropping it', (item) => {
    expect(readStudentTasks(ok({ data: [{ studentId: 'child-a', assignments: [item] }] }))).toEqual(
      { state: 'unavailable' },
    );
  });
  it('preserves a linked child with no payments as empty success', () => {
    expect(readParentSpp(ok(groups()), ['child-a'])).toEqual({ state: 'ready', data: [] });
  });
  it('filters payments to authorized children and preserves monetary values', () => {
    const result = readParentSpp(
      ok({
        data: [
          ...groups([payment]).data,
          { ...groups([payment]).data[0], studentId: 'other-child' },
        ],
      }),
      ['child-a'],
    );
    expect(result).toEqual({
      state: 'ready',
      data: [
        {
          id: 'payment-1',
          studentId: 'child-a',
          month: '10/2026',
          amount: 125000,
          status: 'unpaid',
          dueDate: null,
          paidAt: null,
          receiptNo: null,
        },
      ],
    });
  });
  it('missing/revoked child never becomes an empty payment account', () => {
    expect(readParentSpp(ok(groups()), ['child-b'])).toEqual({ state: 'denied' });
    expect(readParentSpp(ok(groups()), [])).toEqual({ state: 'denied' });
  });
  it.each([
    { ...payment, amount: 'NaN' },
    { ...payment, amount: ' ' },
    { ...payment, status: 'unknown' },
    { ...payment, month: 13 },
  ])('rejects malformed finance item %p', (item) => {
    expect(readParentSpp(ok(groups([item])), ['child-a'])).toEqual({ state: 'unavailable' });
  });
  it('rejects duplicate child groups', () => {
    expect(readParentSpp(ok({ data: [...groups().data, ...groups().data] }), ['child-a'])).toEqual({
      state: 'unavailable',
    });
  });
});

describe('real production tabs distinguish empty / unavailable / denied / loading', () => {
  const renderTasks = (state: DashboardReadState) =>
    renderToStaticMarkup(
      React.createElement(TugasSiswa, {
        tasks: [],
        taskState: state,
        onRetryTasks: () => {},
        showToast: () => {},
        go: () => {},
        setModal: () => {},
      }),
    );
  const renderPayments = (state: DashboardReadState) =>
    renderToStaticMarkup(
      React.createElement(PembayaranOrtu, {
        spp: [],
        sppState: state,
        onRetrySpp: () => {},
        setModal: () => {},
      }),
    );
  it.each(['unavailable', 'denied', 'loading'] as const)(
    'never prints empty claims or zero filters for %s',
    (state) => {
      const tasks = renderTasks(state),
        payments = renderPayments(state);
      expect(tasks).not.toContain('Tidak ada tugas pending');
      expect(tasks).not.toContain('0 pending');
      expect(payments).not.toContain('Tidak ada data pembayaran');
      for (const html of [tasks, payments]) {
        expect(html).toContain(state === 'loading' ? 'role="status"' : 'role="alert"');
        expect(html).toContain(
          state === 'loading'
            ? 'Memuat'
            : state === 'denied'
              ? 'tidak dapat diakses'
              : 'belum dapat dimuat',
        );
        expect(html).toContain(state === 'loading' ? 'disabled' : 'Coba lagi');
      }
    },
  );
  it('still presents true empty success', () => {
    expect(renderTasks('ready')).toContain('Tidak ada tugas yang perlu dikerjakan');
    expect(renderPayments('ready')).toContain('Tidak ada data pembayaran');
    expect(renderTasks('ready')).not.toBe(renderTasks('unavailable'));
    expect(renderPayments('ready')).not.toBe(renderPayments('unavailable'));
  });
  it('a valid payment without dueDate is not rendered with an invented or invalid deadline', () => {
    const result = readParentSpp(ok(groups([payment])), ['child-a']);
    if (result.state !== 'ready') throw Error('expected valid payment');
    const html = renderToStaticMarkup(
      React.createElement(PembayaranOrtu, {
        spp: result.data,
        sppState: result.state,
        setModal: () => {},
      }),
    );
    expect(html).toContain('Jatuh tempo belum tersedia');
    expect(html).not.toMatch(/NaN|undefined|Terlewat/);
    const mapped = mapSppToPembayaran(result.data)[0];
    if (!mapped) throw Error('expected payment');
    const detail = renderToStaticMarkup(
      React.createElement(PayDetailModal, {
        payment: mapped,
        onClose: () => {},
        showToast: () => {},
      }),
    );
    expect(detail).toContain('Belum tersedia');
    expect(detail).not.toMatch(/NaN|undefined|Terlewat/);
  });
});
