// 모바일 송장 항목 복사와 OnePay 일괄입력 코드의 분배·실행 제한을 검증한다.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const source = readFileSync(path.join(__dirname, '../apps/mobile/lib/onepayInvoiceTransfer.ts'), 'utf8');
const moduleContext = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
}).outputText, moduleContext);
const { buildOnepayAutofillBookmark, buildOnepaySafariShortcutScript, copyAndOpenOnepayInvoice, serializeOnepayInvoice, getOnepayInvoiceFields, formatOnepayExpiry } = moduleContext.exports;
const invoice = {
  customerName: '테스트 고객', customerEmail: 'invoice-test@example.com',
  reference: 'TEST20260922CUSTOMER', description: '2026.09.22. 테스트 고객 - 크루즈',
  amount: 1234567, expiresAt: '2099-09-22T03:30:00Z',
};

async function runCode(data = invoice, options = {}) {
  const controls = new Map();
  const alerts = [];
  let confirmations = 0;
  let prompts = 0;
  let clipboardReads = 0;
  const completions = [];
  const notice = { style: {}, setAttribute() {}, remove() {}, textContent: '' };
  class Control {
    constructor() { this.currentValue = options.empty ? '' : '기존 입력값'; this.events = []; this.disabled = false; }
    dispatchEvent(event) { this.events.push(event.type); }
  }
  class Input extends Control {}
  class Textarea extends Control {}
  class Select extends Control {}
  for (const type of [Input, Textarea, Select]) {
    Object.defineProperty(type.prototype, 'value', {
      get() { return this.currentValue; }, set(value) { this.currentValue = value; },
    });
  }
  for (const field of getOnepayInvoiceFields(data)) {
    const type = ['invoiceType', 'comCurrencyExchange'].includes(field.id) ? Select : field.id === 'orderNote' ? Textarea : Input;
    const control = new type();
    control.options = [{ value: field.value }];
    controls.set(field.id, control);
  }
  if (options.missing) controls.delete(options.missing);
  if (options.disabled) controls.get(options.disabled).disabled = true;
  if (options.unsupportedCurrency) controls.get('comCurrencyExchange').options = [{ value: 'USD' }];
  if (options.rejectAmount) controls.get('strAmount').dispatchEvent = function () { this.currentValue = '0'; };
  const context = {
    location: options.location || { origin: 'https://onepay.vn', pathname: '/invoice/create_order.op' },
    document: { getElementById: (id) => controls.get(id), createElement: () => notice, body: { appendChild() {} } },
    HTMLInputElement: Input, HTMLTextAreaElement: Textarea, HTMLSelectElement: Select,
    Event: class { constructor(type) { this.type = type; } },
    alert: (message) => alerts.push(message),
    prompt: () => { prompts += 1; return Object.hasOwn(options, 'paste') ? options.paste : serializeOnepayInvoice(data); },
    navigator: { clipboard: { readText: async () => {
      clipboardReads += 1;
      if (!options.clipboard) throw new Error('NotAllowedError');
      return Object.hasOwn(options, 'paste') ? options.paste : serializeOnepayInvoice(data);
    } } },
    setTimeout() {},
    confirm: () => { confirmations += 1; return options.confirm !== false; },
    completion: (result) => completions.push(result),
  };
  const code = options.shortcut
    ? buildOnepaySafariShortcutScript()
    : buildOnepayAutofillBookmark().slice('javascript:void'.length);
  await vm.runInNewContext(code, context, { timeout: 1000 });
  return { controls, alerts, confirmations, context, notice, prompts, clipboardReads, completions };
}

test('개별 복사 값은 금액 숫자와 베트남 만료일을 사용한다', async () => {
  const fields = getOnepayInvoiceFields(invoice);
  assert.equal(fields.find((f) => f.id === 'strAmount').value, '1234567');
  assert.equal(formatOnepayExpiry('2026-09-21T18:30:00Z'), '22/09/26 01:30 AM');
  assert.equal(formatOnepayExpiry('invalid'), '');
});

