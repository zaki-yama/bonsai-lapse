import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import AlbumPage from "./pages/AlbumPage";
import CameraPage from "./pages/CameraPage";
import TimelapsePage from "./pages/TimelapsePage";
import SettingsPage from "./pages/SettingsPage";

export default function App() {
  const location = useLocation();
  const isCamera = location.pathname === "/camera";

  return (
    <div className="app">
      <main className={isCamera ? "main main--full" : "main"}>
        <Routes>
          <Route path="/" element={<AlbumPage />} />
          <Route path="/camera" element={<CameraPage />} />
          <Route path="/timelapse" element={<TimelapsePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
      {!isCamera && (
        <nav className="tabbar">
          <NavLink to="/" end className="tabbar__item">
            <TreeIcon />
            <span>Album</span>
          </NavLink>
          <NavLink to="/timelapse" className="tabbar__item">
            <FilmIcon />
            <span>Timelapse</span>
          </NavLink>
          <NavLink to="/settings" className="tabbar__item">
            <GearIcon />
            <span>Settings</span>
          </NavLink>
        </nav>
      )}
    </div>
  );
}

function TreeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        d="M12 3c-3 0-5.5 2-5.5 4.5 0 .6.1 1.1.4 1.6C5 9.9 3.5 11.4 3.5 13.3c0 2.3 2 4.2 4.6 4.2h2.9v2c0 .8-.6 1.5-1.4 1.6l-1.6.2V23h8v-1.7l-1.6-.2c-.8-.1-1.4-.8-1.4-1.6v-2h3.4c2.5 0 4.6-1.9 4.6-4.2 0-1.9-1.5-3.4-3.4-4.2.3-.5.4-1 .4-1.6C18 5 15 3 12 3Z"
        fill="currentColor"
      />
    </svg>
  );
}

function FilmIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        d="M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm1 2v2h2V6H5Zm12 0v2h2V6h-2ZM5 10v2h2v-2H5Zm12 0v2h2v-2h-2ZM5 14v2h2v-2H5Zm12 0v2h2v-2h-2Zm-7-6.5v9l7-4.5-7-4.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5Zm9 3.5c0-.7-.1-1.3-.2-1.9l2-1.6-2-3.4-2.4 1a9 9 0 0 0-3.3-1.9L14.7 1h-4l-.4 2.7a9 9 0 0 0-3.3 1.9l-2.4-1-2 3.4 2 1.6a9.3 9.3 0 0 0 0 3.8l-2 1.6 2 3.4 2.4-1a9 9 0 0 0 3.3 1.9l.4 2.7h4l.4-2.7a9 9 0 0 0 3.3-1.9l2.4 1 2-3.4-2-1.6c.1-.6.2-1.2.2-1.9Z"
        fill="currentColor"
      />
    </svg>
  );
}
