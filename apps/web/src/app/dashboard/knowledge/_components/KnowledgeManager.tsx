'use client';
// =============================================================================
// KnowledgeManager — interaktivitas pengelolaan Basis Pengetahuan
//
// RBAC (tombol dikondisikan per peran — disembunyikan, bukan sekadar disabled):
//   Buat/Edit     → SA, KS, TU
//   Publish/Unpublish → SA, KS  (separation of duties: TU tidak bisa self-publish)
//   Hapus         → SA only (hard-delete)
//   Backfill      → SA only
// =============================================================================

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import type { KnowledgeListItem, KnowledgeDetail, BackfillResult } from '@/lib/api';
import { Card } from '@/components/ui/card';
import {
  getKnowledgeDetailAction,
  createKnowledgeAction,
  updateKnowledgeAction,
  publishKnowledgeAction,
  unpublishKnowledgeAction,
  deleteKnowledgeAction,
  backfillKnowledgeAction,
} from '../actions';

// ── Local types ───────────────────────────────────────────────────────────────

type FilterValue = 'all' | 'draft' | 'published';
type ViewMode = 'list' | 'create' | 'edit';
type NoticeType = 'success' | 'error' | 'info';

interface Notice {
  type: NoticeType;
  msg: string;
}

interface ConfirmTarget {
  type: 'delete' | 'publish' | 'unpublish';
  id: string;
  title: string;
}

interface FormData {
  title: string;
  content: string;
  category: string;
  source: string;
}

const EMPTY_FORM: FormData = { title: '', content: '', category: '', source: '' };

// ── RBAC helpers ──────────────────────────────────────────────────────────────

function hasAnyRole(roles: string[], ...targets: string[]): boolean {
  return targets.some((r) => roles.includes(r));
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="badge bg-green-100 text-green-700">Published</span>
  ) : (
    <span className="badge bg-gray-100 text-gray-600">Draft</span>
  );
}

function EmbedIndicator({ hasEmbedding }: { hasEmbedding: boolean }) {
  return hasEmbedding ? (
    <span className="text-green-600 font-bold" title="Embedding tersedia">✓</span>
  ) : (
    <span className="text-yellow-500 font-bold" title="Embedding belum ada">⚠</span>
  );
}

