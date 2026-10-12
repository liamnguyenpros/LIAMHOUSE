import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function Login() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(e, demo = false) {
    e?.preventDefault();
    setError('');
    setLoading(true);
    try {
      const p = demo ? '0901234567' : phone.trim();
      const pw = demo ? 'demo123456' : password;
      const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ phone: p, password: pw }) });
      localStorage.setItem('lh_token', data.token);
      if (data.refreshToken) localStorage.setItem('lh_refresh', data.refreshToken);
      localStorage.setItem('lh_user', JSON.stringify(data.user));
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 52 }}>🏠</div>
          <h1 style={{ color: 'var(--navy)', margin: '8px 0 4px', fontSize: 28, fontWeight: 800 }}>LIAMHOUSE</h1>
          <p className="muted">CRM cho sale bất động sản</p>
        </div>
        <form onSubmit={(e) => submit(e)} style={{ marginTop: 16 }}>
          <div className="field" style={{ marginLeft: 0, marginRight: 0 }}>
            <label>Số điện thoại</label>
            <input className="input" inputMode="tel" placeholder="VD: 0901234567"
              value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="field" style={{ marginLeft: 0, marginRight: 0 }}>
            <label>Mật khẩu</label>
            <input className="input" type="password" placeholder="••••••••"
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <div className="error-box" style={{ margin: '0 0 12px' }}>{error}</div>}
          <div className="field" style={{ margin: '16px 0 0' }}>
            <button className="btn btn-primary" disabled={loading}>
              {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>
          </div>
          <div className="field" style={{ margin: '12px 0 0' }}>
            <button type="button" className="btn btn-outline" onClick={(e) => submit(e, true)} disabled={loading}>
              🚀 Đăng nhập thử (demo)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
