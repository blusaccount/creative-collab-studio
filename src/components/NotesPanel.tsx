import { useState } from 'react';
import type { Ticket } from '../types';
import { Icon } from './Icon';

interface NotesPanelProps {
  ticket: Ticket;
  onAddNote: (body: string) => void;
}

export function NotesPanel({ ticket, onAddNote }: NotesPanelProps) {
  const [draft, setDraft] = useState('');

  const submit = () => {
    if (!draft.trim()) return;
    onAddNote(draft);
    setDraft('');
  };

  return (
    <section className="side-section notes-section">
      <div className="side-section-head">
        <h3>
          <Icon name="note" size={14} /> Notes &amp; review
        </h3>
        <span className="count">{ticket.notes.length}</span>
      </div>

      <div className="note-list">
        {ticket.notes.length === 0 ? (
          <p className="empty-state">No notes yet. Add feedback or iteration notes here.</p>
        ) : null}
        {[...ticket.notes]
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((note) => (
            <div key={note.id} className="note-item">
              <div className="note-head">
                <strong>{note.author}</strong>
                <span>{new Date(note.createdAt).toLocaleString()}</span>
              </div>
              <p>{note.body}</p>
            </div>
          ))}
      </div>

      <div className="note-compose">
        <textarea
          rows={2}
          value={draft}
          placeholder="Add a note…"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <button className="ghost-button small" onClick={submit} disabled={!draft.trim()}>
          Add note
        </button>
      </div>
    </section>
  );
}
