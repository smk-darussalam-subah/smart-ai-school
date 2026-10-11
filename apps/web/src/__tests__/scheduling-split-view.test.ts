import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SchedulingSplitView, { boundedPanelWidth, resizedPanelWidth } from '@/app/dashboard/jadwal/_components/SchedulingSplitView';

describe('Responsive scheduling panel resize', () => {
  it.each([[20,28],[90,72],[50,50],[NaN,59],[Infinity,59]])('bounds list width %s to %s', (value, expected) => {
    expect(boundedPanelWidth(value)).toBe(expected);
  });
  it('dragging left expands the schedule, right expands the list, and extremes stay bounded', () => {
    expect(resizedPanelWidth(59,-100,1000)).toBe(49);
    expect(resizedPanelWidth(59,100,1000)).toBe(69);
    expect(resizedPanelWidth(59,-1000,1000)).toBe(28);
    expect(resizedPanelWidth(59,1000,1000)).toBe(72);
    expect(resizedPanelWidth(59,10,0)).toBe(59);
  });
  it('preserves the tabpanel semantics with desktop-only accessible resizing and click alternatives', () => {
    const html=renderToStaticMarkup(React.createElement(SchedulingSplitView, {
      id:'schedule-test',labelledBy:'schedule-tab-classes',busy:false,
      children:[React.createElement('p',{key:'list'},'Daftar'),React.createElement('p',{key:'preview'},'Jadwal')],
    }));
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('aria-labelledby="schedule-tab-classes"');
    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-orientation="vertical"');
    expect(html).toContain('aria-valuenow="59"');
    expect(html).toContain('aria-label="Perluas daftar"');
    expect(html).toContain('aria-label="Perluas jadwal"');
    expect(html).toContain('aria-label="Pulihkan lebar panel"');
    expect(html).toContain('xl:grid-cols-');
  });
});
