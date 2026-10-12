import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Loading, ErrorBox, Empty } from '../components/ui.jsx';

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setProjects(await api('/projects'));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  return (
    <>
      <div className="header"><h1>🏢 Dự án</h1><div className="sub">{projects.length} dự án đang mở bán</div></div>

      {error && <ErrorBox message={error} onRetry={load} />}
      {loading && <Loading />}
      {!loading && !error && projects.length === 0 && <Empty icon="🏢" text="Chưa có dự án nào" />}

      {!loading && projects.map((p) => (
        <Link key={p.id} to={`/du-an/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="card tappable">
            <div style={{ fontWeight: 800, fontSize: 17 }}>{p.name}</div>
            <div className="muted">📍 {p.location || '—'}</div>
            <div className="muted">🏗️ Chủ đầu tư: {p.developer || '—'}</div>
            <div className="row mt">
              <span className="badge badge-green">Còn {p.can_con_trong} căn trống</span>
            </div>
          </div>
        </Link>
      ))}
    </>
  );
}
