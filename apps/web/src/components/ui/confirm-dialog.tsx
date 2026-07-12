'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void | Promise<void>;
}

const VARIANT_STYLES: Record<NonNullable<ConfirmDialogProps['variant']>, { icon: string; btn: string }> = {
  danger: {
    icon: 'bg-rose-100 text-rose-600',
    btn: 'bg-rose-600 text-white hover:bg-rose-700',
  },
  warning: {
    icon: 'bg-amber-100 text-amber-600',
    btn: 'bg-amber-600 text-white hover:bg-amber-700',
  },
  info: {
    icon: 'bg-blue-100 text-blue-600',
    btn: 'bg-blue-600 text-white hover:bg-blue-700',
  },
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Konfirmasi',
  cancelLabel = 'Batal',
  variant = 'warning',
  onConfirm,
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const styles = VARIANT_STYLES[variant];

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => { if (!loading) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className={`mb-2 grid h-11 w-11 place-items-center rounded-full ${styles.icon}`}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 mt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading}
            className={styles.btn}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
