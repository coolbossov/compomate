'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { useStore } from '@/lib/store';
import { useToastMessage } from '@/lib/store/selectors';

export function ToastBridge() {
  const toastMessage = useToastMessage();
  const clearToast = useStore((s) => s.clearToast);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const toastOptions = { id: toastMessage.id, duration: toastMessage.durationMs };
    if (toastMessage.type === 'error') {
      toast.error(toastMessage.message, toastOptions);
    } else if (toastMessage.type === 'success') {
      toast.success(toastMessage.message, toastOptions);
    } else {
      toast(toastMessage.message, toastOptions);
    }
    clearToast();
  }, [clearToast, toastMessage]);

  return null;
}
