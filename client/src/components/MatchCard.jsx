import Flag from './Flag';

// תרגום שעה לפורמט נוח לישראלי
function formatDateTime(iso) {
  const d = new Date(iso);
  const date = d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  return { date, time };
}

export default function MatchCard({ match, children }) {
  const { date, time } = formatDateTime(match.kickoff);
  const finished = match.status === 'finished';
  const live = match.status === 'live';
  const hasScore = match.home_score != null && match.away_score != null;

  return (
    <div className={`match-card ${finished ? 'finished' : ''} ${live ? 'live' : ''}`}>
      <div className="match-team home">
        <span className="name">{match.home_name || match.home_code}</span>
        <Flag code={match.home_code} size="md" title={match.home_name} />
      </div>

      <div className="match-center">
        {hasScore ? (
          <div className="match-score">
            <span>{match.home_score}</span>
            <span className="sep">–</span>
            <span>{match.away_score}</span>
          </div>
        ) : (
          <>
            <div className="match-time">{time}</div>
            <div className="match-vs">VS</div>
            <div className="match-status">{date}</div>
          </>
        )}
        {finished && <div className="match-status">סופי</div>}
      </div>

      <div className="match-team away">
        <Flag code={match.away_code} size="md" title={match.away_name} />
        <span className="name">{match.away_name || match.away_code}</span>
      </div>

      {match.venue && <div className="match-venue">📍 {match.venue}</div>}
      {children && <div style={{ gridColumn: '1 / -1', marginTop: 12, borderTop: '1px dashed var(--line)', paddingTop: 12 }}>{children}</div>}
    </div>
  );
}
