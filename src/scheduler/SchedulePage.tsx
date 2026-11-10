import { useMemo, useState } from 'react';
import type { Schedule, FrameModeKind } from '@/types';
import { FRAME_MODES } from '@/types';
import { useStore } from '@/app/store';
import { schedulesStore, settingsStore, toast } from '@/app/stores';
import { minuteStore } from '@/services/ticker';
import { saveSchedule, deleteSchedule, setScheduleEnabled, saveSchedules } from '@/services/dataService';
import { demoSchedules } from '@/services/demoData';
import { Button, Modal, Field, TextInput, Toggle, Select, FormErrors, EmptyState, ConfirmDialog, ModeBadge } from '@/components/ui';
import { validateSchedule, computeDayTimeline, isScheduleActiveAt, crossesMidnight, resolveActiveSchedule } from './scheduler';
import { formatClockTime, WEEKDAY_SHORT, parseHHMM, minutesOfDay, formatHHMM } from '@/utils/time';

interface Draft {
  id?: string;
  name: string;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  mode: FrameModeKind;
  enabled: boolean;
  priority: number;
}

const ALL = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];

function ScheduleModal({ draft, onClose, onDelete }: { draft: Draft; onClose: () => void; onDelete?: () => void }) {
  const [d, setD] = useState(draft);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const toggleDay = (day: number) => setD({ ...d, daysOfWeek: d.daysOfWeek.includes(day) ? d.daysOfWeek.filter((x) => x !== day) : [...d.daysOfWeek, day] });
  const overnight = crossesMidnight(d);
  const allDay = parseHHMM(d.startTime) !== null && parseHHMM(d.startTime) === parseHHMM(d.endTime);
  const submit = async () => {
    const errs = validateSchedule(d);
    setErrors(errs);
    if (errs.length) return;
    setBusy(true);
    try {
      await saveSchedule(d);
      toast(d.id ? 'Schedule updated.' : 'Schedule added.', 'success');
      onClose();
    } catch {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={d.id ? 'Edit schedule' : 'New schedule'}
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
        <div className="input-row">
          <Field label="Name">
            <TextInput value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="Daytime photos" maxLength={60} />
          </Field>
          <Field label="Frame mode">
            <Select value={d.mode} onChange={(e) => setD({ ...d, mode: e.target.value as FrameModeKind })}>
              {FRAME_MODES.map((m) => <option key={m} value={m}>{m.charAt(0) + m.slice(1).toLowerCase()}</option>)}
            </Select>
          </Field>
        </div>
        <div className="input-row">
          <Field label="Start time">
            <TextInput type="time" value={d.startTime} onChange={(e) => setD({ ...d, startTime: e.target.value })} />
          </Field>
          <Field label="End time">
            <TextInput type="time" value={d.endTime} onChange={(e) => setD({ ...d, endTime: e.target.value })} />
          </Field>
        </div>
        {overnight && <div className="form-info">This schedule runs overnight: it starts on the selected day and continues into the next morning until {d.endTime}.</div>}
        {allDay && <div className="form-info">Start and end are the same, so this schedule runs all day on the selected days.</div>}
        <Field label="Days">
          <div className="day-chips">
            {WEEKDAY_SHORT.map((label, i) => (
              <button type="button" key={label} className={`day-chip ${d.daysOfWeek.includes(i) ? 'on' : ''}`} onClick={() => toggleDay(i)} aria-pressed={d.daysOfWeek.includes(i)}>{label}</button>
            ))}
          </div>
          <div className="row" style={{ marginTop: 4 }}>
            <Button size="sm" variant="ghost" onClick={() => setD({ ...d, daysOfWeek: ALL })}>Every day</Button>
            <Button size="sm" variant="ghost" onClick={() => setD({ ...d, daysOfWeek: WEEKDAYS })}>Weekdays</Button>
            <Button size="sm" variant="ghost" onClick={() => setD({ ...d, daysOfWeek: WEEKEND })}>Weekend</Button>
          </div>
        </Field>
        <div className="input-row">
          <Field label="Priority" hint="When two schedules overlap, the higher number wins.">
            <TextInput type="number" value={d.priority} min={0} max={100} onChange={(e) => setD({ ...d, priority: Number(e.target.value) })} />
          </Field>
          <Field label="Enabled">
            <div style={{ height: 46, display: 'flex', alignItems: 'center' }}>
              <Toggle checked={d.enabled} onChange={(v) => setD({ ...d, enabled: v })} label={d.enabled ? 'On' : 'Off'} />
            </div>
          </Field>
        </div>
      </form>
    </Modal>
  );
}

function daysLabel(days: number[]): string {
  const s = days.slice().sort((a, b) => a - b);
  if (s.length === 7) return 'Every day';
  if (s.join() === WEEKDAYS.join()) return 'Weekdays';
  if (s.join() === WEEKEND.join()) return 'Weekend';
  return s.map((d) => WEEKDAY_SHORT[d]).join(', ');
}

export function SchedulePage() {
  const schedules = useStore(schedulesStore);
  const settings = useStore(settingsStore);
  const now = useStore(minuteStore);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Schedule | null>(null);
  const [confirmExamples, setConfirmExamples] = useState(false);

  const sorted = useMemo(() => schedules.slice().sort((a, b) => (parseHHMM(a.startTime) ?? 0) - (parseHHMM(b.startTime) ?? 0) || b.priority - a.priority), [schedules]);
  const timeline = useMemo(() => computeDayTimeline(schedules, now, settings.defaultMode), [schedules, now, settings.defaultMode]);
  const active = useMemo(() => resolveActiveSchedule(schedules, now), [schedules, now]);
  const nowPct = (minutesOfDay(now) / 1440) * 100;

  const edit = (s: Schedule) => setDraft({ ...s });
  const newDraft = (): Draft => ({ name: '', startTime: '08:00', endTime: '18:00', daysOfWeek: ALL, mode: 'PHOTOS', enabled: true, priority: 1 });
  const loadExamples = async () => {
    setConfirmExamples(false);
    await saveSchedules(demoSchedules());
    toast('Example schedules added.', 'success');
  };
  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    setDraft(null);
    await deleteSchedule(id);
    toast('Schedule deleted.', 'info');
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Schedule</h1>
          <p className="sub">Decide what the frame shows at each time of day. Reminders always win; then the highest-priority schedule; then the default mode.</p>
        </div>
        <div className="page-actions">
          <Button icon="schedule" onClick={() => setConfirmExamples(true)}>Load example schedules</Button>
          <Button variant="primary" icon="plus" onClick={() => setDraft(newDraft())}>Add schedule</Button>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Today</h2>
          <span className="muted small">Now: {formatClockTime(formatHHMM(minutesOfDay(now)), settings.clockFormat)} → <strong>{active ? `${active.name} (${active.mode})` : `Default (${settings.defaultMode})`}</strong></span>
        </div>
        <div className="timeline-now">
          <div className="timeline" aria-label="Today's timeline">
            {timeline.map((seg) => (
              <div key={seg.startMin} className={`timeline-seg mode-${seg.mode} ${seg.schedule ? '' : 'is-default'}`} style={{ flex: `${seg.endMin - seg.startMin} 0 0` }} title={`${formatHHMM(seg.startMin)}–${formatHHMM(seg.endMin % 1440)} ${seg.schedule ? seg.schedule.name : 'Default'} (${seg.mode})`}>
                {seg.endMin - seg.startMin >= 75 ? seg.mode : ''}
              </div>
            ))}
          </div>
          <div className="marker" style={{ left: `${nowPct}%` }} />
        </div>
        <div className="timeline-hours">
          {['00', '03', '06', '09', '12', '15', '18', '21', '24'].map((h) => <span key={h}>{h}:00</span>)}
        </div>
        <div className="row" style={{ marginTop: 10, gap: 8 }}>
          {FRAME_MODES.map((m) => <span key={m} className="chip"><span className={`mode-dot mode-${m}`} /> {m.charAt(0) + m.slice(1).toLowerCase()}</span>)}
        </div>
      </div>

      {sorted.length === 0 ? (
        <EmptyState icon="schedule" title="No schedules yet">
          <p>Without schedules the frame always shows the default mode ({settings.defaultMode}). Add one, or load the examples to see how it works.</p>
          <div className="row">
            <Button onClick={() => setConfirmExamples(true)}>Load example schedules</Button>
            <Button variant="primary" icon="plus" onClick={() => setDraft(newDraft())}>Add schedule</Button>
          </div>
        </EmptyState>
      ) : (
        <div className="list">
          {sorted.map((s) => {
            const isActive = isScheduleActiveAt(s, now);
            const invalid = validateSchedule(s).length > 0;
            return (
              <div key={s.id} className={`list-item ${s.enabled ? '' : 'is-off'}`}>
                <Toggle checked={s.enabled} onChange={(v) => void setScheduleEnabled(s.id, v)} />
                <div className="li-time" style={{ minWidth: 150 }}>
                  {formatClockTime(s.startTime, settings.clockFormat)} – {formatClockTime(s.endTime, settings.clockFormat)}
                  {crossesMidnight(s) && <div className="small faint" style={{ fontWeight: 500 }}>overnight</div>}
                </div>
                <div className="li-main">
                  <div className="li-title">{s.name || 'Untitled schedule'}</div>
                  <div className="li-sub">
                    <ModeBadge mode={s.mode} />
                    <span>{daysLabel(s.daysOfWeek)}</span>
                    <span className="chip">Priority {s.priority}</span>
                    {isActive && active?.id === s.id && <span className="chip ok">Active now</span>}
                    {isActive && active?.id !== s.id && <span className="chip warn">Overridden by "{active?.name}"</span>}
                    {invalid && <span className="chip danger">Invalid</span>}
                  </div>
                </div>
                <div className="li-actions">
                  <Button icon="edit" iconOnly size="sm" aria-label="Edit" onClick={() => edit(s)} />
                  <Button icon="trash" iconOnly size="sm" aria-label="Delete" onClick={() => setPendingDelete(s)} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {draft && <ScheduleModal draft={draft} onClose={() => setDraft(null)} onDelete={draft.id ? () => setPendingDelete(schedules.find((s) => s.id === draft.id) ?? null) : undefined} />}
      {pendingDelete && <ConfirmDialog title="Delete schedule?" message={`"${pendingDelete.name}" will be removed.`} confirmLabel="Delete" danger onConfirm={() => void confirmDelete()} onCancel={() => setPendingDelete(null)} />}
      {confirmExamples && (
        <ConfirmDialog
          title="Load example schedules?"
          message={<><p>Seven example schedules will be added (morning clock, calendar, daytime photos, evening notes, night clock, and an overnight Night mode 23:00 → 06:30).</p><p className="muted">Existing schedules are kept.</p></>}
          confirmLabel="Add examples"
          onConfirm={() => void loadExamples()}
          onCancel={() => setConfirmExamples(false)}
        />
      )}
    </div>
  );
}
