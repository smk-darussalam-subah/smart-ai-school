'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, ImageIcon, LoaderCircle, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TablePagination } from '@/components/ui/table-pagination';
import { Textarea } from '@/components/ui/textarea';
import { useQueryState } from '@/hooks/use-query-state';
import { createActivity, deleteActivity, updateActivity } from '../actions';

type Category = 'pembelajaran' | 'ulangan' | 'praktikum' | 'kegiatan' | 'lainnya';
export interface ActivityItem {
  id: string; classId: string; date: string; title: string; description?: string | null; category: Category;
  photoUrl?: string | null; mediaUrl?: string | null; class: { id: string; name: string };
  teacher: { id: string; user: { fullName: string } }; canManage: boolean;
}
interface ClassItem { id: string; name: string }
interface Props {
  items: ActivityItem[]; total: number; readableClasses: ClassItem[]; manageableClasses: ClassItem[];
  query: { page: number; limit: number; classId: string; category: string; search: string };
  canCreate: boolean; canManage: boolean;
}
const LABEL: Record<Category, string> = { pembelajaran: 'Pembelajaran', ulangan: 'Ulangan', praktikum: 'Praktikum', kegiatan: 'Kegiatan', lainnya: 'Lainnya' };
const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
const MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const formatDate = (iso: string) => new Date(iso).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export default function KegiatanList({ items, total, readableClasses, manageableClasses, query, canCreate, canManage }: Props) {
  const { setParams, isPending } = useQueryState();
  const [search, setSearch] = useState(query.search);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ActivityItem | null>(null);
  const [deleting, setDeleting] = useState<ActivityItem | null>(null);
  const [error, setError] = useState('');
  useEffect(() => setSearch(query.search), [query.search]);
  useEffect(() => { if (search === query.search) return; const timer = setTimeout(() => setParams({ search: search || null }), 350); return () => clearTimeout(timer); }, [query.search, search, setParams]);

  return <div className="space-y-5">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="text-2xl font-bold">Kegiatan Kelas</h1><p className="text-sm text-muted-foreground">Jurnal pembelajaran dan dokumentasi kelas yang aman untuk warga kelas.</p></div>{canCreate && <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Catat kegiatan</Button>}</div>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(240px,1fr)_200px_200px]">
      <div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari judul, isi, atau guru" className="pl-9" aria-label="Cari kegiatan" /></div>
      <Select value={query.classId || 'all'} onValueChange={(value: string) => setParams({ classId: value })}><SelectTrigger aria-label="Filter kelas"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Semua kelas</SelectItem>{readableClasses.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>
      <Select value={query.category || 'all'} onValueChange={(value: string) => setParams({ category: value })}><SelectTrigger aria-label="Filter kategori"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Semua kategori</SelectItem>{Object.entries(LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
    </div>
    {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    <div className={`grid gap-4 md:grid-cols-2 xl:grid-cols-3 transition-opacity ${isPending ? 'opacity-60' : ''}`} aria-busy={isPending}>
      {items.length === 0 ? <Card className="md:col-span-2 xl:col-span-3"><CardContent className="py-12 text-center text-sm text-muted-foreground">Belum ada kegiatan pada filter ini.</CardContent></Card> : items.map((item) => <Card key={item.id} className="overflow-hidden">
        {item.mediaUrl && <div className="aspect-video overflow-hidden border-b bg-muted"><img src={`/api/class-activities/${item.id}/media`} alt={`Dokumentasi ${item.title}`} className="h-full w-full object-cover" /></div>}
        <CardHeader className="pb-3"><div className="flex items-start justify-between gap-2"><CardTitle className="text-base leading-6">{item.title}</CardTitle><Badge variant="outline">{LABEL[item.category]}</Badge></div><p className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />{item.class.name} | {formatDate(item.date)}</p></CardHeader>
        <CardContent className="space-y-3">{item.description && <p className="whitespace-pre-wrap text-sm">{item.description}</p>}{item.photoUrl && !item.mediaUrl && <p className="text-xs text-amber-700">Foto eksternal lama tidak ditampilkan. Guru pencatat dapat mengunggah ulang ke penyimpanan privat.</p>}<p className="text-xs text-muted-foreground">Dicatat oleh {item.teacher.user.fullName}</p>{item.canManage && canManage && <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => { setEditing(item); setFormOpen(true); }}><Pencil className="mr-2 h-4 w-4" aria-hidden="true" />Edit</Button><Button size="sm" variant="destructive" onClick={() => setDeleting(item)}><Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />Hapus</Button></div>}</CardContent>
      </Card>)}
    </div>
    <TablePagination page={query.page} limit={query.limit} total={total} onPage={(page) => setParams({ page })} />
    {canManage && <KegiatanFormDialog open={formOpen} onOpenChange={setFormOpen} activity={editing} classes={manageableClasses} />}
    <ConfirmDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)} title="Hapus catatan kegiatan?" description={deleting ? `${deleting.title} dan media privatnya akan dihapus. Tindakan ini tidak dapat dibatalkan.` : ''} confirmLabel="Hapus" variant="danger" onConfirm={async () => { if (!deleting) return false; const result = await deleteActivity(deleting.id); if (!result.success) { setError(result.error ?? 'Kegiatan gagal dihapus'); return false; } return true; }} />
  </div>;
}

