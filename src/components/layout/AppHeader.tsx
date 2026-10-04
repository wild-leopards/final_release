import { useCallback, useState } from 'react';
import CitySearchBar from '../search/CitySearchBar';
import AboutOverlay from './AboutOverlay';
import type { CityEntry } from '../../lib/cities';

interface AppHeaderProps {
  onPickCity: (city: CityEntry) => void;
}

/** Thin technical system label strip at the top of the app, with the
 *  city search slot in the middle and the about page toggle at the end. */
export default function AppHeader({ onPickCity }: AppHeaderProps) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const handleAboutToggle = useCallback(() => setAboutOpen((v) => !v), []);
  const handleAboutClose = useCallback(() => setAboutOpen(false), []);

  return (
    <header className="app-header">
      <h1 className="app-header__title">EARTH ENERGY MONITOR</h1>
      <CitySearchBar onPickCity={onPickCity} />
      <span className="app-header__end">
        <span className="app-header__status">SYS.STANDBY // v1.0</span>
        <button
          type="button"
          className="app-header__about"
          onClick={handleAboutToggle}
          aria-expanded={aboutOpen}
        >
          ABOUT
        </button>
      </span>
      <AboutOverlay open={aboutOpen} onClose={handleAboutClose} />
    </header>
  );
}
