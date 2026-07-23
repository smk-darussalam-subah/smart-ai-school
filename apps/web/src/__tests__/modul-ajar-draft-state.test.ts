import { getDraftWriteTarget, readCreatedRppId } from '@/app/dashboard/akademik/_components/modul-ajar-draft-state';

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

  it('edit existing RPP langsung memakai update dan tidak create baru', () => {
    expect(getDraftWriteTarget(null, 'rpp-existing')).toEqual({ kind: 'update', id: 'rpp-existing' });
  });

  it('response create tanpa id tidak mengubah target ke update palsu', () => {
    expect(readCreatedRppId({ success: true, data: { title: 'tanpa id' } })).toBeNull();
    expect(getDraftWriteTarget(null, null)).toEqual({ kind: 'create' });
  });
});
