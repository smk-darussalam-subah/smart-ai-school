import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SheetContent, SheetDescription, SheetTitle } from '../components/ui/sheet';

jest.mock('@radix-ui/react-dialog', () => {
  const ReactRuntime = jest.requireActual<typeof React>('react');
  const element = (tag: string) => ReactRuntime.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
    function Primitive({ children, ...props }, ref) {
      return ReactRuntime.createElement(tag, { ...props, ref }, children);
    },
  );

  return {
    Root: ({ children }: { children: React.ReactNode }) => ReactRuntime.createElement(ReactRuntime.Fragment, null, children),
    Trigger: element('button'),
    Close: element('button'),
    Portal: ({ children }: { children: React.ReactNode }) => ReactRuntime.createElement(ReactRuntime.Fragment, null, children),
    Overlay: element('div'),
    Content: element('section'),
    Title: element('h2'),
    Description: element('p'),
  };
});

describe('Sheet accessibility contract', () => {
  it('renders a named 44px close target with title and description support', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        SheetContent,
        { side: 'bottom' },
        React.createElement(SheetTitle, null, 'Panel Akun'),
        React.createElement(SheetDescription, null, 'Pengaturan akun orang tua.'),
      ),
    );

    expect(html).toContain('min-h-11');
    expect(html).toContain('min-w-11');
    expect(html).toContain('Tutup');
    expect(html).toContain('Panel Akun');
    expect(html).toContain('Pengaturan akun orang tua.');
  });
});
