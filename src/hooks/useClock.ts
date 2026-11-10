import { useEffect, useState } from 'react';
import { msUntilNextBoundary } from '@/utils/time';

/**
 * Returns the current time, updating on every second or minute boundary (aligned, single timeout,
 * no drift). Only the component that calls this hook re-renders.
 */
export function useClock(withSeconds: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const unit = withSeconds ? 1000 : 60_000;
    let timer = 0;
    const arm = () => {
      timer = setTimeout(() => {
        setNow(new Date());
        arm();
      }, msUntilNextBoundary(Date.now(), unit) + 5);
    };
    setNow(new Date());
    arm();
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setNow(new Date());
        clearTimeout(timer);
        arm();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [withSeconds]);
  return now;
}
