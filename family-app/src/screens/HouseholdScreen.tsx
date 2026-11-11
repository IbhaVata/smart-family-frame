import { useEffect, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/firebase';
import { useFamily } from '@/FamilyContext';
import { getHouseholdSummary } from '@/lib/api';
import { EmptyState } from '@/components/EmptyState';
import { localDateKey, localMonthKey } from '@/lib/dates';

type Summary = Awaited<ReturnType<typeof getHouseholdSummary>>;

const monthKey = () => localMonthKey();
const todayKey = () => localDateKey();

export function HouseholdScreen() {
  const { activeFrameId } = useFamily();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyService, setBusyService] = useState<string | null>(null);

  const reload = async () => {
    if (!activeFrameId) return;
    setLoading(true);
    setError(null);
    try {
      setSummary(await getHouseholdSummary({ frameId: activeFrameId, month: monthKey() }));
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^\w+\/[\w-]+:\s*/, '') : 'Could not load household data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFrameId]);

  const quickAction = async (serviceId: string, field: 'attendance' | 'delivery', value: string) => {
    if (!db || !activeFrameId) return;
    setBusyService(serviceId);
    try {
      const entryId = `${serviceId}:${todayKey()}`;
      await setDoc(doc(db, 'frames', activeFrameId, 'householdEntries', entryId), { id: entryId, serviceId, date: todayKey(), [field]: value, note: '', updatedAt: Date.now() }, { merge: true });
      await reload();
    } finally {
      setBusyService(null);
    }
  };

  if (!activeFrameId) return <EmptyState title="No Frame connected" />;
  if (loading) return <p className="muted">Loading…</p>;
  if (error) return <p className="error-text">{error}</p>;
  if (!summary || summary.services.length === 0) return <EmptyState title="No household services set up" text="Add maid, milk or other services from the Frame or the Family app's Frame settings." />;

  return (
    <div>
      {summary.services.map((s) => (
        <div className="card" key={s.serviceId}>
          <h2>{s.serviceName}</h2>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
            {s.type === 'MAID' || s.type === 'COOK' || s.type === 'DRIVER' ? (
              <>
                <span className="chip ok">{s.present} present</span>
                <span className="chip warn">{s.leave} leave</span>
              </>
            ) : (
              <>
                <span className="chip ok">{s.delivered} delivered</span>
                <span className="chip warn">{s.skipped} skipped</span>
              </>
            )}
          </div>
          {typeof s.amount === 'number' && (
            <p>This month: <strong>₹{s.amount}</strong>{s.payment && s.payment.remaining > 0 && <span className="chip warn" style={{ marginLeft: 8 }}>₹{s.payment.remaining} due</span>}</p>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {(s.type === 'MAID' || s.type === 'COOK' || s.type === 'DRIVER') && (
              <>
                <button className="btn btn-sm" disabled={busyService === s.serviceId} onClick={() => void quickAction(s.serviceId, 'attendance', 'PRESENT')}>Present today</button>
                <button className="btn btn-sm" disabled={busyService === s.serviceId} onClick={() => void quickAction(s.serviceId, 'attendance', 'LEAVE')}>Leave today</button>
              </>
            )}
            {(s.type === 'MILK' || s.type === 'NEWSPAPER' || s.type === 'WATER_CAN') && (
              <>
                <button className="btn btn-sm" disabled={busyService === s.serviceId} onClick={() => void quickAction(s.serviceId, 'delivery', 'DELIVERED')}>Delivered</button>
                <button className="btn btn-sm" disabled={busyService === s.serviceId} onClick={() => void quickAction(s.serviceId, 'delivery', 'NOT_DELIVERED')}>Skipped</button>
              </>
            )}
          </div>
        </div>
      ))}
      {!summary.isOwner && <p className="muted small">Full payment details are visible to the family owner only.</p>}
    </div>
  );
}
