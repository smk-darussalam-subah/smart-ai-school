import {
  getDraftWriteTarget,
  getPendingCreatedDraft,
  readCreatedRpp,
  readCreatedRppId,
} from '@/app/dashboard/akademik/_components/modul-ajar-draft-state';

describe('Modul Ajar draft id continuity', () => {
  it('save draft pertama create, save draft kedua dalam dialog yang sama update id hasil create', () => {
    let currentRppId: string | null = null;

    expect(getDraftWriteTarget(currentRppId, null)).toEqual({ kind: 'create' });

    currentRppId = readCreatedRppId({ success: true, data: { id: 'rpp-1' } });

    expect(getDraftWriteTarget(currentRppId, null)).toEqual({ kind: 'update', id: 'rpp-1' });
  });

  it('submit setelah draft save memakai id yang sama', () => {
    const currentRppId = readCreatedRppId({ success: true, data: { id: 'rpp-1' } });

    expect(getDraftWriteTarget(currentRppId, null)).toEqual({ kind: 'update', id: 'rpp-1' });
  });

  it('mewakili satu sesi dialog: create draft, update draft, lalu submit target id yang sama', () => {
    const actions: Array<{ action: 'create' | 'update' | 'submit'; id?: string }> = [];
    let currentRppId: string | null = null;

    const firstTarget = getDraftWriteTarget(currentRppId, null);
    if (firstTarget.kind === 'create') {
      actions.push({ action: 'create' });
      currentRppId = readCreatedRppId({ success: true, data: { id: 'rpp-1' } });
    }

    const secondTarget = getDraftWriteTarget(currentRppId, null);
    if (secondTarget.kind === 'update') actions.push({ action: 'update', id: secondTarget.id });

    const submitTarget = getDraftWriteTarget(currentRppId, null);
    if (submitTarget.kind === 'update') actions.push({ action: 'submit', id: submitTarget.id });

    expect(actions).toEqual([
      { action: 'create' },
      { action: 'update', id: 'rpp-1' },
      { action: 'submit', id: 'rpp-1' },
    ]);
  });

  it('edit existing RPP langsung memakai update dan tidak create baru', () => {
    expect(getDraftWriteTarget(null, 'rpp-existing')).toEqual({ kind: 'update', id: 'rpp-existing' });
  });

  it('response create tanpa id tidak mengubah target ke update palsu', () => {
    expect(readCreatedRppId({ success: true, data: { title: 'tanpa id' } })).toBeNull();
    expect(getDraftWriteTarget(null, null)).toEqual({ kind: 'create' });
  });

  it('close lalu reopen sebelum parent list refresh memakai draft id hasil create', () => {
    const createdDraft = readCreatedRpp<{ id: string; title: string }>({
      success: true,
      data: { id: 'rpp-1', title: 'Draft Baru' },
    });

    const editingOnReopen = getPendingCreatedDraft(createdDraft, []);

    expect(editingOnReopen).toEqual({ id: 'rpp-1', title: 'Draft Baru' });
    expect(getDraftWriteTarget(null, editingOnReopen?.id)).toEqual({ kind: 'update', id: 'rpp-1' });
  });

  it('setelah parent list memuat draft, tombol buat kembali ke create baru', () => {
    const createdDraft = readCreatedRpp<{ id: string; title: string }>({
      success: true,
      data: { id: 'rpp-1', title: 'Draft Baru' },
    });

    const editingOnReopen = getPendingCreatedDraft(createdDraft, [{ id: 'rpp-1' }]);

    expect(editingOnReopen).toBeNull();
    expect(getDraftWriteTarget(null, editingOnReopen?.id)).toEqual({ kind: 'create' });
  });
});
