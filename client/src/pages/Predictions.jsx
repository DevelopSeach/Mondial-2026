import { useEffect, useMemo, useState } from 'react';
import api, { errMsg } from '../api/client';
import Flag from '../components/Flag';

function formatDateTime(iso) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', weekday: 'short' }),
    time: d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  };
}

export default function Predictions() {
  const [matches, setMatches] = useState([]);
  const [teams, setTeams] = useState([]);
  const [predictions, setPredictions] = useState({});  // matchId -> {home, away, points, locked, saved}
  const [special, setSpecial] = useState({ champion_code: '', runner_up_code: '', top_scorer: '' });
  const [specialDirty, setSpecialDirty] = useState(false);
  const [lockHours, setLockHours] = useState(1);
  const [tab, setTab] = useState('group');
  const [savingId, setSavingId] = useState(null);
  const [savingSpecial, setSavingSpecial] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/matches'),
      api.get('/teams'),
      api.get('/predictions/my')
    ]).then(([m, t, p]) => {
      setMatches(m.data);
      setTeams(t.data);
      const pmap = {};
      for (const pr of p.data.predictions) {
        pmap[pr.match_id] = {
          home: pr.home_score,
          away: pr.away_score,
          points: pr.points,
          saved: true,
          actual_home: pr.actual_home,
          actual_away: pr.actual_away,
          status: pr.status
        };
      }
      setPredictions(pmap);
      if (p.data.special) setSpecial(p.data.special);
      setSpecialDirty(false);
    });
  }, []);

  const onChange = (matchId, side, value) => {
    setPredictions(prev => ({
      ...prev,
      [matchId]: {
        ...prev[matchId],
        [side]: value === '' ? '' : Number(value),
        saved: false
      }
    }));
  };

  const save = async (matchId) => {
    const p = predictions[matchId];
    if (!Number.isInteger(p?.home) || !Number.isInteger(p?.away)) {
      setMsg('יש להזין שני מספרים תקינים');
      return;
    }
    setSavingId(matchId);
    setMsg('');
    try {
      await api.post(`/predictions/match/${matchId}`, { home_score: p.home, away_score: p.away });
      setPredictions(prev => ({ ...prev, [matchId]: { ...prev[matchId], saved: true } }));
      setMsg('✓ הניחוש נשמר');
      setTimeout(() => setMsg(''), 2000);
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setSavingId(null);
    }
  };

  const saveSpecial = async () => {
    setSavingSpecial(true); setMsg('');
    try {
      await api.post('/predictions/special', special);
      setSpecialDirty(false);
      setMsg('✓ ניחושים מיוחדים נשמרו');
      setTimeout(() => setMsg(''), 2000);
    } catch (e) { setMsg(errMsg(e)); }
    finally { setSavingSpecial(false); }
  };

  const saveAll = async () => {
    const dirtyPredictions = Object.entries(predictions)
      .filter(([, p]) => !p.saved)
      .map(([id, p]) => ({ id: Number(id), home: p.home, away: p.away }))
    const invalidDirty = dirtyPredictions.some(({ home, away }) => !Number.isInteger(home) || !Number.isInteger(away));
    const dirtyMatches = dirtyPredictions.filter(({ home, away }) => Number.isInteger(home) && Number.isInteger(away));

    const needsSpecialSave = specialDirty;

    if (invalidDirty) {
      setMsg('יש ניחושים לא תקינים. תקן אותם ואז שמור הכל');
      return;
    }

    if (dirtyMatches.length === 0 && !needsSpecialSave) {
      setMsg('אין שינויים לשמור');
      return;
    }

    setSavingAll(true);
    setMsg('');
    try {
      const tasks = [
        ...dirtyMatches.map(({ id, home, away }) =>
          api.post(`/predictions/match/${id}`, { home_score: home, away_score: away })
        ),
      ];
      if (needsSpecialSave) tasks.push(api.post('/predictions/special', special));

      const results = await Promise.allSettled(tasks);
      const matchResults = results.slice(0, dirtyMatches.length);
      const specialResult = needsSpecialSave ? results[results.length - 1] : null;
      const failedMatches = matchResults.filter(r => r.status === 'rejected').length;
      const savedMatches = dirtyMatches.length - failedMatches;

      if (savedMatches > 0) {
        setPredictions(prev => {
          const next = { ...prev };
          dirtyMatches.forEach(({ id }, index) => {
            if (matchResults[index]?.status === 'fulfilled' && next[id]) {
              next[id] = { ...next[id], saved: true };
            }
          });
          return next;
        });
      }
      if (needsSpecialSave && specialResult?.status === 'fulfilled') setSpecialDirty(false);

      const specialFailed = needsSpecialSave && specialResult?.status === 'rejected';

      if (failedMatches > 0 || specialFailed) {
        const totalFailed = failedMatches + (specialFailed ? 1 : 0);
        setMsg(`✓ נשמרו ${savedMatches} ניחושים, ${totalFailed} נכשלו`);
      } else if (savedMatches > 0 && needsSpecialSave) {
        setMsg(`✓ נשמרו ${savedMatches} ניחושים וניחושים מיוחדים`);
      } else if (savedMatches > 0) {
        setMsg(`✓ נשמרו ${savedMatches} ניחושים`);
      } else {
        setMsg('✓ ניחושים מיוחדים נשמרו');
      }
      setTimeout(() => setMsg(''), 2000);
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setSavingAll(false);
    }
  };

  // קיבוץ משחקים לפי תאריך
  const byDay = useMemo(() => {
    const groups = {};
    const list = matches.filter(m => m.stage === 'group' || tab === 'all');
    for (const m of list) {
      const day = m.kickoff.slice(0, 10);
      if (!groups[day]) groups[day] = [];
      groups[day].push(m);
    }
    return Object.entries(groups).sort(([a],[b]) => a.localeCompare(b));
  }, [matches, tab]);

  const completedCount = Object.values(predictions).filter(p => Number.isInteger(p.home)).length;

  return (
    <main className="page">
      <h1 className="page-title">
        ה<span className="accent">ניחושים</span> שלי
      </h1>
      <p className="page-subtitle">
        השלמת {completedCount} מתוך {matches.length} משחקים · כל ניחוש נסגר {lockHours} שעה לפני בעיטת הפתיחה
      </p>

      {msg && <div className={`alert ${msg.startsWith('✓') ? 'alert-success' : 'alert-error'}`} style={{position:'sticky', top: 80, zIndex: 10}}>{msg}</div>}

      <div className="predictions-toolbar">
        <div className="tabs">
          <button className={`tab ${tab==='group'?'active':''}`} onClick={() => setTab('group')}>שלב הבתים</button>
          <button className={`tab ${tab==='special'?'active':''}`} onClick={() => setTab('special')}>ניחושים מיוחדים</button>
        </div>
        <button
          type="button"
          className="btn btn-gold predictions-save-all"
          onClick={saveAll}
          disabled={savingAll || (Object.values(predictions).every(p => p.saved) && !specialDirty)}
        >
          {savingAll ? <span className="spinner" /> : 'שמור הכל'}
        </button>
      </div>

      {tab === 'special' ? (
        <SpecialPredictions
          teams={teams}
          special={special}
          setSpecial={(next) => {
            setSpecial(next);
            setSpecialDirty(true);
          }}
          onSave={saveSpecial}
          saving={savingSpecial}
        />
      ) : (
        <>
          {byDay.map(([day, dayMatches]) => (
            <div key={day}>
              <div className="day-label">
                {new Date(day).toLocaleDateString('he-IL', { weekday:'long', day:'2-digit', month:'long' })}
              </div>
              {dayMatches.map(m => {
                const p = predictions[m.id] || {};
                const kickoff = new Date(m.kickoff).getTime();
                const lockTime = kickoff - lockHours * 3600 * 1000;
                const locked = Date.now() >= lockTime;
                const finished = m.status === 'finished';
                const { time } = formatDateTime(m.kickoff);
                return (
                  <div key={m.id} className={`prediction-row ${locked ? 'locked' : ''} ${p.points ? 'scored' : ''}`}>
                    <div className="match-team home">
                      <span className="name">{m.home_name}</span>
                      <Flag code={m.home_code} size="sm" title={m.home_name} />
                      <span style={{color:'var(--muted)', fontSize:12, marginInlineStart: 8}}>{time}</span>
                    </div>

                    <div className="scores-block">
                      <input
                        type="number"
                        className="score-input"
                        min={0} max={30}
                        value={p.home ?? ''}
                        disabled={locked || finished}
                        onChange={e => onChange(m.id, 'home', e.target.value)}
                      />
                      <span className="dash">:</span>
                      <input
                        type="number"
                        className="score-input"
                        min={0} max={30}
                        value={p.away ?? ''}
                        disabled={locked || finished}
                        onChange={e => onChange(m.id, 'away', e.target.value)}
                      />
                    </div>

                    <div className="match-team away">
                      <Flag code={m.away_code} size="sm" title={m.away_name} />
                      <span className="name">{m.away_name}</span>
                      {(p.actual_home != null && p.actual_away != null) && (
                        <span className="numeric" style={{marginInlineStart: 12, padding:'2px 8px', background:'var(--ink)', color:'var(--gold)', fontSize:14, borderRadius:2}}>
                          תוצאה: {p.actual_home}–{p.actual_away}
                        </span>
                      )}
                      {p.points != null && p.points > 0 && (
                        <span className={`points-pill ${p.points >= 5 ? 'exact' : p.points >= 3 ? 'high' : ''}`}>
                          {p.points} נק׳
                        </span>
                      )}
                      {!locked && !finished && !p.saved && Number.isInteger(p.home) && (
                        <button className="btn btn-sm btn-pitch" onClick={() => save(m.id)} disabled={savingId === m.id}>
                          {savingId === m.id ? '...' : 'שמור'}
                        </button>
                      )}
                      {p.saved && !locked && <span style={{color:'var(--pitch)', fontSize:13}}>✓ נשמר</span>}
                      {locked && !finished && <span style={{color:'var(--muted)', fontSize:12}}>🔒 נעול</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </>
      )}
    </main>
  );
}

function SpecialPredictions({ teams, special, setSpecial, onSave, saving }) {
  return (
    <div style={{display:'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', maxWidth: 900}}>
      <div className="stat-card" style={{borderTop:'4px solid var(--gold)'}}>
        <div className="label">🏆 אלופת המונדיאל</div>
        <p style={{fontSize:13, color:'var(--muted)', margin:'4px 0 12px'}}>20 נקודות בניחוש מדויק</p>
        <select className="field" value={special.champion_code || ''} onChange={e => setSpecial({...special, champion_code: e.target.value})} style={{width:'100%', padding:12}}>
          <option value="">בחר נבחרת...</option>
          {teams.map(t => <option key={t.code} value={t.code}>{t.name_he}</option>)}
        </select>
      </div>

      <div className="stat-card" style={{borderTop:'4px solid #c9d1d9'}}>
        <div className="label">🥈 סגנית האלופה</div>
        <p style={{fontSize:13, color:'var(--muted)', margin:'4px 0 12px'}}>10 נקודות בניחוש מדויק</p>
        <select className="field" value={special.runner_up_code || ''} onChange={e => setSpecial({...special, runner_up_code: e.target.value})} style={{width:'100%', padding:12}}>
          <option value="">בחר נבחרת...</option>
          {teams.map(t => <option key={t.code} value={t.code}>{t.name_he}</option>)}
        </select>
      </div>

      <div className="stat-card" style={{borderTop:'4px solid var(--crimson)'}}>
        <div className="label">👑 מלך השערים</div>
        <p style={{fontSize:13, color:'var(--muted)', margin:'4px 0 12px'}}>15 נקודות בניחוש מדויק</p>
        <input className="field" placeholder="שם השחקן (באנגלית)" value={special.top_scorer || ''} onChange={e => setSpecial({...special, top_scorer: e.target.value})} style={{width:'100%', padding:12}} />
      </div>

      <div style={{gridColumn: '1 / -1'}}>
        <button className="btn btn-gold" onClick={onSave} disabled={saving}>
          {saving ? <span className="spinner" /> : 'שמור ניחושים מיוחדים'}
        </button>
      </div>
    </div>
  );
}
