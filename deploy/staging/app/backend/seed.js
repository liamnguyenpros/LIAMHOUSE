import bcrypt from 'bcryptjs';
import { pool } from './db.js';

// Seed lại dữ liệu demo tối thiểu cho PostgreSQL dev.
// Chạy: npm run seed   (xóa sạch dữ liệu bảng nghiệp vụ rồi seed lại)

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      TRUNCATE TABLE notifications, ai_usage_logs, ai_quotas, ai_extractions,
        deals, follow_ups, activities, documents, leads,
        properties, projects, users, teams, workspaces CASCADE
    `);

    // Workspace
    const ws = (await client.query(
      `INSERT INTO workspaces (name, type, plan) VALUES ('Liam', 'solo', 'ca_nhan') RETURNING id`
    )).rows[0];

    // User sale demo: 0901234567 / demo123456
    const hash = bcrypt.hashSync('demo123456', 10);
    const user = (await client.query(
      `INSERT INTO users (workspace_id, full_name, phone, password_hash, role, status)
       VALUES ($1, 'Liam', '0901234567', $2, 'sale', 'active') RETURNING id`,
      [ws.id, hash]
    )).rows[0];
    await client.query(`UPDATE workspaces SET owner_id = $1 WHERE id = $2`, [user.id, ws.id]);

    // Leads mẫu
    const leadsSeed = [
      ['Nguyễn Văn An', '0903111222', 'facebook', 'moi', 75, { loai: 'can_ho', khu_vuc: 'Quận 9', ngan_sach: '2-3 tỷ' }],
      ['Trần Thị Bích', '0903222333', 'tiktok', 'moi', 60, { loai: 'can_ho', khu_vuc: 'Thủ Đức', ngan_sach: '1.5-2 tỷ' }],
      ['Lê Hoàng Cường', '0903333444', 'referral', 'da_lien_he', 70, { loai: 'nha_pho', khu_vuc: 'Quận 9', ngan_sach: '4-5 tỷ' }],
      ['Phạm Thị Dung', '0903444555', 'website', 'da_lien_he', 55, { loai: 'can_ho', khu_vuc: 'Quận 2', ngan_sach: '3-4 tỷ' }],
      ['Hoàng Văn Em', '0903555666', 'facebook', 'dang_tu_van', 80, { loai: 'can_ho', khu_vuc: 'Quận 9', ngan_sach: '2.5-3.5 tỷ' }],
    ];
    const leadIds = {};
    for (const [name, phone, source, status, score, demand] of leadsSeed) {
      const r = (await client.query(
        `INSERT INTO leads (full_name, phone, zalo, source, demand, status, score, assigned_to)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [name, phone, phone, source, JSON.stringify(demand), status, score, user.id]
      )).rows[0];
      leadIds[name] = r.id;
      await client.query(
        `INSERT INTO activities (lead_id, user_id, type, content) VALUES ($1, $2, 'ghi_chu', 'Tạo lead mới')`,
        [r.id, user.id]
      );
    }

    // Lịch chăm sóc mẫu
    await client.query(
      `INSERT INTO follow_ups (lead_id, assigned_to, title, due_at, note, status)
       VALUES ($1, $2, 'Gọi tư vấn lần đầu', now() + interval '2 hours', 'Khách mới từ Facebook', 'pending')`,
      [leadIds['Nguyễn Văn An'], user.id]
    );
    await client.query(
      `INSERT INTO follow_ups (lead_id, assigned_to, title, due_at, note, status)
       VALUES ($1, $2, 'Gọi lại báo giá mới', now() - interval '1 day', 'Quá hạn', 'pending')`,
      [leadIds['Lê Hoàng Cường'], user.id]
    );

    // Dự án + giỏ hàng mẫu
    const pr = (await client.query(
      `INSERT INTO projects (name, investor, location, legal_status, status)
       VALUES ('Vinhomes Grand Park', 'Vinhomes', 'TP. Thủ Đức, TP.HCM', 'day_du', 'dang_ban')
       RETURNING id`
    )).rows[0];
    await client.query(
      `INSERT INTO documents (owner_type, owner_id, doc_type, title, file_url)
       VALUES ('project', $1, 'giay_phep_xd', 'Giấy phép xây dựng', 'Tài liệu pháp lý dự án (bản scan)')`,
      [pr.id]
    );
    const prop = (await client.query(
      `INSERT INTO properties (project_id, code, type, area, bedrooms, floor, price, status)
       VALUES ($1, 'S1.02-15A08', 'can_ho', 68.5, 2, 15, 3200000000, 'trong')
       RETURNING id`,
      [pr.id]
    )).rows[0];

    // Thông báo mẫu
    await client.query(
      `INSERT INTO notifications (user_id, type, title, body)
       VALUES ($1, 'lead_assigned', 'Lead mới từ Facebook', 'Nguyễn Văn An vừa để lại thông tin, nhu cầu căn hộ Quận 9')`,
      [user.id]
    );

    // Ví AI demo: 1000 credit cho workspace trong tháng hiện tại
    const period = new Date().toISOString().slice(0, 7);
    await client.query(
      `INSERT INTO ai_quotas (workspace_id, period, credits_total, credits_used, credits_bonus)
       VALUES ($1, $2, 1000, 0, 0)`,
      [ws.id, period]
    );

    await client.query('COMMIT');
    console.log('Seed xong: 1 workspace, 1 sale (0901234567/demo123456), 5 leads, 2 lịch, 1 dự án, 1 căn, 1 thông báo.');
    console.log('Căn mẫu:', prop.id);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[seed] lỗi:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
