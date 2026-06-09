import { useEffect, useState } from 'react';
import api from '../api/client';
import Flag from '../components/Flag';
import { useTranslation } from '../i18n/TranslationContext';

export default function Groups() {
  const [standings, setStandings] = useState({});
  const { t, pickText } = useTranslation();

  useEffect(() => {
    api.get('/standings').then(r => setStandings(r.data));
  }, []);

  const groups = Object.keys(standings).sort();

  return (
    <main className="page">
      <h1 className="page-title">
        {t('groups.title')}
      </h1>
      <p className="page-subtitle">{t('groups.subtitle')}</p>

      <div className="groups-grid">
        {groups.map(g => (
          <GroupCard key={g} letter={g} teams={standings[g]} t={t} pickText={pickText} />
        ))}
      </div>
    </main>
  );
}

function GroupCard({ letter, teams, t, pickText }) {
  return (
    <div className="group-card">
      <div className="group-card-head">
        <span className="label">{t('groups.group')}</span>
        <span className="letter">{letter}</span>
      </div>
      <div className="table-wrap">
        <table className="standings-table">
          <thead>
            <tr>
              <th>#</th>
              <th style={{textAlign:'start'}}>{t('groups.team')}</th>
              <th>{t('groups.played')}</th>
              <th>{t('groups.won')}</th>
              <th>{t('groups.drawn')}</th>
              <th>{t('groups.lost')}</th>
              <th>{t('groups.goals_for')}</th>
              <th>{t('groups.goal_diff')}</th>
              <th>{t('groups.points')}</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t, i) => (
              <tr key={t.code}>
                <td style={{color:'var(--muted)', fontWeight:600}}>{i + 1}</td>
                <td>
                  <div className="team-cell">
                    <Flag code={t.code} size="sm" title={pickText(t.name_he, t.name_en)} />
                    <span>{pickText(t.name_he, t.name_en)}</span>
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
