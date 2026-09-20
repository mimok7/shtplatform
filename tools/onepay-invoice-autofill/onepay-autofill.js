// OnePay Invoice 작성 화면의 빈 고객·금액 필드를 매니저 데이터로 자동 입력합니다.

(() => {
  const PAYLOAD_STORAGE_KEY = 'sht_onepay_invoice_payload';
  const LINK_STORAGE_KEY = 'sht_onepay_invoice_link';
  const PANEL_ID = 'sht-onepay-autofill-panel';
  const LOGIN_PATH = '/auth-invoice/';
  const RETRY_LIMIT = 30;
  const RETRY_DELAY_MS = 1000;

  const normalize = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9가-힣]+/g, ' ')
    .trim();

  const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const normalizePaymentUrl = (value) => {
    try {
      const cleaned = String(value || '')
        .replace(/&amp;/g, '&')
        .replace(/[),.;]+$/, '')
        .trim();
      const url = new URL(cleaned, location.href);
      if (url.protocol !== 'https:' || url.hostname !== 'onepay.vn') return '';
      if (url.pathname !== '/invoice-pay/payment.op' || !url.searchParams.get('i')) return '';
      return url.toString();
    } catch {
      return '';
    }
  };

  const findPaymentUrl = () => {
    const candidates = [
      location.href,
      ...Array.from(document.querySelectorAll('a[href]')).map((item) => item.getAttribute('href')),
      ...Array.from(document.querySelectorAll('input, textarea')).map((item) => item.value),
    ];
    const bodyMatches = (document.body?.innerText || '').match(/https:\/\/onepay\.vn\/invoice-pay\/payment\.op\?[^\s"'<>]+/gi) || [];
    candidates.push(...bodyMatches);
    return candidates.map(normalizePaymentUrl).find(Boolean) || '';
  };

  const capturePaymentLink = async (payload) => {
    const url = findPaymentUrl();
    if (!url || !payload.reference) return false;

    const capturedAt = Date.now();
    await chrome.storage.local.set({
      [LINK_STORAGE_KEY]: {
        url,
        reference: payload.reference,
        capturedAt,
        expiresAt: Math.min(payload.expiresAt, capturedAt + 2 * 60 * 60 * 1000),
      },
    });
    renderPanel(payload, '결제 링크를 확인했습니다. 매니저 화면에서 링크 복사를 눌러 주세요.', 'success');
    return true;
  };

  const visibleControls = () => Array.from(document.querySelectorAll('input, textarea, select'))
    .filter((control) => {
      if (!(control instanceof HTMLElement)) return false;
      if (control.matches('[type="hidden"], [type="password"], [disabled], [readonly]')) return false;
      const style = window.getComputedStyle(control);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });

  const describeControl = (control) => {
    const parts = [
      control.id,
      control.getAttribute('name'),
      control.getAttribute('placeholder'),
      control.getAttribute('aria-label'),
      control.getAttribute('data-label'),
    ];
    if (control.id) {
      const escapedId = window.CSS?.escape ? window.CSS.escape(control.id) : control.id.replace(/"/g, '\\"');
      const label = document.querySelector(`label[for="${escapedId}"]`);
      if (label) parts.push(label.textContent);
    }
    const wrappingLabel = control.closest('label');
    if (wrappingLabel) parts.push(wrappingLabel.textContent);
    let sibling = control.previousElementSibling;
    for (let index = 0; sibling && index < 2; index += 1, sibling = sibling.previousElementSibling) {
      parts.push(sibling.textContent);
    }
    const parentText = control.parentElement?.textContent || '';
    if (parentText.length <= 180) parts.push(parentText);
    return normalize(parts.filter(Boolean).join(' '));
  };

  const scoreControl = (control, patterns, exclusions = []) => {
    const descriptor = describeControl(control);
    if (!descriptor || exclusions.some((pattern) => descriptor.includes(normalize(pattern)))) return -1;
    let score = 0;
    patterns.forEach((pattern, index) => {
      const normalizedPattern = normalize(pattern);
      if (!normalizedPattern || !descriptor.includes(normalizedPattern)) return;
      score = Math.max(score, 100 - index * 3 + (descriptor === normalizedPattern ? 40 : 0));
    });
    return score;
  };

  const findControl = (patterns, exclusions = [], predicate = () => true) => visibleControls()
    .filter(predicate)
    .map((control) => ({ control, score: scoreControl(control, patterns, exclusions) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)[0]?.control || null;

  const setControlValue = (control, value) => {
    if (!control || value === undefined || value === null || String(value).trim() === '') return false;
    const currentValue = String(control.value || '').trim();
    if (!(control instanceof HTMLSelectElement) && currentValue && !/^0(?:\.0+)?$/.test(currentValue)) return false;

    if (control instanceof HTMLSelectElement) {
      const wanted = normalize(value);
      const option = Array.from(control.options).find((item) => {
        const optionText = normalize(`${item.value} ${item.textContent}`);
        return optionText === wanted || optionText.includes(wanted);
      });
      if (!option) return false;
      if (control.value === option.value) return false;
      control.value = option.value;
    } else {
      const prototype = control instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (setter) setter.call(control, String(value));
      else control.value = String(value);
    }

    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    control.style.outline = '2px solid #16a34a';
    control.style.outlineOffset = '2px';
    return true;
  };

  const renderPanel = (payload, message, status = 'ready') => {
    let host = document.getElementById(PANEL_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = PANEL_ID;
      host.style.position = 'fixed';
      host.style.right = '18px';
      host.style.bottom = '18px';
      host.style.zIndex = '2147483647';
      document.documentElement.appendChild(host);
    }
    const root = host.shadowRoot || host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        .panel{width:320px;padding:16px;border-radius:14px;background:#fff;color:#172033;font:13px/1.5 Arial,sans-serif;box-shadow:0 12px 36px rgba(15,23,42,.28);border:1px solid #dbe2ea}
        .title{font-weight:800;font-size:15px;margin-bottom:8px;color:#0f766e}.amount{font-weight:800;text-align:right;font-size:17px;margin:8px 0}.message{padding:9px 10px;border-radius:8px;background:${status === 'success' ? '#ecfdf5' : '#f8fafc'};color:#334155}.actions{display:flex;gap:8px;margin-top:11px}button{border:0;border-radius:8px;padding:8px 11px;font-weight:700;cursor:pointer}.retry{background:#0f766e;color:#fff}.close{background:#e2e8f0;color:#334155;margin-left:auto}.note{font-size:11px;color:#64748b;margin-top:8px}
      </style>
      <div class="panel">
        <div class="title">Stay Halong OnePay 자동입력</div>
        <div>${escapeHtml(payload.customerName)}</div>
        <div class="amount">${Number(payload.amount).toLocaleString('en-US')} VND</div>
        <div class="message">${escapeHtml(message)}</div>
        <div class="actions"><button class="retry">현재 화면 다시 입력</button><button class="close">닫기</button></div>
        <div class="note">최종 발행 또는 전송 버튼은 담당자가 내용을 확인한 뒤 직접 눌러야 합니다.</div>
      </div>`;
    root.querySelector('.retry')?.addEventListener('click', () => fillCurrentPage(true));
    root.querySelector('.close')?.addEventListener('click', () => host.remove());
  };

  const fillCurrentPage = async (manual = false) => {
    const stored = await chrome.storage.local.get(PAYLOAD_STORAGE_KEY);
    const payload = stored[PAYLOAD_STORAGE_KEY];
    if (!payload) return false;
    if (!payload.expiresAt || payload.expiresAt < Date.now()) {
      await chrome.storage.local.remove([PAYLOAD_STORAGE_KEY, LINK_STORAGE_KEY]);
      return false;
    }

    if (await capturePaymentLink(payload)) return true;

    if (location.pathname.includes(LOGIN_PATH)) {
      renderPanel(payload, '로그인 후 인보이스 작성 화면으로 이동하면 자동 입력됩니다.');
      return false;
    }

    const results = [];
    const usedControls = new Set();
    const fill = (key, patterns, value, exclusions = [], predicate) => {
      const control = findControl(
        patterns,
        exclusions,
        (candidate) => !usedControls.has(candidate) && (!predicate || predicate(candidate)),
      );
      if (setControlValue(control, value)) {
        usedControls.add(control);
        results.push(key);
      }
    };

    fill('고객명', ['customer name', 'customername', 'customer_name', 'full name', 'customer full name', 'ten khach hang', 'ho ten'], payload.customerName);
    fill('이메일', ['customer email', 'customeremail', 'customer_email', 'email address', 'email'], payload.customerEmail);
    fill('전화번호', ['customer phone', 'customerphone', 'customer_phone', 'phone number', 'mobile', 'dien thoai'], payload.customerPhone);
    fill('인보이스 번호', ['invoice ref', 'invoice reference', 'invoice no', 'order ref', 'order reference', 'order info', 'invoice id', 'ma hoa don'], payload.reference);
    fill('통화', ['currency', 'currency code', 'loai tien'], payload.currency, [], (control) => control instanceof HTMLSelectElement);
    fill('설명', ['item description', 'item name', 'product name', 'service name', 'order description', 'description', 'noi dung'], payload.description, ['merchant description']);
    fill('수량', ['quantity', 'qty', 'so luong'], 1, [], (control) => control instanceof HTMLInputElement);

    const unitPrice = findControl(
      ['unit price', 'price per unit', 'item price', 'don gia'],
      ['exchange rate', 'tax', 'fee'],
      (control) => !usedControls.has(control) && control instanceof HTMLInputElement,
    );
    if (setControlValue(unitPrice, payload.amount)) {
      usedControls.add(unitPrice);
      results.push('단가');
    } else {
      fill(
        '금액',
        ['payment amount', 'invoice amount', 'total amount', 'amount', 'so tien'],
        payload.amount,
        ['tax', 'fee', 'exchange', 'paid amount'],
        (control) => control instanceof HTMLInputElement,
      );
    }

    if (results.length > 0) {
      renderPanel(payload, `${results.join(', ')} 필드를 자동 입력했습니다.`, 'success');
      return true;
    }
    if (manual) renderPanel(payload, '현재 화면에서 입력할 인보이스 필드를 찾지 못했습니다. 인보이스 신규 작성 화면으로 이동해 주세요.');
    else renderPanel(payload, '인보이스 신규 작성 화면으로 이동하면 빈 필드에 자동 입력됩니다.');
    return false;
  };

  let retries = 0;
  const retry = async () => {
    const filled = await fillCurrentPage(false);
    retries += 1;
    if (!filled && retries < RETRY_LIMIT) window.setTimeout(retry, RETRY_DELAY_MS);
  };
  retry();
})();
