import { useStore } from '@/app/store';
import { toastStore, dismissToast } from '@/app/stores';
import { Icon } from './Icon';

export function Toasts() {
  const toasts = useStore(toastStore);
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span>{t.message}</span>
          <button type="button" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>
            <Icon name="close" width={16} height={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
