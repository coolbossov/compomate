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

    toast(toastMessage.message, {
      id: toastMessage.id,
      duration: toastMessage.durationMs,
    });
    clearToast();
  }, [clearToast, toastMessage]);

  return null;
}
