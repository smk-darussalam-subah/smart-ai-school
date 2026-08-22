import React from 'react';
import { renderToString } from 'react-dom/server';
import MobileNav from '../components/layout/MobileNav';

jest.mock('../components/layout/Sidebar', () => ({
  Sidebar: function MockSidebar() {
    return React.createElement('nav', { 'aria-label': 'Menu samping' });
  },
}));

describe('MobileNav', () => {
  it('renders a named navigation trigger with a professional mobile touch target', () => {
    const html = renderToString(React.createElement(MobileNav));

    expect(html).toContain('aria-label="Buka menu navigasi"');
    expect(html).toContain('min-h-11');
    expect(html).toContain('min-w-11');
  });
});
