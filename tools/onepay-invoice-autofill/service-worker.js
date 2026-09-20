// 매니저에서 전달한 OnePay 인보이스 입력값을 브라우저에 잠시 보관합니다.

const PAYLOAD_STORAGE_KEY = 'sht_onepay_invoice_payload';
const LINK_STORAGE_KEY = 'sht_onepay_invoice_link';
const PREPARE_MESSAGE_TYPE = 'SHT_ONEPAY_INVOICE_PREPARE';
const GET_LINK_MESSAGE_TYPE = 'SHT_ONEPAY_INVOICE_GET_LINK';
const STATUS_MESSAGE_TYPE = 'SHT_ONEPAY_EXTENSION_STATUS';
const EXTENSION_VERSION = '1.2.0';
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

const isValidPaymentUrl = (value) => {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:'
      && url.hostname === 'onepay.vn'
      && url.pathname === '/invoice-pay/payment.op'
      && Boolean(url.searchParams.get('i'));
  } catch {
    return false;
  }
};

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  let origin = '';
  try {
    origin = new URL(sender.url || '').origin;
  } catch {
    sendResponse({ ok: false, error: 'invalid_sender' });
    return false;
  }

  if (!ALLOWED_ORIGINS.has(origin)) {
    sendResponse({ ok: false, error: 'invalid_request' });
    return false;
  }

  if (message?.type === STATUS_MESSAGE_TYPE) {
    sendResponse({ ok: true, version: EXTENSION_VERSION });
    return false;
  }

  if (message?.type === GET_LINK_MESSAGE_TYPE) {
    const requestedReference = String(message.reference || '').trim();
    if (!requestedReference) {
      sendResponse({ ok: false, error: 'invalid_reference' });
      return false;
    }

    chrome.storage.local.get(LINK_STORAGE_KEY, (result) => {
      const error = chrome.runtime.lastError;
      const link = result?.[LINK_STORAGE_KEY];
      if (error) {
        sendResponse({ ok: false, error: error.message });
        return;
      }
      if (!link || link.expiresAt < Date.now() || link.reference !== requestedReference || !isValidPaymentUrl(link.url)) {
        sendResponse({ ok: false, error: 'link_not_found' });
        return;
      }
      sendResponse({ ok: true, link });
    });
    return true;
  }

  if (message?.type !== PREPARE_MESSAGE_TYPE || !isValidPayload(message.payload)) {
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

  chrome.storage.local.remove(LINK_STORAGE_KEY, () => {
    const removeError = chrome.runtime.lastError;
    if (removeError) {
      sendResponse({ ok: false, error: removeError.message });
      return;
    }
    chrome.storage.local.set({ [PAYLOAD_STORAGE_KEY]: stored }, () => {
      const error = chrome.runtime.lastError;
      sendResponse(error ? { ok: false, error: error.message } : { ok: true });
    });
  });
  return true;
});
