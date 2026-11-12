import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { LibraryRecord } from '../domain/types';
import { listLibrary, upsertLibrary } from '../store/library';

export function LibraryPage() {
  const [records, setRecords] = useState<LibraryRecord[]>([]);
  const [query, setQuery] = useState('');
  const [trash, setTrash] = useState(false);
  const [favorites, setFavorites] = useState(false);
  const navigate = useNavigate();

  async function refresh() {
    setRecords(await listLibrary());
  }
  useEffect(() => {
    void refresh();
  }, []);

  const shown = records.filter((record) => {
    const trashed = Boolean(record.trashedAt);
    if (trash !== trashed) return false;
    if (favorites && !record.favorite) return false;
    const haystack = `${record.title} ${record.tags.join(' ')}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  async function mutate(record: LibraryRecord, patch: Partial<LibraryRecord>) {
    await upsertLibrary({ ...record, ...patch, updatedAt: new Date().toISOString() });
    await refresh();
  }

  return (
    <main className="page">
      <p><Link to="/">Back to the studio</Link></p>
      <h1>Your library</h1>
      <p className="free-note">Designs live on this device even without an account. Sign in only if you want them to follow you to another browser.</p>
      <div className="filters">
        <input className="search" aria-label="Search designs" placeholder="Search titles and tags" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button className="btn chip" type="button" aria-pressed={favorites} onClick={() => setFavorites((value) => !value)}>Favorites</button>
        <button className="btn chip" type="button" aria-pressed={trash} onClick={() => setTrash((value) => !value)}>{trash ? 'Showing trash' : 'Trash'}</button>
      </div>
      <div className="cards">
        {shown.map((record) => (
          <article className="card" key={record.id}>
            {record.thumbnail ? <img src={record.thumbnail} alt="" /> : <div className="thumb" />}
            <div>
              <strong>{record.title}</strong>
              <small>{record.tags.join(', ') || 'No tags'}</small>
              <div className="row">
                <button className="btn" type="button" onClick={() => {
                  sessionStorage.setItem('nenocutter-open', JSON.stringify(record.document));
                  navigate('/');
                }}>Open</button>
                <button className="btn" type="button" onClick={() => void mutate(record, { favorite: !record.favorite })}>{record.favorite ? 'Unfavorite' : 'Favorite'}</button>
              </div>
              <div className="row">
                <button className="btn" type="button" onClick={() => {
                  const title = window.prompt('Rename', record.title);
                  if (title) void mutate(record, { title, document: { ...record.document, title } });
                }}>Rename</button>
                <button className="btn" type="button" onClick={() => {
                  const copy: LibraryRecord = {
                    ...record,
                    id: `${record.id}-copy-${Date.now()}`,
                    title: `${record.title} copy`,
                    trashedAt: null,
                    remoteId: null,
                    document: { ...record.document, id: `${record.id}-copy`, title: `${record.title} copy` },
                  };
                  void upsertLibrary(copy).then(refresh);
                }}>Duplicate</button>
                {trash ? (
                  <button className="btn" type="button" onClick={() => void mutate(record, { trashedAt: null })}>Restore</button>
                ) : (
                  <button className="btn" type="button" onClick={() => void mutate(record, { trashedAt: new Date().toISOString() })}>Delete</button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      {!shown.length && <p>Nothing in this view yet. Save a design from the studio and it will land here.</p>}
    </main>
  );
}
