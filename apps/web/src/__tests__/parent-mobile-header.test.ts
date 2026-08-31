import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import OrtuWorkspace from '../app/dashboard/akademik/_components/ortu/OrtuWorkspace';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { name: 'Wali Sintetis', email: 'wali@staging.local' } } }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock('../app/dashboard/akademik/actions', () => ({
  fetchMyNotifications: jest.fn(),
  subscribePush: jest.fn(),
  unsubscribePush: jest.fn(),
}));

jest.mock('../components/layout/ViewAsBanner', () => () => null);
jest.mock('../components/shared/PushNotificationToggle', () => () => React.createElement('div', null, 'Notifikasi perangkat'));
jest.mock('../app/dashboard/akademik/_components/ortu/BerandaOrtu', () => () => React.createElement('main', null, 'Beranda keluarga'));
jest.mock('../app/dashboard/akademik/_components/ortu/KehadiranOrtu', () => () => null);
jest.mock('../app/dashboard/akademik/_components/ortu/NilaiOrtu', () => () => null);
jest.mock('../app/dashboard/akademik/_components/ortu/PembayaranOrtu', () => () => null);
jest.mock('../app/dashboard/akademik/_components/ortu/CapaianOrtu', () => () => null);
jest.mock('../app/dashboard/akademik/_components/ortu/GradeDetailModal', () => () => null);
jest.mock('../app/dashboard/akademik/_components/ortu/PengumumanModal', () => () => null);
jest.mock('../app/dashboard/akademik/_components/ortu/DayDetailModal', () => () => null);
jest.mock('../app/dashboard/akademik/_components/ortu/PayDetailModal', () => () => null);

jest.mock('../components/ui/sheet', () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  SheetTrigger: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  SheetContent: ({ children }: { children: React.ReactNode }) => React.createElement('section', { role: 'dialog' }, children),
  SheetTitle: ({ children }: { children: React.ReactNode }) => React.createElement('h2', null, children),
  SheetDescription: ({ children }: { children: React.ReactNode }) => React.createElement('p', null, children),
}));

describe('parent mobile header', () => {
  it('keeps a long child name bounded while preserving the full accessible name', () => {
    const longName = 'NamaAnakSangatPanjangTanpaSpasiYangTidakBolehMendorongKontrol';
    const html = renderToStaticMarkup(React.createElement(OrtuWorkspace, {
      children: [{
        id: 1,
        studentId: 'student-synthetic',
        name: longName,
        kelas: 'X Sintetis 1',
        active: true,
        avg: 0,
        att: 0,
        wali: 'Wali Sintetis',
      }],
    }));

    expect(html).toContain(`aria-label="Pilih anak. Aktif: ${longName}"`);
    expect(html).toContain('max-w-[6.5rem]');
    expect(html).toContain('min-w-0 flex-1 truncate');
    expect(html).toContain('shrink-0');
  });

  it('prioritizes Help in the header and keeps theme settings inside an accessible account sheet', () => {
    const html = renderToStaticMarkup(React.createElement(OrtuWorkspace, {
      children: [{ id: 1, name: 'Anak', kelas: 'X', active: true, avg: 0, att: 0, wali: 'Wali' }],
    }));

    expect(html).toContain('aria-label="Panduan orang tua"');
    expect(html).toContain('aria-label="Notifikasi dan pengumuman"');
    expect(html).toContain('aria-label="Akun"');
    expect(html).not.toContain('aria-label="Ganti tema"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('Panel Akun');
    expect(html).toContain('Pengaturan akun, tema, notifikasi, dan akses panduan orang tua.');
    expect(html).toContain('Tema Gelap');
  });
});
