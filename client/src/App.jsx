import { NavLink, Route, Routes } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Leaderboards from "./pages/Leaderboards.jsx";
import Upload from "./pages/Upload.jsx";
import Matches from "./pages/Matches.jsx";
import Duels from "./pages/Duels.jsx";
import Settings from "./pages/Settings.jsx";

export default function App() {
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">Sandun Brawlding</span>
          <nav>
            <NavLink to="/" end>Home</NavLink>
            <NavLink to="/leaderboards">Leaderboards</NavLink>
            <NavLink to="/matches">Matches</NavLink>
            <NavLink to="/1v1">1v1</NavLink>
            <NavLink to="/add">Add match</NavLink>
            <NavLink to="/settings">Settings</NavLink>
          </nav>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/leaderboards" element={<Leaderboards />} />
          <Route path="/matches" element={<Matches />} />
          <Route path="/1v1" element={<Duels />} />
          <Route path="/add" element={<Upload />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </>
  );
}
