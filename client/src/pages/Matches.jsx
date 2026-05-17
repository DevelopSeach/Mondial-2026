import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import MatchCard from '../components/MatchCard';

export default function Matches() {
  const [matches, setMatches] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    api.get('/matches').then(r => setMatches(r.data));
  }, []);

  const groups = useMemo(() => {
    const list = matches.filter(m => {
      if (filter === 'all') return true;
      if (filter === 'finished') return m.status === 'finished';
      if (filter === 'upcoming') return m.status !== 'finished';
      return m.group_letter === filter;
    });
    const byDay = {};
    for (const m of list) {
      const day = m.kickoff.slice(0, 10);
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(m);
    }
    return Object.entries(byDay).sort(([a],[b]) => a.localeCompare(b));
  }, [matches, filter]);

  const groupLetters = ['A','B','C','D','E','F','G','H','I','J','K','L'];

  return (
    <main className="page">
      <h1 className="page-title">
        לוח <span className="accent">המשחקים</span>
      </h1>
      <p className="page-subtitle">כל 72 משחקי שלב הבתים — תאריכים, אצטדיונים ותוצאות</p>

      <div className="tabs" style={{flexWrap:'wrap'}}>
        <button className={`tab ${filter==='all'?'active':''}`} onClick={() => setFilter('all')}>הכל</button>
        <button className={`tab ${filter==='upcoming'?'active':''}`} onClick={() => setFilter('upcoming')}>קרובים</button>
        <button className={`tab ${filter==='finished'?'active':''}`} onClick={() => setFilter('finished')}>הסתיימו</button>
        {groupLetters.map(g => (
          <button key={g} className={`tab ${filter===g?'active':''}`} onClick={() => setFilter(g)}>בית {g}</button>
        ))}
      </div>

      {groups.map(([day, dayMatches]) => (
        <div key={day}>
          <div className="day-label">
            {new Date(day).toLocaleDateString('he-IL', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })}
          </div>
          <div style={{display: 'grid', gap: 12}}>
            {dayMatches.map(m => <MatchCard key={m.id} match={m} />)}
          </div>
        </div>
      ))}

      {groups.length === 0 && <p style={{color:'var(--muted)'}}>אין משחקים לסינון זה.</p>}
    </main>
  );
}
