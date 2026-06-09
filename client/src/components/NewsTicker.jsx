import { useEffect, useState } from 'react';
import api from '../api/client';
import { useTranslation } from '../i18n/TranslationContext';

export default function NewsTicker() {
  const [items, setItems] = useState([]);
  const { t } = useTranslation();

  useEffect(() => {
    api.get('/news/sports')
      .then((r) => setItems(r.data || []))
      .catch(() => setItems([]));
  }, []);

  if (!items.length) return null;
  const loopItems = [...items, ...items];

  return (
    <div className="news-ticker" dir="rtl">
      <div className="news-ticker-label">{t('common.news')}</div>
      <div className="news-ticker-track">
        <div className="news-ticker-content">
          {loopItems.map((item, index) => (
            <a key={`${item.link}-${index}`} href={item.link} target="_blank" rel="noreferrer">
              {item.title}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
