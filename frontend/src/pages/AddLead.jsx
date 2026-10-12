import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

export default function AddLead() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: '', phone: '', zalo: '', source: 'facebook',
    score: 50, loai: 'can_ho', khu_vuc: '', ngan_sach: '',
  });
  const [isDemoScan, setIsDemoScan] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Giả lập quét namecard
  function demoScan() {
    setForm({
      full_name: 'Trần Minh Đức', phone: '0909888777', zalo: '0909888777',
      source: 'walk_in', score: 65, loai: 'can_ho', khu_vuc: 'Quận 9', ngan_sach: '2-3 tỷ',
    });
    setIsDemoScan(true);
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.full_name.trim() || !form.phone.trim()) {
      setError('Vui lòng nhập họ tên và số điện thoại');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const lead = await api('/leads', {
        method: 'POST',
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          phone: form.phone.trim(),
          zalo: form.zalo.trim() || null,
          source: form.source,
          score: Number(form.score) || 0,
          demand: { loai: form.loai, khu_vuc: form.khu_vuc.trim(), ngan_sach: form.ngan_sach.trim() },
        }),
      });
      navigate(`/leads/${lead.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="header">
        <button className="back" onClick={() => navigate(-1)}>← Quay lại</button>
        <h1 style={{ marginTop: 4 }}>➕ Thêm lead mới</h1>
      </div>

      <div className="field">
        <button type="button" className="btn btn-outline" onClick={demoScan}>📷 Quét namecard (demo)</button>
      </div>
      {isDemoScan && <div className="demo-note">DEMO — dữ liệu dưới đây được điền giả lập, bạn kiểm tra lại trước khi lưu.</div>}

      <form onSubmit={submit}>
        <div className="field">
          <label>Họ tên *</label>
          <input className="input" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder="VD: Nguyễn Văn An" />
        </div>
        <div className="field">
          <label>Số điện thoại *</label>
          <input className="input" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="VD: 0901234567" />
        </div>
        <div className="field">
          <label>Zalo</label>
          <input className="input" value={form.zalo} onChange={(e) => set('zalo', e.target.value)} placeholder="Số Zalo (nếu có)" />
        </div>
        <div className="field">
          <label>Nguồn</label>
          <select className="select" value={form.source} onChange={(e) => set('source', e.target.value)}>
            <option value="facebook">Facebook</option>
            <option value="tiktok">TikTok</option>
            <option value="referral">Giới thiệu</option>
            <option value="walk_in">Khách vãng lai</option>
            <option value="website">Website</option>
            <option value="data_mua">Data mua</option>
            <option value="khac">Khác</option>
          </select>
        </div>
        <div className="field">
          <label>Điểm tiềm năng: {form.score}</label>
          <input type="range" min="0" max="100" value={form.score} onChange={(e) => set('score', e.target.value)} style={{ width: '100%', minHeight: 48 }} />
        </div>
        <div className="section-title">Nhu cầu</div>
        <div className="field">
          <label>Loại BĐS</label>
          <select className="select" value={form.loai} onChange={(e) => set('loai', e.target.value)}>
            <option value="can_ho">Căn hộ</option>
            <option value="nha_pho">Nhà phố</option>
            <option value="dat_nen">Đất nền</option>
            <option value="biet_thu">Biệt thự</option>
          </select>
        </div>
        <div className="field">
          <label>Khu vực</label>
          <input className="input" value={form.khu_vuc} onChange={(e) => set('khu_vuc', e.target.value)} placeholder="VD: Quận 9" />
        </div>
        <div className="field">
          <label>Ngân sách</label>
          <input className="input" value={form.ngan_sach} onChange={(e) => set('ngan_sach', e.target.value)} placeholder="VD: 2-3 tỷ" />
        </div>
        {error && <div className="error-box" style={{ margin: '0 16px' }}>{error}</div>}
        <div className="field" style={{ marginTop: 16, marginBottom: 24 }}>
          <button className="btn btn-primary" disabled={saving}>{saving ? 'Đang lưu...' : '💾 Lưu lead'}</button>
        </div>
      </form>
    </>
  );
}
