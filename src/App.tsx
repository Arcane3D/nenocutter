import { HashRouter, Route, Routes } from 'react-router-dom';
import { Designer } from './components/Designer';
import { AccountPage } from './pages/AccountPage';
import { GalleryPage } from './pages/GalleryPage';
import { LibraryPage } from './pages/LibraryPage';
import { SharePage } from './pages/SharePage';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Designer />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/share/:id" element={<SharePage />} />
        <Route path="/s/:payload" element={<SharePage compressed />} />
        <Route path="/embed" element={<Designer embed />} />
        <Route path="*" element={<Designer />} />
      </Routes>
    </HashRouter>
  );
}
