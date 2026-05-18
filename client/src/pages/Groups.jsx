import { useEffect, useState } from 'react';
import api from '../api/client';
import Flag from '../components/Flag';

export default function Groups() {
  const [standings, setStandings] = useState({});

  useEffect(() => {
    api.get('/standings').then(r => setStandings(r.data));
  }, []);

  const groups = Object.keys(standings).sort();

  return (
    <main className="page">
      <h1 className="page-title">
        12 ה<span className="accent">בתים</span>
      </h1>
      <p className="page-subtitle">חלוקת 48 הנבחרות לבתי המונדיאל 2026 — דירוג מתעדכן לפי תוצאות בפועל</p>

      <div className="groups-grid">
        {groups.map(g => (
          <GroupCard key={g} letter={g} teams={standings[g]} />
        ))}
      </div>
    </main>
  );
}

function GroupCard({ letter, teams }) {
  return (
    <div className="group-card">
      <div className="group-card-head">
        <span className="label">בית</span>
        <span className="letter">{letter}</span>
      </div>
      <div className="table-wrap">
        <table className="standings-table">
          <thead>
            <tr>
              <th>#</th>
              <th style={{textAlign:'start'}}>נבחרת</th>
              <th>מ</th>
              <th>נ</th>
              <th>ת</th>
              <th>ה</th>
              <th>שע</th>
              <th>הפ</th>
              <th>נק</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t, i) => (
              <tr key={t.code}>
                <td style={{color:'var(--muted)', fontWeight:600}}>{i + 1}</td>
                <td>
                  <div className="team-cell">
                    <Flag code={t.code} size="sm" title={t.name_he} />
                    <span>{t.name_he}</span>
                  </div>
                </td>
                <td>{t.played}</td>
                <td>{t.won}</td>
                <td>{t.drawn}</td>
                <td>{t.lost}</td>
                <td>{t.gf}</td>
                <td style={{color: t.gd > 0 ? 'var(--pitch)' : t.gd < 0 ? 'var(--crimson)' : 'inherit'}}>
                  {t.gd > 0 ? '+' : ''}{t.gd}
                </td>
                <td><span className="pts">{t.pts}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
