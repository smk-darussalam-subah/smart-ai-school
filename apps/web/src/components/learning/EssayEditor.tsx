
'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { EditorContent, Extension, posToDOMRect, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { NodeSelection, Plugin } from '@tiptap/pm/state';
import { essayDocumentText, readEssayDocument, type AssessmentEssayAnswer, type EssayDocument } from '@smk/types';
import { QuestionFormula } from './QuestionEditorExtensions';
import EssayFormulaDialog from './EssayFormulaDialog';
import { MATERIAL_STYLE } from '@/lib/material-content';

const formatButtons = [
  ['bold', 'Tebal', 'toggleBold'],
  ['italic', 'Miring', 'toggleItalic'],
  ['bulletList', 'Butir daftar', 'toggleBulletList'],
] as const;

function asDocument(answer: AssessmentEssayAnswer | undefined): EssayDocument {
  const saved = readEssayDocument(answer?.document);
  return saved ?? { type: 'doc', content: [{ type: 'paragraph', ...(answer?.text
    ? { content: [{ type: 'text', text: answer.text }] } : {}) }] };
}

function needsDocument(document: EssayDocument): boolean {
  return document.content.some((block) => block.type === 'bulletList' || block.content?.some((part) =>
    part.type === 'questionFormula' || (part.type === 'text' && part.marks?.length)));
}

const tool = 'min-h-11 rounded-md border border-transparent px-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 aria-pressed:border-emerald-700 aria-pressed:bg-emerald-100 aria-pressed:text-emerald-900 dark:aria-pressed:bg-emerald-950 dark:aria-pressed:text-emerald-200';
type FormulaSelection = { from: number; to: number; initial?: string };

