import { useEffect, useState } from 'react';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function SiteFooter() {
  const { user } = useAuth();
  const [docs, setDocs] = useState([]);
  const [doc, setDoc] = useState(null);
  const [showConsent, setShowConsent] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactDraft, setContactDraft] = useState({ name: '', phone_number: '', message: '', image: null });
  const [contactErr, setContactErr] = useState('');
  const [contactOk, setContactOk] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.get('/site/footer-docs')
      .then((r) => {
        const nextDocs = r.data || [];
        setDocs(nextDocs);
        if (!localStorage.getItem('mondial_terms_accepted')) {
          const termsDoc = nextDocs.find((item) => item.doc_key === 'rules') || nextDocs[0];
          if (termsDoc) {
            setDoc(termsDoc);
            setShowConsent(true);
          }
        }
      })
      .catch(() => setDocs([]));
  }, []);

  useEffect(() => {
    setContactDraft((prev) => ({
      ...prev,
      name: user?.name || prev.name,
      phone_number: user?.phone_number || prev.phone_number
    }));
  }, [user]);

  const acceptTerms = () => {
    localStorage.setItem('mondial_terms_accepted', '1');
    setShowConsent(false);
    setDoc(null);
  };

  const openItem = (item) => {
    if (item.file_type === 'contact' || item.doc_key === 'contact') {
      setContactErr('');
      setContactOk('');
      setContactOpen(true);
      return;
    }
    setDoc(item);
  };

  const sendContact = async () => {
    setContactErr('');
    setContactOk('');
    if (!contactDraft.name.trim() || !contactDraft.message.trim()) {
      setContactErr('יש להזין שם והודעה');
      return;
    }
    setSending(true);
    try {
      const form = new FormData();
      form.append('name', contactDraft.name);
      form.append('phone_number', contactDraft.phone_number);
      form.append('message', contactDraft.message);
      if (contactDraft.image) form.append('image', contactDraft.image);
      await api.post('/site/contact', form);
      setContactOk('הפנייה נשלחה בהצלחה');
      setContactDraft({
        name: user?.name || '',
        phone_number: user?.phone_number || '',
        message: '',
        image: null
      });
    } catch (e) {
      setContactErr(errMsg(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <footer className="site-footer">
        {docs.map((item, index) => (
          <button key={item.doc_key} type="button" onClick={() => openItem(item)}>
            {item.label}{index < docs.length - 1 ? ' |' : ''}
          </button>
        ))}
      </footer>

      {doc && (
        <div className="doc-modal-backdrop" onClick={() => !showConsent && setDoc(null)}>
          <div className="doc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="doc-modal-head">
              <h3>{doc.label}</h3>
              {!showConsent && (
                <button type="button" className="btn btn-sm btn-outline" onClick={() => setDoc(null)}>סגור</button>
              )}
            </div>
            {doc.file_type === 'image' ? (
              <img title={doc.label} src={doc.file_url} alt={doc.label} className="doc-modal-image" />
            ) : (
              <iframe title={doc.label} src={doc.file_url} />
            )}
            {showConsent && (
              <button type="button" className="btn btn-gold" onClick={acceptTerms}>
                אישור שקראתי את התקנון
              </button>
            )}
          </div>
        </div>
      )}

      {contactOpen && (
        <div className="doc-modal-backdrop" onClick={() => setContactOpen(false)}>
          <div className="doc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="doc-modal-head">
              <h3>צור קשר</h3>
              <button type="button" className="btn btn-sm btn-outline" onClick={() => setContactOpen(false)}>סגור</button>
            </div>
            {contactErr && <div className="alert alert-error">{contactErr}</div>}
            {contactOk && <div className="alert alert-success">{contactOk}</div>}
            <div className="admin-form-grid">
              <div className="field">
                <label>שם</label>
                <input type="text" value={contactDraft.name} onChange={(e) => setContactDraft((s) => ({ ...s, name: e.target.value }))} />
              </div>
              <div className="field">
                <label>טלפון</label>
                <input type="text" value={contactDraft.phone_number} onChange={(e) => setContactDraft((s) => ({ ...s, phone_number: e.target.value }))} />
              </div>
            </div>
            <div className="field">
              <label>הודעה</label>
              <textarea rows="5" value={contactDraft.message} onChange={(e) => setContactDraft((s) => ({ ...s, message: e.target.value }))} />
            </div>
            <div className="field">
              <label>העלה תמונה</label>
              <input type="file" accept="image/*" onChange={(e) => setContactDraft((s) => ({ ...s, image: e.target.files?.[0] || null }))} />
            </div>
            <button type="button" className="btn btn-gold" onClick={sendContact} disabled={sending}>
              {sending ? 'שולח...' : 'שלח פנייה'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