test('전체 정보를 한 칸에 넣지 않고 8개 항목에 각각 전달하고 변경 이벤트를 보낸다', async () => {
  const result = await runCode();
  for (const field of getOnepayInvoiceFields(invoice)) {
    assert.equal(result.controls.get(field.id).value, field.value, field.label);
    assert.deepEqual(result.controls.get(field.id).events, ['input', 'change', 'blur']);
  }
  assert.equal(result.confirmations, 1);
  assert.match(result.notice.textContent, /송장 8개 항목 입력 완료/);
});

test('고객 데이터의 따옴표·줄바꿈·코드는 실행되지 않고 값으로 전달된다', async () => {
  const data = { ...invoice, description: '한글 "quote" \\ 줄바꿈\n</script>\u2028\u2029\');globalThis.injected=true;//' };
  const result = await runCode(data);
  assert.equal(result.controls.get('orderNote').value, data.description);
  assert.equal(result.context.injected, undefined);
  assert.ok(!buildOnepayAutofillBookmark().includes('\n'));
  assert.ok(!buildOnepayAutofillBookmark().includes(data.customerEmail));
});

test('다른 사이트·로그인·결제 화면에서는 어떤 항목도 변경하지 않는다', async () => {
  for (const location of [
    { origin: 'https://onepay.vn.evil.example', pathname: '/invoice/create_order.op' },
    { origin: 'http://onepay.vn', pathname: '/invoice/create_order.op' },
    { origin: 'https://onepay.vn', pathname: '/auth-invoice/login' },
    { origin: 'https://onepay.vn', pathname: '/invoice-pay/payment.op' },
  ]) {
    const result = await runCode(invoice, { location });
    assert.equal(result.confirmations, 0);
    assert.equal(result.clipboardReads, 0);
    assert.ok([...result.controls.values()].every((c) => c.events.length === 0));
  }
});

test('Safari에서 클립보드를 허용하면 붙여넣기 안내창과 추가 확인 없이 빈 송장을 모두 채운다', async () => {
  const result = await runCode(invoice, { clipboard: true, empty: true });
  assert.equal(result.clipboardReads, 1);
  assert.equal(result.prompts, 0);
  assert.equal(result.confirmations, 0);
  assert.equal(result.alerts.length, 0);
  for (const field of getOnepayInvoiceFields(invoice)) assert.equal(result.controls.get(field.id).value, field.value);
  assert.match(result.notice.textContent, /8개 항목 입력 완료/);
});

test('Safari가 클립보드를 차단하면 전체 붙여넣기 한 번으로 입력한다', async () => {
  const result = await runCode(invoice, { empty: true });
  assert.equal(result.prompts, 1);
  assert.equal(result.confirmations, 0);
  assert.equal(result.controls.get('customerEmail').value, invoice.customerEmail);
});

test('클립보드에 다른 내용이 있으면 기존 값을 건드리지 않는다', async () => {
  const result = await runCode(invoice, { clipboard: true, paste: '다른 복사 내용' });
  assert.equal(result.prompts, 0);
  assert.ok([...result.controls.values()].every((c) => c.events.length === 0));
});

