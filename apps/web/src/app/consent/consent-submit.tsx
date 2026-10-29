'use client';

import { useActionState } from 'react';
import { recordConsentAction } from './actions';

export function ConsentSubmit() {
  const [state, action, pending] = useActionState(recordConsentAction, { error: null });
  return (
    <form action={action}>
      {state.error && (
        <p role="alert" className="mb-3 text-sm text-red-700">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-60"
      >
        {pending ? 'Menyimpan persetujuan…' : 'Saya Menyetujui Pengolahan Data Pribadi'}
      </button>
    </form>
  );
}
