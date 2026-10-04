import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface AboutOverlayProps {
  open: boolean;
  onClose: () => void;
}

/** The people behind the console, shown in the crew manifest. */
interface CrewMember {
  id: string;
  initials: string;
  name: string;
  role: string;
  bio: string;
  tags: string[];
}

const CREW: CrewMember[] = [
  {
    id: 'kaloyan',
    initials: 'KA',
    name: 'KALOYAN',
    role: 'TEAM LEAD // SITE DESIGNER // BRAINSTORMER',
    bio: "Started the project and keeps the ideas coming. Designed the site itself — the dark control-room console on screen is Kaloyan's blueprint.",
    tags: ['VISION', 'UI DESIGN', 'IDEAS'],
  },
  {
    id: 'vasko',
    initials: 'VS',
    name: 'VASKO',
    role: 'RESEARCHER // PRESENTATION DESIGNER // CODER',
    bio: 'Tracked down the datasets, constants and formulas behind every number on the dashboard, and shapes it all into the story the team presents.',
    tags: ['DATASETS', 'FORMULAS', 'SLIDES'],
  },
  {
    id: 'vladimir',
    initials: 'VL',
    name: 'VLADIMIR',
    role: 'FRONTEND CODER',
    bio: 'Builds the console itself — the 3D Earth, the panels around it and every interaction in between.',
    tags: ['REACT', 'THREE.JS', 'TYPESCRIPT'],
  },
  {
    id: 'adrian',
    initials: 'AD',
    name: 'ADRIAN',
    role: 'BACKEND ENGINEER',
    bio: "Owns the Java backend that pipes live NASA POWER satellite data into the dashboard, and keeps it running on the team's server.",
    tags: ['JAVA', 'HTTP API', 'DEPLOYMENT'],
  },
];

/** Fullscreen "ABOUT" page for the console, opened from the header.
 *  Not routed — the app is a single fixed-viewport dashboard, so the
 *  page is an overlay above everything (same pattern as the intro).
 *  Portaled to <body>: the GSAP reveal leaves a transform on the
 *  header, which would otherwise become the containing block for a
 *  fixed-position child and clip the overlay to the header strip. */
export default function AboutOverlay({ open, onClose }: AboutOverlayProps) {
  // ESC closes, like every other mode/popup in the app.
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="about-overlay" onClick={onClose}>
      <div
        className="about-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="About Earth Energy Monitor"
      >
        <div className="about-panel__head">
          <span className="about-panel__title">ABOUT // SYSTEM BRIEF</span>
          <button
            type="button"
            className="about-panel__close"
            onClick={onClose}
            aria-label="Close about page"
          >
            ✕
          </button>
        </div>

        <h2 className="about-panel__name">ENERGY AROUND US</h2>
        <p className="about-panel__lead">
          An interactive 3D Earth monitoring console. Place simulated energy
          infrastructure — data centers, factories, mining farms — anywhere on
          the globe and watch each region's estimated environmental state shift
          before and after, projected forward to 2050.
        </p>

        <div className="about-spec">
          <span>TIMELINE 2026 → 2050</span>
          <span>SOURCES NASA POWER · CLIMATE TRACE · EMBER · OSM</span>
          <span>MODEL HEURISTIC + LIVE</span>
        </div>

        <section className="about-section">
          <h3 className="about-section__title">WHAT YOU CAN DO</h3>
          <ul className="about-list">
            <li>Rotate the Earth (drag) and zoom from orbit to street level (scroll).</li>
            <li>Place facilities via the + control; a ghost preview follows the cursor until you click a site. ESC cancels.</li>
            <li>Scrub or play the 2026 → 2050 timeline — every panel re-projects month by month (Shift+arrows jump a year).</li>
            <li>Click any dot to inspect it: your placements, real data-center sites, or the world's largest emitters.</li>
            <li>Search cities in the header to fly the camera anywhere.</li>
          </ul>
        </section>

        <section className="about-section">
          <h3 className="about-section__title">WHERE THE DATA COMES FROM</h3>
          <ul className="about-list">
            <li><strong>NASA POWER</strong> — live satellite solar irradiation and 2 m air temperature per site (via the team's Java backend).</li>
            <li><strong>Climate TRACE</strong> — country CO₂e totals, ranks and the world's largest individual emitters.</li>
            <li><strong>Ember</strong> — historical grid carbon-intensity trends used for the forward projection.</li>
            <li><strong>OpenStreetMap</strong> — street-level vector tiles and the bundled data-center locations.</li>
          </ul>
          <p className="about-note">
            Heuristic estimates (grid mix, AQI, water stress baselines) are
            synthetic deterministic models, badged EST in the interface;
            live-sourced numbers are badged LIVE. Where a network
            source is unreachable the console degrades to the heuristic values
            and keeps working.
          </p>
        </section>

        <section className="about-section">
          <h3 className="about-section__title">CREW MANIFEST</h3>
          <div className="crew-grid">
            {CREW.map((member, index) => (
              <article
                key={member.id}
                className={`crew-card crew-card--${member.id}`}
              >
                <div className="crew-card__avatar">
                  <span className="crew-card__avatar-inner">
                    {member.initials}
                  </span>
                </div>
                <div className="crew-card__body">
                  <header className="crew-card__head">
                    <span className="crew-card__name">{member.name}</span>
                    <span className="crew-card__unit">
                      UNIT-{String(index + 1).padStart(2, '0')}
                    </span>
                  </header>
                  <p className="crew-card__role">{member.role}</p>
                  <p className="crew-card__bio">{member.bio}</p>
                  <div className="crew-card__tags">
                    {member.tags.map((tag) => (
                      <span key={tag} className="crew-tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="about-section">
          <h3 className="about-section__title">THE FINE PRINT</h3>
          <p className="about-note">
            Built as a hackathon project. All impact projections are estimates
            for exploration and education — not engineering or policy advice.
          </p>
        </section>

        <div className="about-panel__foot">EARTH ENERGY MONITOR // v0.1</div>
      </div>
    </div>,
    document.body,
  );
}
