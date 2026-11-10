import { useEffect, useId, useRef, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';

/* ---- Button ---- */
type Variant = 'default' | 'primary' | 'danger' | 'ghost';
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  iconOnly?: boolean;
  block?: boolean;
}
export function Button({ variant = 'default', size = 'md', icon, iconOnly, block, className = '', children, type = 'button', ...rest }: ButtonProps) {
  const cls = ['btn', variant !== 'default' ? `btn-${variant}` : '', size !== 'md' ? `btn-${size}` : '', iconOnly ? 'btn-icon' : '', block ? 'btn-block' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={cls} {...rest}>
      {icon && <Icon name={icon} />}
      {!iconOnly && children}
    </button>
  );
}

/* ---- Inputs ---- */
export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  return <input className={`input ${className}`} {...rest} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', ...rest } = props;
  return <select className={`select ${className}`} {...rest} />;
}
export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = '', ...rest } = props;
  return <textarea className={`textarea ${className}`} {...rest} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <label className="toggle" htmlFor={id}>
      <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" />
      {label && <span className="toggle-label">{label}</span>}
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} className={o.value === value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function FormErrors({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="form-errors" role="alert">
      {errors.map((e) => (
        <span key={e}>{e}</span>
      ))}
    </div>
  );
}

/* ---- Setting row ---- */
export function SettingRow({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div className="setting">
      <div className="setting-text">
        <div className="setting-title">{title}</div>
        {desc && <div className="setting-desc">{desc}</div>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

/* ---- Modal ---- */
// Stack of currently-open modals (top of stack = most recently opened), so that when several are
// nested (e.g. a delete confirmation opened from an edit form) Escape only closes the front-most
// one instead of every modal whose listener happens to be attached to the same document.
const openModalStack: symbol[] = [];

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // Keep the latest onClose without re-running the mount effect below on every parent re-render
  // (e.g. a once-a-minute clock tick in a parent page): re-running it would re-focus the header's
  // Close button mid-typing and hand the next Space/Enter to it, discarding whatever was being typed.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const token = Symbol('modal');
    openModalStack.push(token);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (openModalStack[openModalStack.length - 1] !== token) return; // not the front-most modal
      e.stopImmediatePropagation();
      onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    // Focus the first control inside the BODY (a real form field), never the header's Close button.
    const first = ref.current?.querySelector<HTMLElement>('.modal-body input, .modal-body textarea, .modal-body select, .modal-body button');
    first?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = openModalStack.indexOf(token);
      if (i !== -1) openModalStack.splice(i, 1);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-only, see onCloseRef above
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref} style={wide ? { width: 'min(760px, 100%)' } : undefined}>
        <div className="modal-head">
          <h2>{title}</h2>
          <Button variant="ghost" icon="close" iconOnly aria-label="Close" onClick={onClose} />
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger, onConfirm, onCancel, busy }: { title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void; busy?: boolean }) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="stack">{typeof message === 'string' ? <p>{message}</p> : message}</div>
    </Modal>
  );
}

export function EmptyState({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function ModeBadge({ mode }: { mode: string }) {
  return <span className={`mode-badge mode-${mode}`}>{mode}</span>;
}
