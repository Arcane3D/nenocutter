import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase, supabaseConfigured } from '../auth/supabase';
import { readProfile, updateProfile } from '../auth/cloud';

export function AccountPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState(localStorage.getItem('nenocutter-name') ?? '');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(async ({ data }) => {
      const user = data.session?.user;
      setUserEmail(user?.email ?? null);
      if (user) {
        const remote = await readProfile(user.id).catch(() => null);
        if (remote) setName(remote);
      }
    });
  }, []);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setNote(error ? error.message : 'Signed in. Your library can sync from here.');
  }

  async function signUp(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
    setNote(error ? error.message : 'Check your email to confirm the account. You can keep designing meanwhile.');
  }

  return (
    <main className="page">
      <p><Link to="/">Back to the studio</Link></p>
      <section className="auth-card panel">
        <h1>Account</h1>
        <p className="free-note">Image editing, the library, profiles, STL and 3MF downloads, and share links are free. An account is only for optional sync between browsers.</p>
        {!supabaseConfigured && (
          <p>This copy is in guest mode because Supabase keys are not set. Everything still works on this device.</p>
        )}
        {userEmail ? (
          <>
            <p>Signed in as {userEmail}.</p>
            <label className="field">Display name
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <button className="btn primary" type="button" onClick={() => {
              localStorage.setItem('nenocutter-name', name);
              void (async () => {
                const session = supabase ? (await supabase.auth.getSession()).data.session : null;
                if (session) await updateProfile(session.user.id, name).catch((error: Error) => setNote(error.message));
                setNote('Profile saved.');
              })();
            }}>Save profile</button>
            <button className="btn" type="button" onClick={() => supabase?.auth.signOut().then(() => setUserEmail(null))}>Sign out</button>
          </>
        ) : (
          <form onSubmit={signIn}>
            <label className="field">Display name
              <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
            </label>
            <label className="field">Email
              <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
            </label>
            <label className="field">Password
              <input type="password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
            </label>
            <div className="row">
              <button className="btn primary" type="submit" disabled={!supabaseConfigured}>Sign in</button>
              <button className="btn" type="button" disabled={!supabaseConfigured} onClick={signUp}>Create account</button>
            </div>
            <button className="btn" type="button" disabled={!supabaseConfigured} onClick={() => supabase?.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + window.location.pathname } })}>
              Continue with Google
            </button>
            <button className="btn ghost" type="button" disabled={!supabaseConfigured} onClick={() => supabase?.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname }).then(({ error }) => setNote(error ? error.message : 'Password reset email sent.'))}>
              Email me a reset link
            </button>
          </form>
        )}
        {note && <p role="status">{note}</p>}
        <p><button className="btn" type="button" onClick={() => { localStorage.setItem('nenocutter-name', name); setNote('Local profile name saved on this device.'); }}>Save name on this device</button></p>
      </section>
    </main>
  );
}