test('Safari 공유 단축어는 completion으로 종료하며 팝업 함수나 지연 타이머를 사용하지 않는다', async () => {
  const code = buildOnepaySafariShortcutScript();
  assert.match(code, /completion\(/);
  for (const blocked of ['alert(', 'prompt(', 'confirm(', 'setTimeout(']) assert.equal(code.includes(blocked), false, blocked);
  assert.equal(code.startsWith('javascript:'), false);
});

test('Safari 공유 단축어는 빈 송장 8개 항목을 입력하고 성공 결과를 한 번 반환한다', async () => {
  const result = await runCode(invoice, { shortcut: true, clipboard: true, empty: true });
  assert.equal(result.clipboardReads, 1);
  assert.equal(result.completions.length, 1);
  assert.equal(result.completions[0].ok, true);
  assert.match(result.completions[0].message, /8개 항목 입력 완료/);
  for (const field of getOnepayInvoiceFields(invoice)) assert.equal(result.controls.get(field.id).value, field.value);
});

test('Safari 공유 단축어는 실행 위치·클립보드·기존값 오류를 completion으로 알리고 입력하지 않는다', async () => {
  const cases = [
    { location: { origin: 'https://example.com', pathname: '/invoice/create_order.op' }, clipboard: true, empty: true },
    { empty: true },
    { clipboard: true, paste: '다른 복사 내용', empty: true },
    { clipboard: true },
    { clipboard: true, empty: true, missing: 'strAmount' },
  ];
  for (const options of cases) {
    const result = await runCode(invoice, { ...options, shortcut: true });
    assert.equal(result.completions.length, 1);
    assert.equal(result.completions[0].ok, false);
    assert.ok([...result.controls.values()].every((control) => control.events.length === 0));
  }
});

test('Safari 공유 단축어에 삽입된 고객 문자열은 코드로 실행되지 않는다', async () => {
  const data = { ...invoice, description: "\\');globalThis.shortcutInjected=true;//" };
  const result = await runCode(data, { shortcut: true, clipboard: true, empty: true });
  assert.equal(result.completions[0].ok, true);
  assert.equal(result.context.shortcutInjected, undefined);
  assert.equal(result.controls.get('orderNote').value, data.description);
});

test('복사와 새 탭 생성을 사용자 동작 안에서 시작하고 복사 완료 후에만 OnePay로 이동한다', async () => {
  const events = [];
  let finishCopy;
  const tab = { opener: {}, closed: false, location: { replace(url) { events.push(url); } }, close() { events.push('close'); } };
  moduleContext.window = { open(url) { events.push(url); return tab; } };
  const pending = copyAndOpenOnepayInvoice(invoice, (value) => {
    assert.equal(JSON.parse(value).fields[6].value, String(invoice.amount));
    events.push('copy');
    return new Promise((resolve) => { finishCopy = resolve; });
  });
  assert.deepEqual(events, ['copy', 'about:blank']);
  assert.equal(tab.opener, null);
  finishCopy();
  assert.equal(await pending, true);
  assert.deepEqual(events, ['copy', 'about:blank', 'https://onepay.vn/invoice/create_order.op']);
});

test('팝업 차단은 복사를 유지하고 복사 실패는 빈 탭을 닫는다', async () => {
  moduleContext.window = { open() { return null; } };
  let copied = false;
  assert.equal(await copyAndOpenOnepayInvoice(invoice, async () => { copied = true; }), false);
  assert.equal(copied, true);
  let closed = false;
  moduleContext.window = { open() { return { close() { closed = true; } }; } };
  await assert.rejects(copyAndOpenOnepayInvoice(invoice, async () => { throw new Error('copy_failed'); }), /copy_failed/);
  assert.equal(closed, true);
});

test('만료·입력칸 누락·비활성·지원하지 않는 통화·사용자 취소 시 입력하지 않는다', async () => {
  for (const [data, options] of [
    [{ ...invoice, expiresAt: '2020-01-01T00:00:00Z' }, {}],
    [invoice, { missing: 'strAmount' }], [invoice, { disabled: 'customerName' }],
    [invoice, { unsupportedCurrency: true }], [invoice, { confirm: false }],
  ]) {
    const result = await runCode(data, options);
    assert.ok([...result.controls.values()].every((c) => c.events.length === 0));
  }
});

test('이메일이 없으면 이전 고객의 이메일을 남기지 않는다', async () => {
  const result = await runCode({ ...invoice, customerEmail: '' });
  assert.equal(result.controls.get('customerEmail').value, '');
});

test('OnePay가 금액을 거부하면 성공으로 안내하지 않는다', async () => {
  const result = await runCode(invoice, { rejectAmount: true });
  assert.match(result.alerts[0], /입력값 확인이 필요합니다: 금액/);
});

test('유효하지 않은 송장으로는 실행 코드를 생성하지 않는다', async () => {
  for (const values of [{ amount: 0 }, { amount: NaN }, { amount: -1 }, { reference: '' }, { customerName: '' }, { expiresAt: 'invalid' }]) {
    assert.throws(() => serializeOnepayInvoice({ ...invoice, ...values }), /invalid_invoice/);
  }
});

test('취소·일반 텍스트·잘못된 구조·허용하지 않는 입력칸은 변경하지 않는다', async () => {
  const changed = JSON.parse(serializeOnepayInvoice(invoice));
  changed.fields[2].id = 'password';
  for (const paste of [null, '', '고객명: 테스트', 'null', '{}', JSON.stringify(changed)]) {
    const result = await runCode(invoice, { paste });
    assert.equal(result.confirmations, 0);
    assert.ok([...result.controls.values()].every((c) => c.events.length === 0));
  }
});
