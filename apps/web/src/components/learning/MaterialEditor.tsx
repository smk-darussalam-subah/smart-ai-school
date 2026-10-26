'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Link2,
  Undo2,
  Redo2,
  Table2,
  Code,
  Quote,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { MATERIAL_STYLE, safeMaterialLink, sanitizeMaterialHtml } from '@/lib/material-content';

interface Props {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
  describedBy?: string;
  invalid?: boolean;
  compact?: boolean;
}
const tool =
  'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-2 text-sm hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 aria-pressed:bg-emerald-100 aria-pressed:text-emerald-900 disabled:opacity-40 dark:hover:bg-slate-800 dark:aria-pressed:bg-emerald-950 dark:aria-pressed:text-emerald-200';

export default function MaterialEditor({
  value,
  onChange,
  disabled = false,
  ariaLabel = 'Isi materi',
  describedBy,
  invalid = false,
  compact = false,
}: Props) {
  const changeRef = useRef(onChange),
    lastEmitted = useRef(value);
  changeRef.current = onChange;
  const initialHtml = useRef<string | null>(null);
  if (initialHtml.current === null && typeof window !== 'undefined')
    initialHtml.current = sanitizeMaterialHtml(value);
  const [linkOpen, setLinkOpen] = useState(false),
    [href, setHref] = useState(''),
    [linkError, setLinkError] = useState('');
  const linkButton = useRef<HTMLButtonElement>(null),
    id = useId();
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          autolink: false,
          linkOnPaste: false,
          isAllowedUri: (uri) => safeMaterialLink(uri) !== null,
        },
      }),
      TableKit.configure({ table: { resizable: false } }),
    ],
    editable: !disabled,
    // Seed the document before any editor transaction can emit an update.
    // Deferring initial content to onCreate can overwrite existing material with an empty document.
    content: initialHtml.current ?? '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      lastEmitted.current = html;
      changeRef.current(html);
    },
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-label': ariaLabel,
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        'aria-multiline': 'true',
        class: `diis-material ${compact ? 'min-h-40' : 'min-h-72'} px-4 py-5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 sm:px-6`,
      },
      transformPastedHTML: (html) => sanitizeMaterialHtml(html),
    },
  });
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive('bold') ?? false,
      italic: editor?.isActive('italic') ?? false,
      bullet: editor?.isActive('bulletList') ?? false,
      ordered: editor?.isActive('orderedList') ?? false,
      quote: editor?.isActive('blockquote') ?? false,
      code: editor?.isActive('codeBlock') ?? false,
      table: editor?.isActive('table') ?? false,
      link: editor?.isActive('link') ?? false,
      heading: editor?.isActive('heading', { level: 2 })
        ? 'h2'
        : editor?.isActive('heading', { level: 3 })
          ? 'h3'
          : 'p',
      undo: editor?.can().undo() ?? false,
      redo: editor?.can().redo() ?? false,
    }),
  });
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);
  useEffect(() => {
    if (editor) editor.view.dom.setAttribute('aria-invalid', String(invalid));
  }, [editor, invalid]);
  useEffect(() => {
    if (editor && value !== lastEmitted.current) {
      editor.commands.setContent(sanitizeMaterialHtml(value), { emitUpdate: false });
      lastEmitted.current = value;
    }
  }, [editor, value]);

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-[var(--material-line)] bg-[var(--material-bg)]">
      <style>{MATERIAL_STYLE}</style>
      <div
        role="toolbar"
        aria-label={
          ariaLabel === 'Isi materi'
            ? 'Format materi'
            : `Format ${ariaLabel.toLocaleLowerCase('id-ID')}`
        }
        className="flex flex-wrap items-center gap-1 border-b border-[var(--material-line)] p-2"
      >
        <select
          aria-label="Gaya teks"
          className="min-h-11 min-w-28 rounded-lg border border-[var(--material-line)] bg-[var(--material-bg)] px-2 text-sm"
          disabled={!editor || disabled}
          value={state?.heading ?? 'p'}
          onChange={(event) => {
            if (event.target.value === 'p') editor?.chain().focus().setParagraph().run();
            else
              editor
                ?.chain()
                .focus()
                .setHeading({ level: event.target.value === 'h2' ? 2 : 3 })
                .run();
          }}
        >
          <option value="p">Paragraf</option>
          <option value="h2">Judul bagian</option>
          <option value="h3">Subjudul</option>
        </select>
        <button
          type="button"
          className={tool}
          aria-label="Tebal"
          title="Tebal (Ctrl+B)"
          aria-pressed={state?.bold ?? false}
          disabled={!editor || disabled}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold aria-hidden="true" className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={tool}
          aria-label="Miring"
          title="Miring (Ctrl+I)"
          aria-pressed={state?.italic ?? false}
          disabled={!editor || disabled}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic aria-hidden="true" className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={tool}
          aria-label="Daftar berpoin"
          title="Daftar berpoin"
          aria-pressed={state?.bullet ?? false}
          disabled={!editor || disabled}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List aria-hidden="true" className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={tool}
          aria-label="Daftar bernomor"
          title="Daftar bernomor"
          aria-pressed={state?.ordered ?? false}
          disabled={!editor || disabled}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered aria-hidden="true" className="h-4 w-4" />
        </button>
        <button
          ref={linkButton}
          type="button"
          className={tool}
          aria-label="Tautan"
          title="Tautan"
          aria-pressed={state?.link ?? false}
          disabled={!editor || disabled}
          onClick={() => {
            setHref(String(editor?.getAttributes('link').href ?? ''));
            setLinkError('');
            setLinkOpen(true);
          }}
        >
          <Link2 aria-hidden="true" className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={tool}
          aria-label="Kutipan"
          title="Kutipan"
          aria-pressed={state?.quote ?? false}
          disabled={!editor || disabled}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          <Quote aria-hidden="true" className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={tool}
          aria-label="Blok kode"
          title="Blok kode"
          aria-pressed={state?.code ?? false}
          disabled={!editor || disabled}
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
        >
          <Code aria-hidden="true" className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={tool}
          aria-label="Sisipkan tabel"
          title="Sisipkan tabel 3 × 3"
          disabled={!editor || disabled || !!state?.table}
          onClick={() =>
            editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
          }
        >
          <Table2 aria-hidden="true" className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={tool}
          aria-label="Urungkan"
          title="Urungkan"
          disabled={!state?.undo || disabled}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          <Undo2 aria-hidden="true" className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={tool}
          aria-label="Ulangi"
          title="Ulangi"
          disabled={!state?.redo || disabled}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          <Redo2 aria-hidden="true" className="h-4 w-4" />
        </button>
        {state?.table && (
          <div className="flex w-full flex-wrap gap-1 border-t border-[var(--material-line)] pt-2">
            <button
              type="button"
              className={tool}
              disabled={disabled}
              onClick={() => editor?.chain().focus().addRowAfter().run()}
            >
              Tambah baris
            </button>
            <button
              type="button"
              className={tool}
              disabled={disabled}
              onClick={() => editor?.chain().focus().addColumnAfter().run()}
            >
              Tambah kolom
            </button>
            <button
              type="button"
              className={tool}
              disabled={disabled}
              onClick={() => editor?.chain().focus().deleteRow().run()}
            >
              Hapus baris
            </button>
            <button
              type="button"
              className={tool}
              disabled={disabled}
              onClick={() => editor?.chain().focus().deleteColumn().run()}
            >
              Hapus kolom
            </button>
            <button
              type="button"
              className={tool}
              disabled={disabled}
              onClick={() => editor?.chain().focus().deleteTable().run()}
            >
              Hapus tabel
            </button>
          </div>
        )}
      </div>
      {!editor && (
        <p role="status" className="p-5 text-sm">
          Menyiapkan editor…
        </p>
      )}
      <EditorContent editor={editor} />
      {linkOpen && (
        <Dialog open onOpenChange={setLinkOpen}>
          <DialogContent
            className="max-w-md border-slate-300 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            onCloseAutoFocus={(event: Event) => {
              event.preventDefault();
              linkButton.current?.focus();
            }}
          >
            <DialogTitle>
              Tautan {ariaLabel === 'Isi materi' ? 'materi' : ariaLabel.toLocaleLowerCase('id-ID')}
            </DialogTitle>
            <DialogDescription className="text-slate-600 dark:text-slate-300">
              Gunakan alamat situs yang ingin dibaca siswa.
            </DialogDescription>
            <label htmlFor={id} className="text-sm font-semibold">
              Alamat tautan
            </label>
            <input
              id={id}
              value={href}
              onChange={(event) => {
                setHref(event.target.value);
                setLinkError('');
              }}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
              placeholder="https://..."
              aria-invalid={!!linkError}
              aria-describedby={linkError ? id + '-error' : undefined}
            />
            {linkError && (
              <p
                id={id + '-error'}
                role="alert"
                className="text-sm text-rose-700 dark:text-rose-300"
              >
                {linkError}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className={tool}
                onClick={() => {
                  editor?.chain().focus().extendMarkRange('link').unsetLink().run();
                  setLinkOpen(false);
                }}
              >
                Hapus tautan
              </button>
              <button
                type="button"
                className="min-h-11 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white"
                onClick={() => {
                  const safe = safeMaterialLink(href);
                  if (!safe) {
                    setLinkError(
                      'Gunakan tautan http/https, email, atau halaman internal yang valid.',
                    );
                    return;
                  }
                  editor?.chain().focus().extendMarkRange('link').setLink({ href: safe }).run();
                  setLinkOpen(false);
                }}
              >
                Terapkan tautan
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
