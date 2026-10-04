import { useEffect, useState } from 'react';
import { fetchExplanation, type ExplainSnapshot } from '../../lib/explain';

type State =
  | { status: 'idle' }
  | { status: 'loading'; key: string }
  | { status: 'done'; key: string; text: string; month: string }
  | { status: 'error'; key: string; message: string };

/** AI explanation of the selected facility's numbers. Only fires on
 *  click (rate-limited backend); when the timeline moves after an
 *  answer, the stale answer stays visible with a re-explain prompt. */
export default function ExplainPanel({ snapshot }: { snapshot: ExplainSnapshot }) {
  const key = JSON.stringify(snapshot);
  const [state, setState] = useState<State>({ status: 'idle' });
  const stale = state.status !== 'idle' && state.key !== key;

  const run = () => {
    setState({ status: 'loading', key });
    fetchExplanation(snapshot)
      .then((text) => setState({ status: 'done', key, text, month: snapshot.selectedMonthLabel }))
      .catch((err: unknown) =>
        setState({
          status: 'error',
          key,
          message: err instanceof Error ? err.message : 'explanation failed',
        }),
      );
  };

  const moved = snapshot.metrics.some((m) => m.projected !== undefined);
  const buttonLabel =
    state.status === 'idle' || state.status === 'error'
      ? moved
        ? `Explain the change to ${snapshot.selectedMonthLabel}`
        : 'Explain these numbers'
      : stale
        ? `Re-explain for ${snapshot.selectedMonthLabel}`
        : null;

  return (
    <div className="detail-card explain-card">
      <span className="detail-card__label">
        AI EXPLANATION <span className="trace-badge trace-badge--est">GEMINI</span>
      </span>
      {state.status === 'loading' && !stale && <ExplainLoading />}
      {state.status === 'done' && (
        <div className={`explain-card__text${stale ? ' explain-card__text--stale' : ''}`}>
          {stale && <div className="detail-card__note">Explained for {state.month}:</div>}
          {state.text.split(/\n{2,}/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      )}
      {state.status === 'error' && !stale && (
        <div className="detail-card__note detail-card__note--warn">{state.message}</div>
      )}
      {buttonLabel && (
        <button type="button" className="explain-card__button" onClick={run}>
          {buttonLabel}
        </button>
      )}
      <div className="detail-card__note">
        Explains only the numbers shown here — it does not compute new ones.
      </div>
    </div>
  );
}

/** Backend per-attempt timeout (ExplainService.TIMEOUT): after it the
 *  backend is answering from the fallback model. */
const PRIMARY_TIMEOUT_S = 15;

/** Loading state: scanning bar, shimmering placeholder lines and an
 *  elapsed-seconds counter, so a 15–30 s answer never looks frozen. */
function ExplainLoading() {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      250,
    );
    return () => window.clearInterval(timer);
  }, []);

  const phase =
    elapsed < 3
      ? 'Sending the numbers to the model'
      : elapsed < PRIMARY_TIMEOUT_S
        ? 'Model is writing the explanation'
        : 'Main model is slow — switching to the backup model';

  return (
    <div className="explain-loading" role="status" aria-live="polite">
      <div className="explain-loading__bar" aria-hidden="true" />
      <div className="explain-loading__lines" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="explain-loading__status">
        <span>
          {phase}
          <span className="explain-loading__dots" aria-hidden="true">
            <i>.</i>
            <i>.</i>
            <i>.</i>
          </span>
        </span>
        <span className="explain-loading__time">{elapsed}s</span>
      </div>
    </div>
  );
}