function NoticeBar({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  return (
    <div
      role="alert"
      className={clsx(
        'flex items-start justify-between gap-3 px-4 py-3 rounded-lg text-sm font-medium',
        notice.type === 'success' && 'bg-green-50 text-green-800 border border-green-200',
        notice.type === 'error' && 'bg-red-50 text-red-800 border border-red-200',
        notice.type === 'info' && 'bg-blue-50 text-blue-800 border border-blue-200',
      )}
    >
      <span>{notice.msg}</span>
      <button
        onClick={onClose}
        aria-label="Tutup notifikasi"
        className="shrink-0 opacity-60 hover:opacity-100"
      >
        ✕
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  initialItems: KnowledgeListItem[];
  userRoles: string[];
}

export function KnowledgeManager({ initialItems, userRoles }: Props) {
  const router = useRouter();

  // RBAC
  const canCreate   = hasAnyRole(userRoles, 'SUPER_ADMIN', 'KEPALA_SEKOLAH', 'TATA_USAHA');
  const canPublish  = hasAnyRole(userRoles, 'SUPER_ADMIN', 'KEPALA_SEKOLAH');
  const canDelete   = hasAnyRole(userRoles, 'SUPER_ADMIN');
  const canBackfill = hasAnyRole(userRoles, 'SUPER_ADMIN');

  // List state — synced with server data after router.refresh()
  const [items, setItems] = useState<KnowledgeListItem[]>(initialItems);
  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  // Filter + search (client-side)
  const [filter, setFilter] = useState<FilterValue>('all');
  const [search, setSearch] = useState('');

  // View + form state
  const [view, setView] = useState<ViewMode>('list');
  const [editDetail, setEditDetail] = useState<KnowledgeDetail | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [originalContent, setOriginalContent] = useState('');

  // Async + feedback state
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirm, setConfirm] = useState<ConfirmTarget | null>(null);
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function showNotice(type: NoticeType, msg: string) {
    setNotice({ type, msg });
  }

  function resetForm() {
    setView('list');
    setForm(EMPTY_FORM);
    setEditDetail(null);
    setOriginalContent('');
  }

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = items.filter((item) => {
    const matchFilter =
      filter === 'all' ||
      (filter === 'published' && item.isActive) ||
      (filter === 'draft' && !item.isActive);
    const matchSearch =
      !search.trim() || item.title.toLowerCase().includes(search.trim().toLowerCase());
    return matchFilter && matchSearch;
  });

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleOpenEdit(id: string) {
    setBusy(true);
    const detail = await getKnowledgeDetailAction(id);
    setBusy(false);
    if (!detail) {
      showNotice('error', 'Gagal memuat detail knowledge');
      return;
    }
    setEditDetail(detail);
    setForm({
      title: detail.title,
      content: detail.content,
      category: detail.category,
      source: detail.source ?? '',
    });
    setOriginalContent(detail.content);
    setView('edit');
  }

  async function handleCreate() {
    if (!form.title.trim() || !form.content.trim() || !form.category.trim()) {
      showNotice('error', 'Judul, konten, dan kategori wajib diisi');
      return;
    }
    setBusy(true);
    const result = await createKnowledgeAction({
      title: form.title.trim(),
      content: form.content.trim(),
      category: form.category.trim(),
      source: form.source.trim() || undefined,
    });
    setBusy(false);

    if (!result.ok) {
      showNotice('error', result.error ?? 'Gagal membuat knowledge');
      return;
    }
    resetForm();
    router.refresh(); // server re-fetches list; useEffect syncs items state
    showNotice(
      'success',
      result.embeddingOk
        ? 'Tersimpan sebagai Draft — embedding berhasil dibuat.'
        : 'Tersimpan sebagai Draft — embedding gagal, jalankan Backfill setelah ini.',
    );
  }

  async function handleUpdate() {
    if (!editDetail) return;
    if (!form.title.trim() || !form.content.trim() || !form.category.trim()) {
      showNotice('error', 'Judul, konten, dan kategori wajib diisi');
      return;
    }
    setBusy(true);
    const result = await updateKnowledgeAction(editDetail.id, {
      title: form.title.trim(),
      content: form.content.trim(),
      category: form.category.trim(),
    });
    setBusy(false);

    if (!result.ok) {
      showNotice('error', result.error ?? 'Gagal mengubah knowledge');
      return;
    }
    const contentChanged = form.content.trim() !== originalContent;
    resetForm();
    router.refresh();
    showNotice(
      'success',
      contentChanged
        ? 'Perubahan disimpan — konten diubah, status kembali ke Draft, perlu publish ulang.'
        : 'Perubahan disimpan.',
    );
  }

  async function handleConfirmAction() {
    if (!confirm) return;
    setBusy(true);

    let result: { ok: boolean; status?: number; error?: string };
    if (confirm.type === 'delete') {
      result = await deleteKnowledgeAction(confirm.id);
    } else if (confirm.type === 'publish') {
      result = await publishKnowledgeAction(confirm.id);
    } else {
      result = await unpublishKnowledgeAction(confirm.id);
    }

    const confirmedType = confirm.type;
    const confirmedId   = confirm.id;
    setBusy(false);
    setConfirm(null);

    if (!result.ok) {
      showNotice('error', result.error ?? 'Aksi gagal');
      return;
    }

    // Optimistic local update (server cache already revalidated in action)
    if (confirmedType === 'delete') {
      setItems((prev) => prev.filter((i) => i.id !== confirmedId));
      showNotice('success', 'Knowledge berhasil dihapus');
    } else if (confirmedType === 'publish') {
      setItems((prev) =>
        prev.map((i) => (i.id === confirmedId ? { ...i, isActive: true } : i)),
      );
      showNotice('success', 'Knowledge berhasil dipublish');
    } else {
      setItems((prev) =>
        prev.map((i) => (i.id === confirmedId ? { ...i, isActive: false } : i)),
      );
      showNotice('success', 'Knowledge berhasil di-unpublish');
    }
  }

  async function handleBackfill() {
    setBusy(true);
    const result = await backfillKnowledgeAction();
    setBusy(false);

    if (!result.ok) {
      showNotice('error', result.error ?? 'Backfill gagal');
      return;
    }
    if (result.data) {
      setBackfillResult(result.data);
      router.refresh();
      showNotice(
        'success',
        `Backfill selesai — ${result.data.success}/${result.data.total} chunk berhasil`,
      );
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const contentChanged = view === 'edit' && form.content !== originalContent;

  return (
    <div className="space-y-4">
      {/* Notice bar */}
      {notice && <NoticeBar notice={notice} onClose={() => setNotice(null)} />}

      {/* Confirm overlay (delete / publish / unpublish) */}
      {confirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
        >
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
            <h3 id="confirm-title" className="text-base font-semibold text-gray-900 mb-2">
              {confirm.type === 'delete'
                ? 'Hapus Knowledge'
                : confirm.type === 'publish'
                ? 'Publish Knowledge'
                : 'Unpublish Knowledge'}
            </h3>

            <p className="text-sm text-gray-600 mb-1">
              {confirm.type === 'delete'
                ? 'Ini adalah hard-delete yang tidak bisa dibatalkan. Yakin menghapus:'
                : confirm.type === 'publish'
                ? 'Publish agar dapat digunakan chatbot:'
                : 'Kembalikan ke Draft (tidak akan muncul di chatbot):'}
            </p>
            <p className="text-sm font-semibold text-gray-900 mb-3 line-clamp-2">
              &ldquo;{confirm.title}&rdquo;
            </p>

            {confirm.type === 'delete' && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
                ⚠ Hard-delete — data tidak bisa dipulihkan
              </p>
            )}

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirm(null)}
                disabled={busy}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmAction}
                disabled={busy}
                className={clsx(
                  'px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-colors',
                  confirm.type === 'delete'
                    ? 'bg-red-600 hover:bg-red-700'
                    : confirm.type === 'publish'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-gray-600 hover:bg-gray-700',
                )}
              >
                {busy
                  ? 'Memproses...'
                  : confirm.type === 'delete'
                  ? 'Hapus'
                  : confirm.type === 'publish'
                  ? 'Publish'
                  : 'Unpublish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create / Edit Form ─────────────────────────────────────────────── */}
      {view !== 'list' && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">
              {view === 'create' ? 'Buat Knowledge Baru' : 'Edit Knowledge'}
            </h2>
            <button
              onClick={resetForm}
              aria-label="Tutup form"
              className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
            >
              ✕ Tutup
            </button>
          </div>

          {/* Re-embed warning */}
          {view === 'edit' && contentChanged && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-sm text-yellow-800" role="alert">
              ⚠ Mengubah konten akan re-embed &amp; mengembalikan ke Draft — perlu publish ulang
            </div>
          )}

          <div className="grid gap-4">
            {/* Judul */}
            <div>
              <label htmlFor="kb-title" className="block text-sm font-medium text-gray-700 mb-1">
                Judul <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <input
                id="kb-title"
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                maxLength={500}
                placeholder="Judul FAQ atau topik knowledge"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-smk-blue focus:border-transparent"
              />
            </div>

            {/* Kategori */}
            <div>
              <label htmlFor="kb-category" className="block text-sm font-medium text-gray-700 mb-1">
                Kategori <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <input
                id="kb-category"
                type="text"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                maxLength={100}
                placeholder="mis. Akademik, Keuangan, PPDB, Umum"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-smk-blue focus:border-transparent"
              />
            </div>

            {/* Konten */}
            <div>
              <label htmlFor="kb-content" className="block text-sm font-medium text-gray-700 mb-1">
                Konten <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <textarea
                id="kb-content"
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                rows={7}
                placeholder="Isi knowledge / jawaban FAQ yang akan dipakai chatbot"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-smk-blue focus:border-transparent resize-y"
              />
            </div>

            {/* Sumber — hanya di create (update DTO tidak menerima source) */}
            {view === 'create' && (
              <div>
                <label htmlFor="kb-source" className="block text-sm font-medium text-gray-700 mb-1">
                  Sumber{' '}
                  <span className="text-gray-400 text-xs font-normal">(opsional)</span>
                </label>
                <input
                  id="kb-source"
                  type="text"
                  value={form.source}
                  onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
                  maxLength={255}
                  placeholder="mis. Buku Panduan 2024, Peraturan Sekolah"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-smk-blue focus:border-transparent"
                />
              </div>
            )}
          </div>

          <div className="flex gap-3 justify-end pt-2 border-t border-gray-100">
            <button
              onClick={resetForm}
              disabled={busy}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              Batal
            </button>
            <button
              onClick={view === 'create' ? handleCreate : handleUpdate}
              disabled={busy}
              className="btn-primary"
            >
              {busy
                ? 'Menyimpan...'
                : view === 'create'
                ? 'Simpan sebagai Draft'
                : 'Simpan Perubahan'}
            </button>
          </div>
        </Card>
      )}

      {/* ── List view ─────────────────────────────────────────────────────── */}
      {view === 'list' && (
        <>
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Filter pills */}
            <div
              role="group"
              aria-label="Filter status"
              className="flex gap-1 bg-gray-100 rounded-lg p-1 shrink-0"
            >
              {(['all', 'draft', 'published'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  aria-pressed={filter === f}
                  className={clsx(
                    'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                    filter === f
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900',
                  )}
                >
                  {f === 'all' ? 'Semua' : f === 'draft' ? 'Draft' : 'Published'}
                </button>
              ))}
            </div>

            {/* Search */}
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari judul..."
              aria-label="Cari knowledge berdasarkan judul"
              className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-smk-blue"
            />

            {/* Action buttons */}
            <div className="flex gap-2 shrink-0">
              {canCreate && (
                <button onClick={() => setView('create')} className="btn-primary">
                  + Buat Baru
                </button>
              )}

              {canBackfill && (
                <button
                  onClick={handleBackfill}
                  disabled={busy}
                  title="Embed semua chunk yang belum memiliki embedding"
                  className="px-4 py-2 text-sm font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 disabled:opacity-50 transition-colors"
                >
                  {busy ? '⏳' : '🔄'} Backfill
                </button>
              )}
            </div>
          </div>

          {/* Backfill result summary */}
          {backfillResult && (
            <div className="flex items-center justify-between px-4 py-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-800">
              <span>
                Backfill selesai — Total:{' '}
                <strong>{backfillResult.total}</strong> · Berhasil:{' '}
                <strong className="text-green-700">{backfillResult.success}</strong> · Gagal:{' '}
                <strong className="text-red-700">{backfillResult.failed}</strong>
              </span>
              <button
                onClick={() => setBackfillResult(null)}
                aria-label="Tutup hasil backfill"
                className="ml-4 opacity-60 hover:opacity-100"
              >
                ✕
              </button>
            </div>
          )}

          {/* Table / empty state */}
          {filtered.length === 0 ? (
            <Card className="p-6 text-center py-12">
              <p className="text-3xl mb-3" role="img" aria-label="Otak">🧠</p>
              <p className="text-gray-500 text-sm">
                {search.trim() || filter !== 'all'
                  ? 'Tidak ada knowledge yang sesuai dengan filter'
                  : 'Belum ada knowledge. Klik "+ Buat Baru" untuk memulai.'}
              </p>
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
              <table
                className="w-full text-sm bg-white"
                aria-label="Tabel basis pengetahuan"
              >
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th scope="col" className="text-left px-4 py-3 font-semibold text-gray-600">
                      Judul
                    </th>
                    <th
                      scope="col"
                      className="text-left px-4 py-3 font-semibold text-gray-600 hidden md:table-cell"
                    >
                      Kategori
                    </th>
                    <th scope="col" className="text-left px-4 py-3 font-semibold text-gray-600">
                      Status
                    </th>
                    <th
                      scope="col"
                      className="text-center px-4 py-3 font-semibold text-gray-600 hidden sm:table-cell"
                    >
                      Embed
                    </th>
                    <th
                      scope="col"
                      className="text-left px-4 py-3 font-semibold text-gray-600 hidden lg:table-cell"
                    >
                      Dipublish
                    </th>
                    <th
                      scope="col"
                      className="text-right px-4 py-3 font-semibold text-gray-600"
                    >
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3 max-w-xs">
                        <span className="font-medium text-gray-900 line-clamp-2 block">
                          {item.title}
                        </span>
                      </td>

                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="badge bg-blue-50 text-blue-700">{item.category}</span>
                      </td>

                      <td className="px-4 py-3">
                        <StatusBadge isActive={item.isActive} />
                      </td>

                      <td className="px-4 py-3 text-center hidden sm:table-cell">
                        <EmbedIndicator hasEmbedding={item.hasEmbedding} />
                      </td>

                      <td className="px-4 py-3 text-gray-400 text-xs hidden lg:table-cell whitespace-nowrap">
                        {item.publishedAt
                          ? new Date(item.publishedAt).toLocaleDateString('id-ID')
                          : '—'}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-1.5 justify-end flex-wrap">
                          {/* Edit — SA/KS/TU */}
                          <button
                            onClick={() => handleOpenEdit(item.id)}
                            disabled={busy}
                            className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded-md hover:bg-blue-100 disabled:opacity-50 transition-colors"
                          >
                            Edit
                          </button>

                          {/* Publish / Unpublish — SA/KS only */}
                          {canPublish &&
                            (item.isActive ? (
                              <button
                                onClick={() =>
                                  setConfirm({
                                    type: 'unpublish',
                                    id: item.id,
                                    title: item.title,
                                  })
                                }
                                disabled={busy}
                                className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50 transition-colors"
                              >
                                Unpublish
                              </button>
                            ) : (
                              <button
                                onClick={() =>
                                  setConfirm({
                                    type: 'publish',
                                    id: item.id,
                                    title: item.title,
                                  })
                                }
                                disabled={busy}
                                className="px-2.5 py-1 text-xs font-medium text-green-700 bg-green-50 rounded-md hover:bg-green-100 disabled:opacity-50 transition-colors"
                              >
                                Publish
                              </button>
                            ))}

                          {/* Hapus — SA only */}
                          {canDelete && (
                            <button
                              onClick={() =>
                                setConfirm({
                                  type: 'delete',
                                  id: item.id,
                                  title: item.title,
                                })
                              }
                              disabled={busy}
                              className="px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 rounded-md hover:bg-red-100 disabled:opacity-50 transition-colors"
                            >
                              Hapus
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
