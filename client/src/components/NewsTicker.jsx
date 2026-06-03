import { useEffect, useState } from 'react';
import api from '../api/client';

export default function NewsTicker() {
  const [items, setItems] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    api.get('/news/sports')
      .then((r) => setItems(r.data || []))
      .catch(() => setItems([]));
  }, []);

  useEffect(() => {
    if (items.length <= 1) return undefined;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % items.length);
    }, 7000);

    return () => window.clearInterval(timer);
  }, [items]);

  useEffect(() => {
    if (!items.length) {
      setActiveIndex(0);
      return;
    }

    setActiveIndex((current) => current % items.length);
  }, [items]);

  if (!items.length) return null;

  const activeItem = items[activeIndex];

  return (
    <div className="news-ticker" dir="rtl">
      <div className="news-ticker-label">חדשות ספורט</div>
      <div className="news-ticker-track">
        <div className="news-ticker-content" key={activeItem.link}>
          <a href={activeItem.link} target="_blank" rel="noreferrer">
            {activeItem.title}
          </a>
        </div>
      </div>
    </div>
  );
}
