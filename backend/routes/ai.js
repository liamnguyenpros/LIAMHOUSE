/**
 * AI Gateway — LiamHouse GĐ1 (skeleton)
 *
 * Mọi tính năng AI đi qua gateway duy nhất này. Đơn vị tính: CREDIT.
 *  - Hết credit → 402 Quota Exceeded + payload upsell
 *  - Mỗi lần trừ đều ghi ai_usage_logs (kèm tokens_used, cost_usd để nội bộ
 *    theo dõi biên lợi nhuận — mock = 0, gọi thật thì cập nhật từ provider)
 *  - Cache phân tích: hook checkAnalysisCache — hit thì không trừ 2 lần
 */
import { Router } from 'express';
import { q } from '../db.js';
import { auth } from '../middleware/auth.js';
import { routeFor, callModel, checkAnalysisCache, FEATURE_ROUTES } from '../ai/modelRouter.js';
import { buildQaContext, buildQaSystemPrompt } from '../ai/contextBuilder.js';

const router = Router();
router.use(auth);

const currentPeriod = () => new Date().toISOString().slice(0, 7); // YYYY-MM

async function getWallet(workspaceId) {
  const period = currentPeriod();
  let { rows } = await q(
    'SELECT * FROM ai_quotas WHERE workspace_id = $1 AND period = $2',
    [workspaceId, period]
  );
  if (!rows.length) {
    ({ rows } = await q(
      `INSERT INTO ai_quotas (workspace_id, period, credits_total, credits_used, credits_bonus)
       VALUES ($1, $2, 0, 0, 0) RETURNING *`,
      [workspaceId, period]
    ));
  }
  return rows[0];
}

const balanceOf = (w) => w.credits_total + w.credits_bonus - w.credits_used;

async function getRate(aiFeature) {
  const { rows } = await q('SELECT credits FROM ai_credit_rates WHERE ai_feature = $1', [aiFeature]);
  return rows.length ? rows[0].credits : null;
}

function walletPayload(wallet, plan) {
  return {
    period: wallet.period,
    plan,
    credits_total: wallet.credits_total,
    credits_bonus: wallet.credits_bonus,
    credits_used: wallet.credits_used,
    balance: balanceOf(wallet),
    status: wallet.status,
  };
}

// ---------- POST /ai/ask ----------
router.post('/ask', async (req, res) => {
  const { feature, input } = req.body || {};
  if (!feature || !FEATURE_ROUTES[feature]) {
    return res.status(400).json({
      error: 'unknown_feature',
      hint: 'feature phải là một ai_feature hợp lệ',
      valid_features: Object.keys(FEATURE_ROUTES),
    });
  }
  try {
    const rate = await getRate(feature);
    if (rate === null) {
      return res.status(400).json({ error: 'no_rate_configured', feature });
    }

    // 1. Cache phân tích proactive: hit → không trừ credit 2 lần
    const cached = await checkAnalysisCache(req.user.workspace_id, feature, input);
    if (cached) {
      await q(
        `INSERT INTO ai_usage_logs (workspace_id, user_id, ai_feature, credits, initiated_by, cache_hit)
         VALUES ($1, $2, $3, 0, 'user', true)`,
        [req.user.workspace_id, req.user.id, feature]
      );
      return res.json({ ok: true, feature, credits_charged: 0, cache_hit: true, result: cached });
    }

    // 2. Kiểm tra ví (transaction để chống trừ trùng khi gọi đồng thời)
    const charge = await q('BEGIN').then(async () => {
      try {
        const wallet = await getWallet(req.user.workspace_id);
        const bal = balanceOf(wallet);
        if (bal < rate) {
          await q('ROLLBACK');
          return { denied: true, balance: bal, rate };
        }
        const upd = await q(
          `UPDATE ai_quotas SET credits_used = credits_used + $1, updated_at = now()
           WHERE id = $2 RETURNING *`,
          [rate, wallet.id]
        );
        const log = await q(
          `INSERT INTO ai_usage_logs
             (workspace_id, user_id, ai_feature, credits, tokens_used, cost_usd, initiated_by, cache_hit)
           VALUES ($1, $2, $3, $4, 0, 0, 'user', false) RETURNING id`,
          [req.user.workspace_id, req.user.id, feature, rate]
        );
        await q('COMMIT');
        return { denied: false, wallet: upd.rows[0], logId: log.rows[0].id };
      } catch (e) {
        await q('ROLLBACK');
        throw e;
      }
    });

    if (charge.denied) {
      return res.status(402).json({
        error: 'quota_exceeded',
        feature,
        needed: charge.rate,
        balance: charge.balance,
        upsell: {
          message: 'Hết credit AI tháng này. Nạp thêm để tiếp tục dùng.',
          topup_url_hint: '/api/ai/quota/topup',
          topup_hint: "POST /api/ai/quota/topup với body {\"credits\": <số>}",
        },
      });
    }

    // 3. Gọi model qua router (mock nếu chưa có key)
    const route = routeFor(feature);
    let messages;
    if (feature === 'qa_ask') {
      // Inject dữ liệu thật của user vào system prompt
      const ctx = await buildQaContext(req.user.workspace_id, req.user.id);
      messages = [
        { role: 'system', content: buildQaSystemPrompt(ctx) },
        { role: 'user', content: typeof input === 'string' ? input : JSON.stringify(input ?? '') },
      ];
    } else {
      messages = [
        { role: 'user', content: typeof input === 'string' ? input : JSON.stringify(input ?? '') },
      ];
    }
    const aiRes = await callModel(route, messages);

    // 4. Gọi thật → cập nhật tokens/cost để tính biên lợi nhuận nội bộ
    if (!aiRes.mock && aiRes.usage) {
      await q('UPDATE ai_usage_logs SET tokens_used = $1 WHERE id = $2', [
        aiRes.usage.total_tokens ?? null,
        charge.logId,
      ]);
      // cost_usd: tính khi có bảng giá provider (GĐ sau). Giữ 0 ở skeleton.
    }

    return res.json({
      ok: true,
      feature,
      credits_charged: rate,
      balance: balanceOf(charge.wallet),
      mock: aiRes.mock === true,
      model_routed: aiRes.model_routed,
      result: aiRes.text,
    });
  } catch (err) {
    console.error('[ai:ask]', err.message);
    return res.status(500).json({ error: 'ai_gateway_error' });
  }
});

