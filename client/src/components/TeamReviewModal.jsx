import { useEffect, useState } from 'react';
import api from '../api/client';
import { useTranslation } from '../i18n/TranslationContext';
import Flag from './Flag';
import SourceLink from './SourceLink';
import RichText from './RichText';

const CONF = { low: 'נמוכה', medium: 'בינונית', high: 'גבוהה' };

// פופאפ ביקורת נבחרת (AI) — נטען לפי קוד הנבחרת
export default function TeamReviewModal({ code, onClose }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    setLoading(true); setErr('');
    api.get(`/team-reviews/${code}`)
      .then(r => setData(r.data?.review || null))
      .catch(() => setErr(t('teamrev.none')))
      .finally(() => setLoading(false));
  }, [code]);

  const r = data || {};
  const fs = r.formation_and_style || {};
  const pa = r.professional_assessment || {};

  return (
    <div className="aipred-modal-backdrop" onClick={onClose}>
      <div className="aipred-modal teamrev-modal" dir="rtl" onClick={e => e.stopPropagation()}>
        <div className="aipred-modal-head">
          <span><Flag code={code} size="sm" /> {r.team_name || code?.toUpperCase()}</span>
          <button className="aipred-x" onClick={onClose}>×</button>
        </div>

        {loading && <div style={{ padding: 20 }}>{t('common.loading')}</div>}
        {!loading && err && <div className="alert alert-error">{err}</div>}

        {!loading && data && (
          <div className="teamrev-body">
            {r.summary && <p className="teamrev-summary"><RichText>{r.summary}</RichText></p>}

            {(fs.usual_formation || fs.attacking_style) && (
              <section>
                <h4>הרכב וסגנון משחק</h4>
                {fs.usual_formation && <div><b>מערך:</b> <RichText>{fs.usual_formation}</RichText></div>}
                {Array.isArray(fs.key_players) && fs.key_players.length > 0 && <div><b>שחקני מפתח:</b> {fs.key_players.join(', ')}</div>}
                {fs.attacking_style && <div><b>התקפה:</b> <RichText>{fs.attacking_style}</RichText></div>}
                {fs.defensive_structure && <div><b>הגנה:</b> <RichText>{fs.defensive_structure}</RichText></div>}
                {fs.bench_depth && <div><b>עומק ספסל:</b> <RichText>{fs.bench_depth}</RichText></div>}
              </section>
            )}

            {Array.isArray(r.advantages) && r.advantages.length > 0 && (
              <section><h4>יתרונות</h4><ul>{r.advantages.map((a, i) => <li key={i}><RichText>{a}</RichText></li>)}</ul></section>
            )}
            {Array.isArray(r.weaknesses) && r.weaknesses.length > 0 && (
              <section><h4>חסרונות</h4><ul>{r.weaknesses.map((a, i) => <li key={i}><RichText>{a}</RichText></li>)}</ul></section>
            )}

            {Array.isArray(r.key_players) && r.key_players.length > 0 && (
              <section>
                <h4>שחקני מפתח</h4>
                <table className="teamrev-table">
                  <thead><tr><th>שחקן</th><th>תפקיד</th><th>למה חשוב</th></tr></thead>
                  <tbody>{r.key_players.map((p, i) => <tr key={i}><td>{p.name}</td><td>{p.position}</td><td><RichText>{p.importance}</RichText></td></tr>)}</tbody>
                </table>
              </section>
            )}

            {Array.isArray(r.review_sources) && r.review_sources.length > 0 && (
              <section>
                <h4>ביקורות ממקורות</h4>
                {r.review_sources.map((s, i) => (
                  <div key={i} className="teamrev-source">
                    <span className="teamrev-source-icon">{s.source_icon || '📰'}</span>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <b>{s.reviewer_label || s.source_name}</b>
                        <SourceLink url={s.url} size={16} label={s.source_name} />
                      </div>
                      {s.main_point && <div className="teamrev-source-point"><RichText>{s.main_point}</RichText></div>}
                    </div>
                  </div>
                ))}
              </section>
            )}

            {(pa.ceiling || pa.biggest_danger) && (
              <section className="teamrev-assess">
                <h4>סיכום מקצועי</h4>
                {pa.ceiling && <div><b>תקרת זכוכית:</b> <RichText>{pa.ceiling}</RichText></div>}
                {pa.main_condition_for_success && <div><b>תנאי להצלחה:</b> <RichText>{pa.main_condition_for_success}</RichText></div>}
                {pa.biggest_danger && <div><b>הסכנה הגדולה:</b> <RichText>{pa.biggest_danger}</RichText></div>}
                {pa.confidence_level && <div><b>רמת ביטחון:</b> {CONF[pa.confidence_level] || pa.confidence_level}</div>}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
