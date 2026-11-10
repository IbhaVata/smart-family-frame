// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { useState } from 'react';
import { Modal, ConfirmDialog, TextInput } from '@/components/ui';

afterEach(() => cleanup());

function EditModal({ onClose, onDelete }: { onClose: () => void; onDelete?: () => void }) {
  const [text, setText] = useState('');
  return (
    <Modal title="Edit thing" onClose={onClose} footer={onDelete ? <button onClick={onDelete}>Delete</button> : undefined}>
      <TextInput data-testid="field" value={text} onChange={(e) => setText(e.target.value)} />
    </Modal>
  );
}

describe('Modal focus and Escape behaviour', () => {
  it('focuses a real form field in the body, not the header Close button', () => {
    render(<EditModal onClose={() => undefined} />);
    expect(document.activeElement).toBe(screen.getByTestId('field'));
  });

  it('re-rendering the parent (e.g. a clock tick) does not steal focus away from the field mid-typing', () => {
    let forceRerender: () => void = () => undefined;
    function Wrapper() {
      const [, setTick] = useState(0);
      forceRerender = () => act(() => setTick((t) => t + 1));
      // A fresh inline arrow every render, exactly like every real caller (CalendarPage, NotesPage, ...).
      return <EditModal onClose={() => undefined} />;
    }
    render(<Wrapper />);
    const field = screen.getByTestId('field') as HTMLInputElement;
    field.focus();
    fireEvent.change(field, { target: { value: 'hello' } });
    expect(document.activeElement).toBe(field);
    // Simulate several parent re-renders (e.g. the once-a-minute clock tick elsewhere in the tree).
    forceRerender();
    forceRerender();
    forceRerender();
    expect(document.activeElement).toBe(field);
    expect(field.value).toBe('hello');
    // Space in the field must type a space, not activate whatever the (previously stolen) focus was.
    fireEvent.keyDown(field, { key: ' ', code: 'Space' });
    expect(document.activeElement).toBe(field);
  });

  it('Escape closes only the front-most (confirm) modal, leaving the edit modal and its unsaved text', () => {
    const closeEdit = vi.fn();
    const closeConfirm = vi.fn();
    function Two() {
      return (
        <>
          <EditModal onClose={closeEdit} onDelete={() => undefined} />
          <ConfirmDialog title="Delete?" message="sure?" onConfirm={() => undefined} onCancel={closeConfirm} />
        </>
      );
    }
    render(<Two />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closeConfirm).toHaveBeenCalledTimes(1);
    expect(closeEdit).not.toHaveBeenCalled();
  });

  it('with only one modal open, Escape closes it normally', () => {
    const onClose = vi.fn();
    render(<EditModal onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closing the front modal restores the next one as front-most for a subsequent Escape', () => {
    const closeEdit = vi.fn();
    const closeConfirm = vi.fn();
    function Two({ showConfirm }: { showConfirm: boolean }) {
      return (
        <>
          <EditModal onClose={closeEdit} />
          {showConfirm && <ConfirmDialog title="Delete?" message="sure?" onConfirm={() => undefined} onCancel={closeConfirm} />}
        </>
      );
    }
    const { rerender } = render(<Two showConfirm={true} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closeConfirm).toHaveBeenCalledTimes(1);
    expect(closeEdit).not.toHaveBeenCalled();
    // Confirm dialog unmounts (parent removed it); the edit modal is now front-most.
    rerender(<Two showConfirm={false} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closeEdit).toHaveBeenCalledTimes(1);
  });
});