// ---------- GET /ai/quota ----------
router.get('/quota', async (req, res) => {
  try {
    const wallet = await getWallet(req.user.workspace_id);
    const { rows } = await q('SELECT plan FROM workspaces WHERE id = $1', [req.user.workspace_id]);
    return res.json({ ok: true, quota: walletPayload(wallet, rows[0]?.plan ?? null) });
  } catch (err) {
    console.error('[ai:quota]', err.message);
    return res.status(500).json({ error: 'ai_gateway_error' });
  }
});

// ---------- POST /ai/quota/topup ----------
router.post('/quota/topup', async (req, res) => {
  const credits = Number(req.body?.credits);
  if (!Number.isInteger(credits) || credits <= 0 || credits > 1000000) {
    return res.status(400).json({ error: 'invalid_credits', hint: 'credits phải là số nguyên dương' });
  }
  try {
    const period = currentPeriod();
    const { rows } = await q(
      `INSERT INTO ai_quotas (workspace_id, period, credits_total, credits_used, credits_bonus)
       VALUES ($1, $2, $3, 0, 0)
       ON CONFLICT (workspace_id, period)
       DO UPDATE SET credits_total = ai_quotas.credits_total + EXCLUDED.credits_total,
                     updated_at = now()
       RETURNING *`,
      [req.user.workspace_id, period, credits]
    );
    await q(
      `INSERT INTO ai_usage_logs (workspace_id, user_id, ai_feature, credits, initiated_by, ref_type)
       VALUES ($1, $2, 'qa_ask', 0, 'user', 'topup')`,
      [req.user.workspace_id, req.user.id]
    );
    const { rows: ws } = await q('SELECT plan FROM workspaces WHERE id = $1', [req.user.workspace_id]);
    return res.json({ ok: true, topped_up: credits, quota: walletPayload(rows[0], ws[0]?.plan ?? null) });
  } catch (err) {
    console.error('[ai:topup]', err.message);
    return res.status(500).json({ error: 'ai_gateway_error' });
  }
});

// ---------- GET /ai/usage-logs ----------
router.get('/usage-logs', async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  try {
    const { rows } = await q(
      `SELECT id, ai_feature, credits, tokens_used, cost_usd, initiated_by, cache_hit, ref_type, created_at
       FROM ai_usage_logs
       WHERE workspace_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [req.user.workspace_id, limit]
    );
    return res.json({ ok: true, count: rows.length, logs: rows });
  } catch (err) {
    console.error('[ai:usage-logs]', err.message);
    return res.status(500).json({ error: 'ai_gateway_error' });
  }
});

export default router;
