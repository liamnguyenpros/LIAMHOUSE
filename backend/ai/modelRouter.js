/**
 * AI Model Router — LiamHouse AI Gateway (GĐ1 skeleton)
 *
 * Mọi tính năng AI đi qua MỘT gateway duy nhất; client không bao giờ gọi
 * provider trực tiếp. Router chọn model theo độ khó tác vụ:
 *   - cheap  : hỏi đáp, tóm tắt, parse — rẻ, gọi nhiều
 *   - strong : chấm điểm cuộc gọi, báo cáo, dự báo, phát hiện bất thường
 *   - vision : OCR namecard / sổ đỏ
 *   - stt    : voice → text
 *
 * Tất cả provider đều qua interface OpenAI-compatible (base_url + api_key).
 * Chưa có key thật → callModel trả mock; chỉ cần set env là chạy thật,
 * không phải sửa code tính năng.
 *
 * Env vars (khi có key thật):
 *   OPENROUTER_API_KEY  — key dùng chung OpenRouter (fallback cho mọi tier)
 *   GEMINI_API_KEY      — key Google AI Studio (fallback, dùng endpoint OpenAI-compatible của Google)
 *   AI_CHEAP_MODEL / AI_CHEAP_BASE_URL / AI_CHEAP_API_KEY
 *   AI_STRONG_MODEL / AI_STRONG_BASE_URL / AI_STRONG_API_KEY
 *   AI_VISION_MODEL / AI_VISION_BASE_URL / AI_VISION_API_KEY
 *   AI_STT_MODEL   / AI_STT_BASE_URL   / AI_STT_API_KEY
 *
 * Thứ tự ưu tiên apiKey: AI_<TIER>_API_KEY → OPENROUTER_API_KEY → GEMINI_API_KEY.
 * Nếu key đến từ GEMINI_API_KEY và không có AI_<TIER>_BASE_URL riêng,
 * baseUrl mặc định là endpoint OpenAI-compatible của Google.
 */

const GEMINI_OPENAI_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai/';

function tierConfig(tier, defaultModel) {
  const up = tier.toUpperCase();
  const tierKey = process.env[`AI_${up}_API_KEY`] || '';
  const openrouterKey = process.env.OPENROUTER_API_KEY || '';
  const geminiKey = process.env.GEMINI_API_KEY || '';
  const apiKey = tierKey || openrouterKey || geminiKey;
  // Dùng endpoint Google khi key là Gemini và không có baseUrl custom
  const usingGemini = !tierKey && !openrouterKey && Boolean(geminiKey);
  const customBase = process.env[`AI_${up}_BASE_URL`] || '';
  return {
    tier,
    provider: usingGemini ? 'gemini' : 'openrouter',
    model: process.env[`AI_${up}_MODEL`] || defaultModel,
    baseUrl: customBase || (usingGemini ? GEMINI_OPENAI_BASE : 'https://openrouter.ai/api/v1'),
    apiKey,
  };
}

const TIERS = {
  cheap: () => tierConfig('cheap', 'gemini-2.0-flash'),
  strong: () => tierConfig('strong', 'gemini-2.0-flash'), // TODO: nâng lên bản Pro khi cần reasoning mạnh
  vision: () => tierConfig('vision', 'gemini-2.0-flash'),
  stt: () => tierConfig('stt', 'gemini-2.0-flash'), // TODO: model STT chuyên dụng
};

// ai_feature (enum trong DB) → tier. Tên tiếng Việt cũ giữ lại để tương thích.
export const FEATURE_ROUTES = {
  qa_ask: 'cheap',
  summarize: 'cheap',
  lead_parse: 'cheap',
  parse_tin_nhan: 'cheap',
  ghi_am_tom_tat: 'cheap',
  nhap_lieu_giong_noi: 'cheap',
  nhap_excel: 'cheap',
  doc_van_ban_phap_ly: 'cheap',
  voice_stt: 'stt',
  report: 'strong',
  call_score: 'strong',
  cham_diem_cuoc_goi: 'strong',
  tong_hop_bao_cao: 'strong',
  forecast: 'strong',
  anomaly: 'strong',
  du_bao_goi_y: 'strong',
  ocr_namecard: 'vision',
  ocr_redbook: 'vision',
  quet_namecard: 'vision',
  quet_so_do: 'vision',
};

export function routeFor(aiFeature) {
  const tierName = FEATURE_ROUTES[aiFeature];
  if (!tierName) return null;
  const cfg = TIERS[tierName]();
  return { ...cfg, hasKey: Boolean(cfg.apiKey) };
}

/**
 * Gọi model. Chưa có apiKey → trả mock (để dev/test không tốn tiền).
 * Có key → gọi thật qua OpenAI-compatible /chat/completions.
 */
export async function callModel(route, messages, opts = {}) {
  if (!route.hasKey) {
    return {
      mock: true,
      model_routed: route.model,
      provider: route.provider,
      tier: route.tier,
      text: `[MOCK] ${route.tier}/${route.model} — chưa cấu hình API key. Set GEMINI_API_KEY, OPENROUTER_API_KEY (hoặc AI_${route.tier.toUpperCase()}_API_KEY) để gọi thật.`,
      usage: null,
    };
  }
  const res = await fetch(`${route.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${route.apiKey}`,
    },
    body: JSON.stringify({
      model: route.model,
      messages,
      max_tokens: opts.maxTokens || 1024,
      temperature: opts.temperature ?? 0.3,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`[modelRouter] provider ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  return {
    mock: false,
    model_routed: route.model,
    provider: route.provider,
    tier: route.tier,
    text: data.choices?.[0]?.message?.content ?? '',
    usage: data.usage || null, // {prompt_tokens, completion_tokens, total_tokens}
  };
}

/**
 * Hook cache phân tích proactive (skeleton).
 * Thiết kế chốt: Q&A tái dùng cache phân tích → cache hit không trừ credit 2 lần.
 * GĐ1: stub luôn trả null. GĐ sau: tra bảng phân tích theo (workspace_id, feature, input_hash).
 */
export async function checkAnalysisCache(_workspaceId, _aiFeature, _input) {
  return null; // TODO GĐ2: implement cache thật
}
