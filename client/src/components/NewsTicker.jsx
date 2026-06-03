import { useEffect, useState } from 'react';
import api from '../api/client';

export default function NewsTicker() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    api.get('/news/sports')
      .then((r) => setItems(r.data || []))
      .catch(() => setItems([]));
  }, []);

  if (!items.length) return null;
  const loopItems = [...items, ...items];

  return (
    <div className="news-ticker" dir="rtl">
      <div className="news-ticker-label">חדשות</div>
      <div className="news-ticker-track">
        <div className="news-ticker-content">
          {loopItems.map((item, index) => (
            <span className="news-ticker-item" key={`${item.link}-${index}`}>
              <a href={item.link} target="_blank" rel="noreferrer">
                {item.title}
              </a>
              <span className="news-ticker-separator" aria-hidden="true">⚽</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
