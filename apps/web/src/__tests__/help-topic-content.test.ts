import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import HelpTopicContent from '@/app/dashboard/panduan/_components/HelpTopicContent';
import TugasSiswa from '@/app/dashboard/akademik/_components/siswa/TugasSiswa';
import type { HelpTopicProjection } from '@/lib/help/help-projection';

const topic: HelpTopicProjection = {
  id: 'topic.report-card',
  slug: 'rapor-resmi',
  title: 'Rapor Resmi',
  summary: 'Panduan rapor untuk keluarga.',
  route: '/dashboard/rapor',
  category: 'task',
  keywords: ['rapor'],
  version: '2.0',
  featureStatus: 'available',
  updatedAt: '2026-08-26',
  contentOwner: 'academic',
  blocks: [
    {
      kind: 'cta',
      label: 'Buka Rapor Resmi',
      href: '/dashboard/rapor',
      preserveSelectedChild: true,
    },
    {
      kind: 'screenshot',
      screenshotId: 'shot.report.mobile',
      caption: 'Rapor anak terpilih pada perangkat mobile.',
      altText: 'Tampilan rapor anak terpilih',
      viewport: 'mobile-390x844',
      width: 390,
      height: 844,
    },
  ],
  relatedTopics: [],
  artifacts: [],
};

