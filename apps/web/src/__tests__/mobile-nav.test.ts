import React from 'react';
import { renderToString } from 'react-dom/server';
import MobileNav from '../components/layout/MobileNav';
import TopBar from '../components/layout/TopBar';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { roles: ['SUPER_ADMIN'], user: { name: 'Admin Synthetic' } } }),
}));

jest.mock('../components/layout/Sidebar', () => ({
  Sidebar: function MockSidebar() {
    return React.createElement('nav', { 'aria-label': 'Menu samping' });
  },
}));

jest.mock('@/components/ui/sheet', () => ({
  Sheet: function MockSheet({ children }: { children: React.ReactNode }) {
    return React.createElement('div', null, children);
  },
  SheetTrigger: function MockSheetTrigger({ children }: { children: React.ReactNode }) {
    return React.createElement(React.Fragment, null, children);
  },
  SheetContent: function MockSheetContent({ children }: { children: React.ReactNode }) {
    return React.createElement('section', { role: 'dialog' }, children);
  },
  SheetTitle: function MockSheetTitle({ children }: { children: React.ReactNode }) {
    return React.createElement('h2', null, children);
  },
  SheetDescription: function MockSheetDescription({ children }: { children: React.ReactNode }) {
    return React.createElement('p', null, children);
  },
}));

describe('MobileNav', () => {
  it('renders a named navigation trigger with a professional mobile touch target', () => {
    const html = renderToString(React.createElement(MobileNav));

    expect(html).toContain('aria-label="Buka menu navigasi"');
    expect(html).toContain('min-h-11');
    expect(html).toContain('min-w-11');
    expect(html).toContain('Menu navigasi');
    expect(html).toContain('Navigasi utama sesuai peran dan kewenangan aktif.');
  });

  it('hides the real appointment in mobile and desktop chrome during mode tinjau', () => {
    const mobile = renderToString(React.createElement(MobileNav, {
      viewAs: 'GURU',
      positionRoles: [],
    }));
    const desktop = renderToString(React.createElement(TopBar, {
      viewAs: 'GURU',
      positionRoles: [],
      sidebarExpanded: false,
      onToggleSidebar: () => undefined,
    }));
    expect(mobile).toContain('Mode tinjau · Guru');
    expect(desktop).toContain('Mode tinjau');
    expect(desktop).toContain('Guru');
    expect(`${mobile}${desktop}`).not.toContain('Waka Kurikulum');
  });

  it('shows the active appointment again in normal mode', () => {
    const mobile = renderToString(React.createElement(MobileNav, {
      positionRoles: ['WAKA_KURIKULUM'],
    }));
    const desktop = renderToString(React.createElement(TopBar, {
      positionRoles: ['WAKA_KURIKULUM'],
      sidebarExpanded: false,
      onToggleSidebar: () => undefined,
    }));
    expect(mobile).toContain('Waka Kurikulum');
    expect(desktop).toContain('Super Admin');
    expect(desktop).toContain('Waka Kurikulum');
  });
});