function KegiatanFormDialog({ open, onOpenChange, activity, classes }: { open: boolean; onOpenChange: (open: boolean) => void; activity: ActivityItem | null; classes: ClassItem[] }) {
  const router = useRouter();
  const inputId = 'activity-media';
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [classId, setClassId] = useState(''); const [date, setDate] = useState(''); const [title, setTitle] = useState(''); const [category, setCategory] = useState<Category>('pembelajaran'); const [description, setDescription] = useState(''); const [media, setMedia] = useState<File | null>(null); const [removeExisting, setRemoveExisting] = useState(false);
  const preview = useMemo(() => media ? URL.createObjectURL(media) : null, [media]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => { if (open) { setError(''); setClassId(activity?.classId ?? classes[0]?.id ?? ''); setDate(activity?.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)); setTitle(activity?.title ?? ''); setCategory(activity?.category ?? 'pembelajaran'); setDescription(activity?.description ?? ''); setMedia(null); setRemoveExisting(false); } }, [activity, classes, open]);
  const chooseMedia = (file: File | null) => { if (!file) { setMedia(null); return; } if (!MEDIA_TYPES.has(file.type)) { setError('Foto harus berupa JPEG, PNG, atau WebP.'); return; } if (file.size > MAX_MEDIA_BYTES) { setError('Ukuran foto maksimal 5 MiB.'); return; } setError(''); setMedia(file); };
  const mediaRequest = async (id: string, method: 'PUT' | 'DELETE', file?: File) => { const response = await fetch(`/api/class-activities/${id}/media`, { method, headers: file ? { 'Content-Type': file.type } : undefined, body: file }); if (!response.ok) { const payload = await response.json().catch(() => ({ message: 'Media gagal diproses' })); throw new Error(payload.message ?? 'Media gagal diproses'); } };
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setLoading(true); setError(''); try { const body = { classId, date, title: title.trim(), category, description: description.trim() || null }; const result = activity ? await updateActivity(activity.id, body) : await createActivity(body); if (!result.success) throw new Error(result.error ?? 'Kegiatan gagal disimpan'); const saved = result.data as { id: string }; const id = activity?.id ?? saved.id; if (removeExisting && (activity?.mediaUrl || activity?.photoUrl) && !media) await mediaRequest(id, 'DELETE'); if (media) await mediaRequest(id, 'PUT', media); router.refresh(); onOpenChange(false); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Kegiatan gagal disimpan'); } finally { setLoading(false); } };
  const hasExisting = !!(activity?.mediaUrl || activity?.photoUrl) && !removeExisting;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{activity ? 'Edit kegiatan' : 'Catat kegiatan'}</DialogTitle><DialogDescription>Catatan terlihat sesuai lingkup kelas. Foto disimpan privat dan hanya dapat dibuka oleh pengguna berwenang.</DialogDescription></DialogHeader><form className="space-y-4" onSubmit={submit}>
    <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>Kelas</Label><Select value={classId || undefined} onValueChange={setClassId}><SelectTrigger><SelectValue placeholder="Pilih kelas" /></SelectTrigger><SelectContent>{classes.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="activity-date">Tanggal</Label><Input id="activity-date" type="date" required value={date} onChange={(event) => setDate(event.target.value)} /></div></div>
    <div className="space-y-2"><Label htmlFor="activity-title">Judul</Label><Input id="activity-title" required minLength={3} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Contoh: Praktikum konfigurasi router" /></div>
    <div className="space-y-2"><Label>Kategori</Label><Select value={category} onValueChange={(value: string) => setCategory(value as Category)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
    <div className="space-y-2"><Label htmlFor="activity-description">Deskripsi</Label><Textarea id="activity-description" rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ringkas tujuan, aktivitas, dan hasil pembelajaran" /></div>
    <div className="space-y-2"><Label htmlFor={inputId}>Foto kegiatan (opsional)</Label><label htmlFor={inputId} className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed p-4 text-center hover:bg-muted/40"><Upload className="mb-2 h-5 w-5" aria-hidden="true" /><span className="text-sm font-medium">Pilih JPEG, PNG, atau WebP</span><span className="text-xs text-muted-foreground">Maksimal 5 MiB</span></label><Input id={inputId} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => chooseMedia(event.target.files?.[0] ?? null)} />{preview && <img src={preview} alt="Pratinjau foto baru" className="aspect-video w-full rounded-md border object-cover" />}{hasExisting && <div className="flex items-center justify-between rounded-md border p-3 text-sm"><span className="flex items-center gap-2"><ImageIcon className="h-4 w-4" aria-hidden="true" />{activity?.mediaUrl ? 'Foto privat tersimpan' : 'Foto eksternal lama perlu diganti'}</span><Button type="button" size="sm" variant="outline" onClick={() => setRemoveExisting(true)}>Hapus saat disimpan</Button></div>}</div>
    {error && <p className="text-sm text-destructive" role="alert">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>Batal</Button><Button type="submit" disabled={loading || !classId || title.trim().length < 3}>{loading && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}Simpan</Button></div>
  </form></DialogContent></Dialog>;
}
