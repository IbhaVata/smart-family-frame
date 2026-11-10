import { useMemo, useState } from 'react';
import type { Reminder, RepeatRule } from '@/types';
import { REPEAT_RULES } from '@/types';
import { useStore } from '@/app/store';
import { remindersStore, settingsStore, toast, activeRemindersStore } from '@/app/stores';
import { minuteStore } from '@/services/ticker';
import { saveReminder, deleteReminder, setReminderEnabled } from '@/services/dataService';
import { Button, Modal, Field, TextInput, TextArea, Toggle, Select, FormErrors, EmptyState, ConfirmDialog } from '@/components/ui';
import { validateReminder, nextOccurrence, describeRepeat } from './reminderLogic';
import { toDateKey, formatClockTime, relativeDayLabel, pad2 } from '@/utils/time';

interface Draft {
  id?: string;
  title: string;
  message: string;
  date: string;
  time: string;
  repeat: RepeatRule;
  enabled: boolean;
}

function ReminderModal({ draft, onClose, onDelete }: { draft: Draft; onClose: () => void; onDelete?: () => void }) {
  const [d, setD] = useState(draft);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const errs = validateReminder(d);
    setErrors(errs);
    if (errs.length) return;
    setBusy(true);
    try {
      await saveReminder(d);
      toast(d.id ? 'Reminder updated.' : 'Reminder added.', 'success');
      onClose();
    } catch {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={d.id ? 'Edit reminder' : 'New reminder'}
      onClose={onClose}
      footer={
        <>
          {onDelete && <Button variant="ghost" icon="trash" className="left" onClick={onDelete}>Delete</Button>}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </>
      }
    >
      <form className="form-stack" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <FormErrors errors={errors} />
        <Field label="Title">
          <TextInput value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="Call Mom" maxLength={80} />
        </Field>
        <Field label="Message (optional)">
          <TextArea value={d.message} onChange={(e) => setD({ ...d, message: e.target.value })} maxLength={300} style={{ minHeight: 80 }} />
        </Field>
        <div className="input-row">
          <Field label="Date" hint={d.repeat === 'NONE' ? 'The day it fires.' : 'First day it fires.'}>
            <TextInput type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} />
          </Field>
          <Field label="Time">
            <TextInput type="time" value={d.time} onChange={(e) => setD({ ...d, time: e.target.value })} />
          </Field>
        </div>
        <Field label="Repeat">
          <Select value={d.repeat} onChange={(e) => setD({ ...d, repeat: e.target.value as RepeatRule })}>
            {REPEAT_RULES.map((r) => <option key={r} value={r}>{describeRepeat(r)}</option>)}
          </Select>
        </Field>
        <Toggle checked={d.enabled} onChange={(v) => setD({ ...d, enabled: v })} label="Enabled" />
      </form>
    </Modal>
  );
}

export function RemindersPage() {
  const reminders = useStore(remindersStore);
  const clockFormat = useStore(settingsStore).clockFormat;
  const now = useStore(minuteStore);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Reminder | null>(null);

  const rows = useMemo(() => {
    return reminders
      .map((r) => ({ r, next: nextOccurrence(r, now) }))
      .sort((a, b) => {
        if (a.r.enabled !== b.r.enabled) return a.r.enabled ? -1 : 1;
        const ta = a.next?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const tb = b.next?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return ta - tb;
      });
  }, [reminders, now]);

  const newDraft = (): Draft => ({ title: '', message: '', date: toDateKey(now), time: `${pad2((now.getHours() + 1) % 24)}:00`, repeat: 'NONE', enabled: true });
  const edit = (r: Reminder) => setDraft({ id: r.id, title: r.title, message: r.message, date: r.date, time: r.time, repeat: r.repeat, enabled: r.enabled });
  const preview = (r: Reminder) => activeRemindersStore.set((list) => [...list, { reminder: r, occurrenceAt: -Date.now(), shownAt: Date.now() }]);
  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    setDraft(null);
    await deleteReminder(id);
    toast('Reminder deleted.', 'info');
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Reminders</h1>
          <p className="sub">When a reminder is due, the frame shows a large alert until you dismiss it.</p>
        </div>
        <div className="page-actions">
          <Button variant="primary" icon="plus" onClick={() => setDraft(newDraft())}>Add reminder</Button>
        </div>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon="bell" title="No reminders yet">
          <p>"Call Mom at 7 PM", "Take vitamins every morning", "Water the plants weekly".</p>
          <Button variant="primary" icon="plus" onClick={() => setDraft(newDraft())}>Add a reminder</Button>
        </EmptyState>
      ) : (
        <div className="list">
          {rows.map(({ r, next }) => (
            <div key={r.id} className={`list-item ${r.enabled ? '' : 'is-off'}`}>
              <Toggle checked={r.enabled} onChange={(v) => void setReminderEnabled(r.id, v)} />
              <div className="li-time">{formatClockTime(r.time, clockFormat)}</div>
              <div className="li-main">
                <div className="li-title">{r.title}</div>
                <div className="li-sub">
                  <span className="chip">{describeRepeat(r.repeat)}</span>
                  {r.enabled && next && <span>Next: {relativeDayLabel(next, now)} at {formatClockTime(r.time, clockFormat)}</span>}
                  {r.enabled && !next && r.repeat === 'NONE' && <span className="chip ok">Done</span>}
                  {r.message && <span className="faint">{r.message}</span>}
                </div>
              </div>
              <div className="li-actions">
                <Button icon="eye" iconOnly size="sm" aria-label="Preview" title="Preview the alert" onClick={() => preview(r)} />
                <Button icon="edit" iconOnly size="sm" aria-label="Edit" onClick={() => edit(r)} />
                <Button icon="trash" iconOnly size="sm" aria-label="Delete" onClick={() => setPendingDelete(r)} />
              </div>
            </div>
          ))}
        </div>
      )}
      {draft && <ReminderModal draft={draft} onClose={() => setDraft(null)} onDelete={draft.id ? () => setPendingDelete(reminders.find((r) => r.id === draft.id) ?? null) : undefined} />}
      {pendingDelete && <ConfirmDialog title="Delete reminder?" message={`"${pendingDelete.title}" will be removed.`} confirmLabel="Delete" danger onConfirm={() => void confirmDelete()} onCancel={() => setPendingDelete(null)} />}
    </div>
  );
}
