import { Link, useNavigate } from 'react-router-dom';
import { galleryTemplates } from '../domain/templates';

export function GalleryPage() {
  const navigate = useNavigate();
  const templates = galleryTemplates();
  return (
    <main className="page">
      <p><Link to="/">Back to the studio</Link></p>
      <h1>Starter gallery</h1>
      <p>Original shapes to open and edit. The heart sheet is sixteen separate motifs — Nenocutter will ask whether you want one outline or a cutter set.</p>
      <div className="cards">
        {templates.map((template) => (
          <article className="card" key={template.title}>
            <div>
              <strong>{template.title}</strong>
              <p>{template.blurb}</p>
              <button className="btn primary" type="button" onClick={() => {
                sessionStorage.setItem('nenocutter-open', JSON.stringify(template));
                navigate('/');
              }}>Open in the studio</button>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