export default function EssayEditor({ answer, disabled, onChange }: {
  answer: AssessmentEssayAnswer | undefined;
  disabled: boolean;
  onChange: (answer: AssessmentEssayAnswer) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const [limit, setLimit] = useState(false);
  const [formula, setFormula] = useState<FormulaSelection | null>(null);
  const [dismissed, setDismissed] = useState('');
  const emitted = useRef(answer);
  const change = useRef(onChange);
  const locked = useRef(disabled);
  change.current = onChange;
  locked.current = disabled;

  const limits = useMemo(() => Extension.create({
    name: 'assessmentEssayDocumentLimit',
    addProseMirrorPlugins() {
      return [new Plugin({
        filterTransaction(transaction) {
          if (!transaction.docChanged) return true;
          const allowed = transaction.doc.content.size <= 12_000 && readEssayDocument(transaction.doc.toJSON()) !== null;
          if (!allowed) setLimit(true);
          return allowed;
        },
      })];
    },
  }), []);
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    content: asDocument(answer),
    extensions: [
      StarterKit.configure({
        blockquote: false, code: false, codeBlock: false, heading: false, horizontalRule: false,
        link: false, orderedList: false, strike: false, underline: false,
      }),
      QuestionFormula,
      limits,
    ],
    enableInputRules: false,
    enablePasteRules: false,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-label': 'Jawaban esai',
        'aria-multiline': 'true',
        'aria-describedby': hintId,
        class: 'diis-material min-h-32 whitespace-pre-wrap break-words rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600',
      },
    },
    onUpdate: ({ editor: instance }) => {
      if (!instance.isEditable || locked.current) return;
      const document = readEssayDocument(instance.getJSON());
      if (!document) return;
      const next: AssessmentEssayAnswer = {
        type: 'essay', text: essayDocumentText(document), ...(needsDocument(document) ? { document } : {}),
      };
      setLimit(false);
      emitted.current = next;
      change.current(next);
    },
  });
  const selection = useEditorState({
    editor,
    selector: ({ editor: instance }) => {
      const current = instance?.state.selection;
      const atom = current instanceof NodeSelection;
      return {
        from: current?.from ?? 0,
        to: current?.to ?? 0,
        active: Boolean(current && !current.empty && !atom),
        equation: atom && current.node.type.name === 'questionFormula'
          ? String(current.node.attrs.latex) : undefined,
        bold: instance?.isActive('bold') ?? false,
        italic: instance?.isActive('italic') ?? false,
        bulletList: instance?.isActive('bulletList') ?? false,
      };
    },
  });
  const selectionKey = selection ? selection.from + ':' + selection.to : '';
  const visible = Boolean(editor && selection?.active && !disabled && !formula && dismissed !== selectionKey);

  useEffect(() => {
    if (!editor) return;
    const before = emitted.current;
    emitted.current = answer;
    // Updating the attachment list must not reset the document or caret.
    if (answer?.text !== before?.text || answer?.document !== before?.document) {
      editor.commands.setContent(asDocument(answer), { emitUpdate: false });
    }
  }, [editor, answer]);

  useEffect(() => {
    editor?.setEditable(!disabled, false);
    if (disabled) setFormula(null);
  }, [editor, disabled]);

  useEffect(() => {
    if (dismissed !== selectionKey) setDismissed('');
  }, [dismissed, selectionKey]);

  const placeToolbar = useCallback(() => {
    const bar = toolbar.current;
    const host = root.current;
    if (!bar || !host || !editor || !visible || editor.isDestroyed) return;
    if (!host.contains(window.document.activeElement)) {
      bar.style.visibility = 'hidden';
      return;
    }
    const state = editor.state.selection;
    const range = posToDOMRect(editor.view, state.from, state.to);
    const bounds = host.getBoundingClientRect();
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop ?? 0;
    const bottom = top + (viewport?.height ?? window.innerHeight);
    const frame = host.closest('[role="dialog"]')?.getBoundingClientRect();
    const topLimit = Math.max(top, frame?.top ?? top) + 8;
    const bottomLimit = Math.min(bottom, frame?.bottom ?? bottom) - 8;
    if (range.bottom < topLimit || range.top > bottomLimit) {
      bar.style.visibility = 'hidden';
      return;
    }
    const left = Math.max(0, Math.min((range.left + range.right - bar.offsetWidth) / 2 - bounds.left, bounds.width - bar.offsetWidth));
    const above = range.top - bar.offsetHeight - 6;
    const below = range.bottom + 6;
    const preferBelow = window.matchMedia('(pointer: coarse)').matches;
    const y = preferBelow && below + bar.offsetHeight <= bottomLimit ? below : above >= topLimit ? above : below;
    bar.style.left = left + 'px';
    bar.style.top = Math.max(topLimit, Math.min(y, bottomLimit - bar.offsetHeight)) - bounds.top + 'px';
    bar.style.visibility = '';
  }, [editor, visible, selectionKey]);

  useEffect(() => {
    if (!visible) return;
    const frame = window.requestAnimationFrame(placeToolbar);
    window.addEventListener('scroll', placeToolbar, true);
    window.addEventListener('resize', placeToolbar);
    window.visualViewport?.addEventListener('resize', placeToolbar);
    window.visualViewport?.addEventListener('scroll', placeToolbar);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', placeToolbar, true);
      window.removeEventListener('resize', placeToolbar);
      window.visualViewport?.removeEventListener('resize', placeToolbar);
      window.visualViewport?.removeEventListener('scroll', placeToolbar);
    };
  }, [visible, placeToolbar]);

  function closeFormula() {
    setFormula(null);
    editor?.commands.focus();
  }

  return (
    <div ref={root} className="relative space-y-2"
      onFocus={() => { window.requestAnimationFrame(placeToolbar); }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          const bar = toolbar.current;
          if (bar) bar.style.visibility = 'hidden';
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && visible && toolbar.current?.style.visibility !== 'hidden') {
          event.preventDefault();
          event.stopPropagation();
          setDismissed(selectionKey);
          editor?.commands.focus();
        }
        if (event.key === 'Tab' && !event.shiftKey && visible && toolbar.current?.style.visibility !== 'hidden' && editor?.view.dom.contains(event.target as Node)) {
          event.preventDefault();
          toolbar.current?.querySelector('button')?.focus();
        }
      }}>
      <style>{MATERIAL_STYLE}</style>
      <EditorContent editor={editor} />
      {visible && (
        <div ref={toolbar} role="toolbar" aria-label="Format teks terpilih" style={{ visibility: 'hidden' }}
          className="absolute z-20 flex max-w-full flex-wrap gap-0.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-lg">
          {formatButtons.map(([key, label, command]) => (
            <button key={key} type="button" className={tool} aria-pressed={selection?.[key]}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => { editor?.chain().focus()[command]().run(); }}>
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={tool + ' border-[var(--border)]'} disabled={disabled || !editor}
          onClick={() => {
            if (!editor || disabled) return;
            const current = editor.state.selection;
            const initial = current instanceof NodeSelection && current.node.type.name === 'questionFormula'
              ? String(current.node.attrs.latex) : undefined;
            setFormula({ from: initial ? current.from : current.to, to: current.to, initial });
          }}>
          {selection?.equation ? 'Edit rumus' : 'Sisipkan rumus'}
        </button>
        <p id={hintId} className="text-xs text-[var(--muted)]">Seleksi teks untuk menampilkan format.</p>
      </div>
      {limit && <p role="status" className="text-sm text-rose-700 dark:text-rose-300">Batas panjang atau format tercapai. Perubahan terakhir belum diterapkan.</p>}
      {formula && <EssayFormulaDialog initial={formula.initial} onClose={closeFormula}
        onApply={(latex) => {
          if (!locked.current && editor?.isEditable) {
            editor.chain().focus().insertContentAt({ from: formula.from, to: formula.to },
              { type: 'questionFormula', attrs: { latex, display: false } }).run();
          }
          closeFormula();
        }} />}
    </div>
  );
}
