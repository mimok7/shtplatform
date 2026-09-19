// 매니저에서 전달한 OnePay 인보이스 입력값을 브라우저에 잠시 보관합니다.

const STORAGE_KEY = 'sht_onepay_invoice_payload';
const MESSAGE_TYPE = 'SHT_ONEPAY_INVOICE_PREPARE';
const ALLOWED_ORIGINS = new Set([
  'https://manager.stayhalong.com',
  'https://manag.stayhalong.com',
  'http://localhost:3001',
  'http://localhost:3005',
]);
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

const isValidPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return false;
  if (typeof payload.customerName !== 'string' || !payload.customerName.trim()) return false;
  if (!Number.isFinite(payload.amount) || payload.amount <= 0) return false;
  if (payload.amount > 999999999999) return false;
  return true;
};

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  let origin = '';
  try {
    origin = new URL(sender.url || '').origin;
  } catch {
    sendResponse({ ok: false, error: 'invalid_sender' });
    return false;
  }

  if (!ALLOWED_ORIGINS.has(origin) || message?.type !== MESSAGE_TYPE || !isValidPayload(message.payload)) {
    sendResponse({ ok: false, error: 'invalid_request' });
    return false;
  }

  const now = Date.now();
  const stored = {
    customerName: String(message.payload.customerName).trim().slice(0, 120),
    customerEmail: String(message.payload.customerEmail || '').trim().slice(0, 180),
    customerPhone: String(message.payload.customerPhone || '').trim().slice(0, 40),
    amount: Math.round(Number(message.payload.amount)),
    currency: 'VND',
    reference: String(message.payload.reference || '').trim().slice(0, 40),
    description: String(message.payload.description || '').trim().slice(0, 500),
    preparedAt: now,
    expiresAt: now + MAX_AGE_MS,
  };

  chrome.storage.local.set({ [STORAGE_KEY]: stored }, () => {
    const error = chrome.runtime.lastError;
    sendResponse(error ? { ok: false, error: error.message } : { ok: true });
  });
  return true;
});
