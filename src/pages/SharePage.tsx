import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fetchShare } from '../auth/cloud';
import type { Design } from '../domain/types';
import { decodeShare } from '../lib/shareCodec';
import { saveDesign, thumbnailOf } from '../store/library';

export function SharePage({ compressed = false }: { compressed?: boolean }) {
  const params = useParams();
  const navigate = useNavigate();
  const [design, setDesign] = useState<Design | null>(null);
  const [mode, setMode] = useState<'view' | 'copy'>('copy');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const payload = params.payload;
    const id = params.id;
    if (compressed && payload) {
      try {
        setDesign(decodeShare(decodeURIComponent(payload)));
        setMode('copy');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'This link could not be read.');
      }
      return;
    }
    if (!id) return;
    fetchShare(id).then((share) => {
      if (!share) {
        setError('That share link was not found. The compressed kind of link still works without an account.');
        return;
      }
      setMode(share.mode);
      setDesign(share.document);
    });
  }, [compressed, params.id, params.payload]);

  if (error) {
    return <main className="page"><p>{error}</p><Link to="/">Back to Nenocutter</Link></main>;
  }
  if (!design) return <main className="page"><p>Opening the shared design…</p></main>;

  return (
    <main className="page">
      <h1>{design.title}</h1>
      <p className="free-note">
        {mode === 'view'
          ? 'This is a read-only share. Copy it into your library if you want to edit. Downloads stay free.'
          : 'This link includes the design itself. Copy it into your library — no account needed.'}
      </p>
      <p>{design.paths.length} paths · {design.settings.tool}</p>
      <div className="row">
        <button className="btn primary" type="button" onClick={() => {
          sessionStorage.setItem('nenocutter-open', JSON.stringify({ ...design, id: `shared-${Date.now()}` }));
          navigate('/');
        }}>Open a copy</button>
        <button className="btn" type="button" onClick={() => void saveDesign({ ...design, id: `lib-${Date.now()}`, title: design.title }, thumbnailOf(design.paths)).then(() => navigate('/library'))}>
          Copy to my library
        </button>
      </div>
    </main>
  );
}
