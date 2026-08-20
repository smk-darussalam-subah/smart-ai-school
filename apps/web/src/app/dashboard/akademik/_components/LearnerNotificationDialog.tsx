'use client';

import { useRef, type ReactNode, type RefObject } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Bell, X } from 'lucide-react';
import { restoreDialogTriggerFocus } from './learner-navigation';

interface Props {
  shell: 'student' | 'parent';
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
}

export default function LearnerNotificationDialog({ shell, title, description, children, onClose, returnFocusRef }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const appClass = shell === 'parent' ? 'ortu-app' : 'siswa-app';
  const accentClass = shell === 'parent' ? 'text-[var(--pri)]' : 'text-emerald-400';

  return (
    <DialogPrimitive.Root open onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={`${appClass} fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0`} />
        <DialogPrimitive.Content
          aria-modal="true"
          className={`${appClass} fixed bottom-0 left-1/2 z-50 flex max-h-[88dvh] w-full max-w-[560px] -translate-x-1/2 flex-col overflow-hidden rounded-t-[20px] border border-[var(--border)] bg-[var(--bg2)] text-[var(--text)] shadow-2xl outline-none data-[state=open]:animate-[slideUp_.3s_ease]`}
          onOpenAutoFocus={(event: Event) => {
            event.preventDefault();
            closeRef.current?.focus();
          }}
          onCloseAutoFocus={(event: Event) => {
            event.preventDefault();
            restoreDialogTriggerFocus(returnFocusRef.current);
          }}
        >
          <header className="flex items-center justify-between gap-4 border-b border-[var(--border)] p-4 pl-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] ${accentClass}`}>
                <Bell className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <DialogPrimitive.Title className="text-lg font-extrabold tracking-normal">
                  {title}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-1 text-xs font-semibold text-[var(--muted)]">
                  {description}
                </DialogPrimitive.Description>
              </div>
            </div>
            <DialogPrimitive.Close
              ref={closeRef}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] transition-colors hover:bg-[var(--surface2)] hover:text-[var(--text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--em)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg2)]"
              aria-label="Tutup pusat notifikasi"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </DialogPrimitive.Close>
          </header>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
