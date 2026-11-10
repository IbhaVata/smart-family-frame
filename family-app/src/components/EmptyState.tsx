export function EmptyState({ title, text }: { title: string; text?: string }) {
  return (
    <div className="empty-state">
      <p style={{ fontWeight: 600, marginBottom: 4 }}>{title}</p>
      {text && <p className="muted">{text}</p>}
    </div>
  );
}