describe('Help screenshot rendering', () => {
  it('renders authenticated media with stable dimensions, alt text, caption, and child context', () => {
    const markup = renderToStaticMarkup(React.createElement(HelpTopicContent, {
      topic,
      toc: [],
      selectedChildId: 'child-owned',
      isParentViewer: true,
    }));

    expect(markup).toContain('<figure');
    expect(markup).toContain('width="390"');
    expect(markup).toContain('height="844"');
    expect(markup).toContain('alt="Tampilan rapor anak terpilih"');
    expect(markup).toContain('/api/help/screenshots/shot.report.mobile?studentId=child-owned');
    expect(markup).toContain('Rapor anak terpilih pada perangkat mobile.');
  });

  it('renders native same-tab and desktop new-tab links with a specific label and disclosure', () => {
    const markup = renderToStaticMarkup(React.createElement(HelpTopicContent, {
      topic,
      toc: [],
      selectedChildId: 'child-A',
      isParentViewer: true,
    }));

    expect(markup.match(/href="\/dashboard\/rapor\?studentId=child-A"/g)).toHaveLength(2);
    expect(markup).toContain('help-workflow-cta-same-tab');
    expect(markup).toContain('help-workflow-cta-new-tab');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).toContain('Buka Rapor Resmi');
    expect(markup).toContain('(membuka tab baru)');
    expect(markup).not.toContain('Buka fitur');
    expect(markup).not.toContain('onclick=');
    expect(markup).not.toContain('window.open');
  });

  it('keeps each verified child in its own fail-closed workflow link', () => {
    const childA = renderToStaticMarkup(React.createElement(HelpTopicContent, {
      topic, toc: [], selectedChildId: 'child-A', isParentViewer: true,
    }));
    const childB = renderToStaticMarkup(React.createElement(HelpTopicContent, {
      topic, toc: [], selectedChildId: 'child-B', isParentViewer: true,
    }));
    const missing = renderToStaticMarkup(React.createElement(HelpTopicContent, {
      topic, toc: [], selectedChildId: null, isParentViewer: true,
    }));

    expect(childA).toContain('/dashboard/rapor?studentId=child-A');
    expect(childA).not.toContain('/dashboard/rapor?studentId=child-B');
    expect(childB).toContain('/dashboard/rapor?studentId=child-B');
    expect(childB).not.toContain('/dashboard/rapor?studentId=child-A');
    expect(missing).toContain('Pilih anak yang terverifikasi');
    expect(missing).not.toContain('href="/dashboard/rapor');
  });

  it('does not require child context for a non-parent viewing a shared workflow topic', () => {
    const markup = renderToStaticMarkup(React.createElement(HelpTopicContent, {
      topic, toc: [], selectedChildId: null, isParentViewer: false,
    }));
    expect(markup).toContain('href="/dashboard/rapor"');
    expect(markup).not.toContain('studentId=');
    expect(markup).not.toContain('Pilih anak yang terverifikasi');
  });

  it('uses a same-tab default and only exposes the new-tab link for desktop fine-pointer browser mode', () => {
    const css = readFileSync(resolve(__dirname, '../app/globals.css'), 'utf8');
    const workflowRules = css.slice(css.indexOf('.help-workflow-cta-same-tab'));
    expect(workflowRules).toContain('.help-workflow-cta-same-tab');
    expect(workflowRules).toContain('display: inline-flex');
    expect(workflowRules).toContain('.help-workflow-cta-new-tab');
    expect(workflowRules).toContain('display: none');
    expect(workflowRules).toContain('(min-width: 768px)');
    expect(workflowRules).toContain('(hover: hover)');
    expect(workflowRules).toContain('(pointer: fine)');
    expect(workflowRules).toContain('(display-mode: browser)');
    expect(workflowRules).not.toContain('userAgent');
  });

  it('renders authority-specific academic destinations instead of one generic leadership target', () => {
    const academicTopic: HelpTopicProjection = {
      ...topic,
      id: 'topic.assessment',
      blocks: [{
        kind: 'cta',
        label: 'Buka Bank Soal',
        href: '/dashboard/akademik?view=question-bank',
        preserveSelectedChild: false,
      }],
    };
    const teacher = renderToStaticMarkup(React.createElement(HelpTopicContent, {
      topic: academicTopic,
      toc: [],
      workflowPersona: 'teacher',
    }));
    const principal = renderToStaticMarkup(React.createElement(HelpTopicContent, {
      topic: academicTopic,
      toc: [],
      workflowPersona: 'principal',
    }));
    const waka = renderToStaticMarkup(React.createElement(HelpTopicContent, {
      topic: academicTopic,
      toc: [],
      workflowPersona: 'waka-curriculum',
    }));
    const superAdmin = renderToStaticMarkup(React.createElement(HelpTopicContent, {
      topic: academicTopic,
      toc: [],
      workflowPersona: 'super-admin',
    }));
    const kaprog = renderToStaticMarkup(React.createElement(HelpTopicContent, {
      topic: academicTopic,
      toc: [],
      workflowPersona: 'kaprog',
    }));

    expect(teacher.match(/href="\/dashboard\/akademik\?view=question-bank"/g)).toHaveLength(2);
    expect(teacher).toContain('Buka Bank Soal');
    expect(principal.match(/href="\/dashboard\/akademik\?view=assessment-overview"/g)).toHaveLength(2);
    expect(principal).toContain('Buka Monitoring Asesmen');
    expect(waka.match(/href="\/dashboard\/akademik"/g)).toHaveLength(2);
    expect(waka).toContain('Buka Operasional Kurikulum');
    expect(superAdmin).toContain('Buka Operasional Akademik');
    expect(kaprog.match(/href="\/dashboard\/akademik\?view=question-bank"/g)).toHaveLength(2);
    expect(kaprog).toContain('Buka Bank Soal');
  });

  it('lands the student remedial CTA on participant lifecycle cards, not grade heuristics', () => {
    const markup = renderToStaticMarkup(React.createElement(TugasSiswa, {
      tasks: [
        {
          id: 1,
          assessmentSessionId: 'regular-1',
          purpose: 'regular',
          mp: 'Matematika',
          title: 'Asesmen Reguler',
          type: 'Asesmen',
          deadline: '1 Sep 2026, 10.00',
          dueAt: '2026-09-01T03:00:00.000Z',
          dlDays: 4,
          status: 'pending',
          guru: 'Guru Mapel',
          desc: 'Kerjakan asesmen.',
        },
        {
          id: 2,
          assessmentSessionId: 'remedial-1',
          purpose: 'remedial',
          sessionStatus: 'active',
          remedialParticipant: {
            status: 'in_progress',
            assignedAt: '2026-08-28T03:00:00.000Z',
            startedAt: '2026-08-29T03:00:00.000Z',
            submittedAt: null,
            finalizedAt: null,
          },
          mp: 'Matematika',
          title: 'Remedial Aljabar',
          type: 'Remedial',
          deadline: '1 Sep 2026, 10.00',
          dueAt: '2026-09-01T03:00:00.000Z',
          dlDays: 4,
          status: 'pending',
          guru: 'Guru Mapel',
          desc: 'Kerjakan satu kali sebelum tenggat.',
        },
        {
          id: 3,
          assessmentSessionId: 'remedial-2',
          purpose: 'remedial',
          sessionStatus: 'completed',
          remedialParticipant: {
            status: 'passed',
            assignedAt: '2026-08-20T03:00:00.000Z',
            startedAt: '2026-08-21T03:00:00.000Z',
            submittedAt: '2026-08-21T04:00:00.000Z',
            finalizedAt: '2026-08-22T03:00:00.000Z',
          },
          mp: 'Bahasa Indonesia',
          title: 'Remedial Teks Eksplanasi',
          type: 'Remedial',
          deadline: '22 Agu 2026, 10.00',
          dueAt: '2026-08-22T03:00:00.000Z',
          dlDays: -6,
          status: 'graded',
          guru: 'Guru Mapel',
          desc: 'Remedial sudah difinalisasi.',
        },
      ],
      initialSourceFilter: 'remedial',
      showToast: jest.fn(),
      go: jest.fn(),
      setModal: jest.fn(),
    }));

    expect(markup).toContain('Remedial Aljabar');
    expect(markup).not.toContain('Asesmen Reguler');
    expect(markup).toContain('Sedang dikerjakan');
    expect(markup).toContain('Remedial Teks Eksplanasi');
    expect(markup).toContain('Tuntas');
    expect(markup).toContain('Tenggat 1 Sep 2026, 10.00');
    expect(markup).toMatch(/aria-pressed="true"[^>]*>Remedial<\/button>/);
    expect(markup.indexOf('Remedial Aljabar')).toBeLessThan(markup.indexOf('Remedial Teks Eksplanasi'));
  });
});
