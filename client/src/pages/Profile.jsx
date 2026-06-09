import { useEffect, useState } from 'react';
import api, { errMsg } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from '../i18n/TranslationContext';

export default function Profile() {
  const { user, updateProfile } = useAuth();
  const { t, language } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileImageFile, setProfileImageFile] = useState(null);
  const [profilePreviewUrl, setProfilePreviewUrl] = useState('');
  const [phoneDraft, setPhoneDraft] = useState(user?.phone_number || '');
  const [languageDraft, setLanguageDraft] = useState(user?.preferred_language || language);
  const [profileMsg, setProfileMsg] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setOk('');
    if (newPassword !== confirmPassword) {
      setErr(t('profile.password_mismatch'));
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword
      });
      setOk(t('profile.password_saved'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!profileImageFile) {
      setProfilePreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(profileImageFile);
    setProfilePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [profileImageFile]);

  useEffect(() => {
    setPhoneDraft(user?.phone_number || '');
  }, [user?.phone_number]);

  useEffect(() => {
    setLanguageDraft(user?.preferred_language || language);
  }, [user?.preferred_language, language]);

  const saveProfileDetails = async () => {
    setProfileMsg('');
    setProfileBusy(true);
    try {
      await updateProfile({ profile_image_file: profileImageFile, phone_number: phoneDraft, preferred_language: languageDraft });
      setProfileMsg(t('profile.saved'));
      setProfileImageFile(null);
    } catch (e) {
      setProfileMsg(errMsg(e, t('profile.save_error')));
    } finally {
      setProfileBusy(false);
    }
  };

  return (
    <main className="page">
      <h1 className="page-title">
        {t('profile.title')}
      </h1>
      <p className="page-subtitle">{t('profile.subtitle')}</p>

      <div style={{ display: 'grid', gap: 18, maxWidth: 760 }}>
        <div className="stat-card" style={{ borderTop: '4px solid var(--pitch)' }}>
          <div className="label">{t('profile.user_details')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginTop: 12 }}>
            <InfoField label={t('login.full_name')} value={user?.name || t('common.none')} />
            <InfoField label={t('login.email')} value={user?.email || t('common.none')} />
            <InfoField label={t('profile.phone')} value={user?.phone_number || t('common.none')} />
            <InfoField label={t('admin.tab_departments')} value={user?.department || t('common.none')} />
          </div>
        </div>

        <div className="stat-card" style={{ borderTop: '4px solid var(--crimson)' }}>
          <div className="label">{t('profile.profile_details')}</div>
          <p style={{ color: 'var(--muted)', marginTop: 8 }}>
            {t('profile.profile_help')}
          </p>

          <div style={{margin: '12px 0'}}>
            {(profilePreviewUrl || user?.profile_image_url) ? (
              <img
                src={profilePreviewUrl || user?.profile_image_url}
                alt="profile"
                style={{ width: 90, height: 90, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--line-bold)' }}
              />
            ) : (
              <div style={{ width: 90, height: 90, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'var(--paper-dim)', border: '2px solid var(--line-bold)' }}>
                👤
              </div>
            )}
          </div>

          <div className="field" style={{maxWidth: 420}}>
            <label>{t('profile.phone')}</label>
            <input
              value={phoneDraft}
              onChange={(e) => setPhoneDraft(e.target.value)}
              placeholder="050-0000000"
            />
          </div>

          <div className="field" style={{maxWidth: 420}}>
            <label>{t('common.language')}</label>
            <select value={languageDraft} onChange={(e) => setLanguageDraft(e.target.value)}>
              <option value="he">{t('common.language_he')}</option>
              <option value="ar">{t('common.language_ar')}</option>
              <option value="en">{t('common.language_en')}</option>
            </select>
          </div>

          <div className="field" style={{maxWidth: 420}}>
            <label>{t('profile.choose_image')}</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setProfileImageFile(e.target.files?.[0] || null)}
            />
          </div>

          {profileMsg && <div className={`alert ${profileMsg.includes('שגיאה') ? 'alert-error' : 'alert-success'}`}>{profileMsg}</div>}

          <button className="btn btn-gold" type="button" onClick={saveProfileDetails} disabled={profileBusy}>
            {profileBusy ? <span className="spinner" /> : t('profile.save_profile')}
          </button>
        </div>

        <form className="stat-card" style={{ borderTop: '4px solid var(--gold)' }} onSubmit={submit}>
          <div className="label">{t('profile.password_change')}</div>
          <p style={{ color: 'var(--muted)', marginTop: 8 }}>
            {t('profile.password_help')}
          </p>

          {err && <div className="alert alert-error">{err}</div>}
          {ok && <div className="alert alert-success">{ok}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <div className="field">
              <label>{t('profile.current_password')}</label>
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="field">
              <label>{t('profile.new_password')}</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <div className="field">
              <label>{t('profile.confirm_password')}</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
          </div>

          <button className="btn btn-gold" type="submit" disabled={busy}>
            {busy ? <span className="spinner" /> : t('profile.save_password')}
          </button>
        </form>
      </div>
    </main>
  );
}

function InfoField({ label, value }) {
  return (
    <div className="field" style={{ marginBottom: 0 }}>
      <label>{label}</label>
      <input value={value} readOnly />
    </div>
  );
}
