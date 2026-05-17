import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import Flag from '../components/Flag';
import MatchCard from '../components/MatchCard';

export default function Home() {
  const { user } = useAuth();
  const [matches, setMatches] = useState([]);
  const [myPredictions, setMyPredictions] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);

  useEffect(() => {
    api.get('/matches').then(r => setMatches(r.data)).catch(() => {});
    api.get('/predictions/my').then(r => setMyPredictions(r.data.predictions)).catch(() => {});
    api.get('/leaderboard').then(r => setLeaderboard(r.data)).catch(() => {});
  }, []);

  const upcoming = matches
    .filter(m => m.status !== 'finished')
    .slice(0, 4);

  const predictedIds = new Set(myPredictions.map(p => p.match_id));
  const upcomingUnpredicted = upcoming.filter(m => !predictedIds.has(m.id));

  const myRank = leaderboard.find(r => r.id === user.id);

  return (
    <main className="page">
      <div className="trophy-banner">
        <h2>שלום {user.name}<span style={{color:'var(--gold)'}}> ⚽</span></h2>
        <p>זה הזמן לחזק את הניחושים שלך. ככל שתחזה מוקדם — כך תשמור על הסיכוי לנקודות מירביות.</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="label">המיקום שלי</div>
          <div className="value">{myRank ? `#${myRank.rank}` : '—'}</div>
        </div>
        <div className="stat-card">
          <div className="label">סך הכל נקודות</div>
          <div className="value" style={{color:'var(--crimson)'}}>{myRank?.total_points ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="label">ניחושים מולאו</div>
          <div className="value">{myPredictions.length} / {matches.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">קלעים מדויקים</div>
          <div className="value" style={{color:'var(--gold-deep)'}}>{myRank?.exact_hits ?? 0}</div>
        </div>
      </div>

      <div className="section-divider">
        <h2>המשחקים הבאים</h2>
        <span className="badge">UP NEXT</span>
      </div>

      {upcoming.length === 0 ? (
        <p className="editorial" style={{color:'var(--muted)'}}>אין משחקים קרובים כרגע.</p>
      ) : (
        <div style={{display: 'grid', gap: 12}}>
          {upcoming.map(m => (
            <MatchCard key={m.id} match={m}>
              {!predictedIds.has(m.id) ? (
                <Link to="/predictions" className="btn btn-gold btn-sm">השלם ניחוש →</Link>
              ) : (
                <span style={{color:'var(--pitch)', fontWeight:600, fontSize:14}}>✓ נוחש</span>
              )}
            </MatchCard>
          ))}
        </div>
      )}

      {upcomingUnpredicted.length > 0 && (
        <div className="alert alert-error" style={{marginTop: 24}}>
          ⚠️ נותרו <strong>{upcomingUnpredicted.length}</strong> משחקים בלי ניחוש. השלם את הניחושים שלך לפני שיינעלו!
        </div>
      )}

      <div className="section-divider">
        <h2>טופ 5</h2>
        <span className="badge">LEADERBOARD</span>
      </div>

      <table className="leaderboard-table">
        <thead>
          <tr>
            <th style={{width: 80}}>מקום</th>
            <th>שחקן</th>
            <th style={{width: 120, textAlign:'end'}}>נקודות</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.slice(0, 5).map(r => (
            <tr key={r.id} className={r.rank <= 3 ? `top-${r.rank}` : ''}>
              <td>
                <span className={`rank-medal ${r.rank===1?'gold':r.rank===2?'silver':r.rank===3?'bronze':''}`}>
                  {r.rank}
                </span>
              </td>
              <td style={{fontWeight: 600}}>{r.name}</td>
              <td style={{textAlign:'end'}}><span className="total-pts">{r.total_points}</span></td>
            </tr>
          ))}
          {leaderboard.length === 0 && (
            <tr><td colSpan={3} style={{textAlign:'center', color:'var(--muted)'}}>אין עדיין נתונים</td></tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
