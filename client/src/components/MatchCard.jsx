import Flag from './Flag';
import { useTranslation } from '../i18n/TranslationContext';

// תרגום שעה לפורמט נוח לישראלי
function formatDateTime(iso, locale) {
  const d = new Date(iso);
  const date = d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  return { date, time };
}

export default function MatchCard({ match, children }) {
  const { locale, pickText, t } = useTranslation();
  const { date, time } = formatDateTime(match.kickoff, locale);
  const finished = match.status === 'finished';
  const live = match.status === 'live';
  const hasScore = match.home_score != null && match.away_score != null;
  const homeName = pickText(match.home_name, match.home_name_en);
  const awayName = pickText(match.away_name, match.away_name_en);

  return (
    <div className={`match-card ${finished ? 'finished' : ''} ${live ? 'live' : ''}`}>
      <div className="match-team home">
        <span className="name">{homeName || match.home_code}</span>
        <Flag code={match.home_code} size="md" title={homeName} />
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
        {finished && <div className="match-status">{t('matches.filter_finished')}</div>}
      </div>

      <div className="match-team away">
        <Flag code={match.away_code} size="md" title={awayName} />
        <span className="name">{awayName || match.away_code}</span>
      </div>

      {match.venue && <div className="match-venue">📍 {match.venue}</div>}
      {children && <div style={{ gridColumn: '1 / -1', marginTop: 12, borderTop: '1px dashed var(--line)', paddingTop: 12 }}>{children}</div>}
    </div>
  );
}
