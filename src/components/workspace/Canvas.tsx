'use client';
import dynamic from 'next/dynamic';
import { useRef, useEffect, useState } from 'react';
import { useActiveSubject, useActiveBackdrop } from '@/lib/store/selectors';
import { EmptyState } from './EmptyState';

const KonvaCanvas = dynamic(() => import('./KonvaCanvas'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-[#0D0D12]" />,
});

export default function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 1000 });
  const subject = useActiveSubject();
  const backdrop = useActiveBackdrop();

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-hidden rounded-lg border border-[color:var(--panel-border)] bg-[radial-gradient(circle_at_top,_#2a2a39_0%,_#12121a_58%,_#0d0d12_100%)] w-full h-full"
    >
      {!backdrop ? (
        <EmptyState type="no-backdrop" />
      ) : !subject ? (
        <EmptyState type="no-subject" />
      ) : (
        <KonvaCanvas containerWidth={size.width} containerHeight={size.height} />
      )}
    </div>
  );
}
