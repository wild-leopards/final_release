import { useMemo, useState, type KeyboardEvent } from 'react';
import { CITIES, type CityEntry } from '../../lib/cities';

const MAX_RESULTS = 12;

interface CitySearchBarProps {
  /** Called with the picked city; the globe flies the camera there. */
  onPickCity: (city: CityEntry) => void;
}

/** Header search field over the city dataset with a keyboard-navigable
 *  result dropdown. Picking a result flies the globe camera to the city. */
export default function CitySearchBar({ onPickCity }: CitySearchBarProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  // Name-prefix matches rank above substring matches (e.g. "var" ->
  // Varna before Vratsa-area hits).
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const starts: CityEntry[] = [];
    const includes: CityEntry[] = [];
    for (const city of CITIES) {
      const name = city.name.toLowerCase();
      if (name.startsWith(q)) starts.push(city);
      else if (name.includes(q)) includes.push(city);
    }
    return [...starts, ...includes].slice(0, MAX_RESULTS);
  }, [query]);

  const pick = (city: CityEntry) => {
    onPickCity(city);
    setQuery('');
    setOpen(false);
    setHighlighted(0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (results.length === 0) return;
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setHighlighted(
        (current) => (current + delta + results.length) % results.length,
      );
      setOpen(true);
    } else if (event.key === 'Enter') {
      if (open && results[highlighted]) pick(results[highlighted]);
    } else if (event.key === 'Escape') {
      setOpen(false);
      // This ESC means "dismiss the dropdown" — don't let it also reach
      // the window listeners, where it would cancel an active placement
      // / relocation or close the LAYERS menu.
      event.stopPropagation();
    }
  };

  return (
    <div className="city-search">
      <input
        className="city-search__input"
        type="text"
        role="combobox"
        aria-expanded={open && results.length > 0}
        placeholder="SEARCH CITY // FLY TO SITE"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setHighlighted(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        onBlur={() => setOpen(false)}
        spellCheck={false}
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <ul className="city-search__results" role="listbox">
          {results.map((city, index) => (
            <li key={`${city.name}-${city.lat}-${city.lon}`}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlighted}
                className={`city-search__option${
                  index === highlighted ? ' city-search__option--active' : ''
                }`}
                // mousedown (not click) so the input blur can't eat it
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(city);
                }}
                onMouseEnter={() => setHighlighted(index)}
              >
                <span className="city-search__name">{city.name}</span>
                <span className="city-search__meta">
                  {city.region} · {city.country}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
