// 모바일 송장 정보를 OnePay 입력값과 항목별 일괄입력 코드로 변환한다.
export type InvoiceTransfer = {
  customerName: string;
  customerEmail: string;
  reference: string;
  description: string;
  amount: number;
  expiresAt: string;
};

export function formatOnepayExpiry(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')} ${get('dayPeriod')}`;
}

export function getOnepayInvoiceFields(invoice: InvoiceTransfer) {
  return [
    { id: 'invoiceType', label: '송장 유형', value: 'IOQ', display: 'IOQ' },
    { id: 'comCurrencyExchange', label: '통화', value: 'VND', display: 'VND' },
    { id: 'customerName', label: '고객명', value: invoice.customerName, display: invoice.customerName },
    { id: 'customerEmail', label: '이메일', value: invoice.customerEmail, display: invoice.customerEmail },
    { id: 'invoiceRef', label: '참조번호', value: invoice.reference, display: invoice.reference },
    { id: 'orderNote', label: '설명', value: invoice.description, display: invoice.description },
    { id: 'strAmount', label: '금액', value: String(invoice.amount), display: `${invoice.amount.toLocaleString()} VND` },
    { id: 'strEndDate', label: '만료일 (베트남 시간)', value: formatOnepayExpiry(invoice.expiresAt), display: formatOnepayExpiry(invoice.expiresAt) },
  ];
}

export function serializeOnepayInvoice(invoice: InvoiceTransfer) {
  if (!Number.isFinite(invoice.amount) || invoice.amount <= 0
    || !invoice.customerName.trim() || !invoice.reference.trim()
    || !Number.isFinite(Date.parse(invoice.expiresAt))) {
    throw new Error('invalid_invoice');
  }
  return JSON.stringify({
    format: 'sht-onepay-invoice-v1',
    fields: getOnepayInvoiceFields(invoice).map(({ id, label, value }) => ({ id, label, value })),
    expiresAt: invoice.expiresAt,
  });
}

export async function copyAndOpenOnepayInvoice(invoice: InvoiceTransfer, copy: (value: string) => Promise<void>) {
  // Safari의 사용자 동작이 유효할 때 복사와 새 탭 생성을 모두 시작한다.
  const copying = copy(serializeOnepayInvoice(invoice));
  let tab: Window | null = null;
  try {
    tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
  } catch {
    // 팝업이 차단되어도 복사를 마치고 별도 열기 버튼으로 이어간다.
  }
  try {
    await copying;
    if (!tab || tab.closed) return false;
    tab.location.replace('https://onepay.vn/invoice/create_order.op');
    return true;
  } catch (error) {
    tab?.close();
    throw error;
  }
}

export function buildOnepaySafariShortcutScript() {
  // Apple 단축어의 "웹 페이지에서 JavaScript 실행" 작업에서 사용하며 모든 경로를 completion으로 종료한다.
  return `(async function(){
    var finish=function(ok,message){
      var notice=document.getElementById('sht-onepay-shortcut-result');
      if(!notice){notice=document.createElement('div');notice.id='sht-onepay-shortcut-result';document.body.appendChild(notice);}
      notice.setAttribute('role','status');
      notice.style.cssText='position:fixed;bottom:16px;left:16px;right:16px;z-index:2147483647;padding:14px;border:1px solid '+(ok?'#86efac':'#fca5a5')+';border-radius:12px;background:'+(ok?'#f0fdf4':'#fef2f2')+';color:'+(ok?'#14532d':'#991b1b')+';font:14px/1.5 sans-serif';
      notice.textContent=message;
      completion({ok:ok,message:message});
    };
    try{
      if(location.origin!=='https://onepay.vn'||location.pathname!=='/invoice/create_order.op'){
        finish(false,'OnePay 로그인 후 송장 생성 화면에서 공유 단축어를 실행해 주세요.');return;
      }
      var raw;
      try{raw=await navigator.clipboard.readText();}
      catch(e){finish(false,'클립보드를 읽지 못했습니다. 모바일 앱에서 전체 복사하고 OnePay 열기를 다시 눌러 주세요.');return;}
      var p;
      try{
        p=JSON.parse(raw);
        var ids=['invoiceType','comCurrencyExchange','customerName','customerEmail','invoiceRef','orderNote','strAmount','strEndDate'];
        if(!p||p.format!=='sht-onepay-invoice-v1'||!Array.isArray(p.fields)||p.fields.length!==ids.length
          ||!ids.every(function(id,i){var f=p.fields[i];return f&&f.id===id&&typeof f.value==='string'&&typeof f.label==='string';})
          ||typeof p.expiresAt!=='string'||!Number.isFinite(Date.parse(p.expiresAt))
          ||p.fields[0].value!=='IOQ'||p.fields[1].value!=='VND'
          ||!p.fields[2].value.trim()||!p.fields[4].value.trim()
          ||!Number.isFinite(Number(p.fields[6].value))||Number(p.fields[6].value)<=0)throw new Error();
      }catch(e){finish(false,'복사한 송장 정보를 인식하지 못했습니다. 모바일 앱에서 다시 복사해 주세요.');return;}
      if(Date.parse(p.expiresAt)<=Date.now()){
        finish(false,'만료된 송장 정보입니다. 모바일 앱에서 송장 정보를 다시 준비해 주세요.');return;
      }
      var missing=p.fields.filter(function(f){
        var e=document.getElementById(f.id);
        return !e||e.disabled||!(e instanceof HTMLInputElement||e instanceof HTMLTextAreaElement||e instanceof HTMLSelectElement)
          ||(e instanceof HTMLSelectElement&&!Array.from(e.options).some(function(o){return o.value===f.value;}));
      });
      if(missing.length){finish(false,'입력칸을 확인할 수 없습니다: '+missing.map(function(f){return f.label;}).join(', '));return;}
      var conflicts=p.fields.filter(function(f){
        if(['invoiceType','comCurrencyExchange','strEndDate'].includes(f.id))return false;
        var current=document.getElementById(f.id).value.trim();
        if(f.id==='strAmount')current=current.replace(/,/g,'');
        return current&&current!==f.value&&!(f.id==='strAmount'&&Number(current)===0);
      });
      if(conflicts.length){finish(false,'작성 중인 값이 있어 자동입력을 중단했습니다: '+conflicts.map(function(f){return f.label;}).join(', '));return;}
      p.fields.forEach(function(f){
        var e=document.getElementById(f.id);
        var proto=e instanceof HTMLSelectElement?HTMLSelectElement.prototype:e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto,'value').set.call(e,f.value);
        ['input','change','blur'].forEach(function(t){e.dispatchEvent(new Event(t,{bubbles:true}));});
      });
      var failed=p.fields.filter(function(f){
        var e=document.getElementById(f.id);
        return !e||(f.id==='strAmount'?e.value.replace(/,/g,'')!==f.value:e.value!==f.value);
      });
      if(failed.length){finish(false,'입력값 확인이 필요합니다: '+failed.map(function(f){return f.label;}).join(', '));return;}
      finish(true,'송장 8개 항목 입력 완료. 이메일, 금액과 만료일을 확인한 뒤 발행해 주세요.');
    }catch(e){finish(false,'자동입력 중 오류가 발생했습니다. 송장 항목을 확인해 주세요.');}
  })();`.replace(/\n\s*/g, '');
}

export function buildOnepayAutofillBookmark() {
  // 고객 정보가 없는 도구만 북마크에 저장한다. 붙여넣은 JSON은 코드로 실행하지 않는다.
  // 실행 코드는 문자열로 유지해 앱 번들러의 함수 이름 변경에 영향을 받지 않는다.
  return `javascript:void(async function(){
    if(location.origin!=='https://onepay.vn'||location.pathname!=='/invoice/create_order.op'){
      alert('OnePay 로그인 후 송장 생성 화면에서 실행해 주세요.');return;
    }
    var raw;
    try{raw=await navigator.clipboard.readText();}
    catch(e){raw=prompt('Safari에서 자동 읽기를 허용하지 않았습니다. 복사한 송장 전체를 한 번 붙여넣으세요.');}
    if(raw===null)return;
    var p;
    try{
      p=JSON.parse(raw);
      var ids=['invoiceType','comCurrencyExchange','customerName','customerEmail','invoiceRef','orderNote','strAmount','strEndDate'];
      if(!p||p.format!=='sht-onepay-invoice-v1'||!Array.isArray(p.fields)||p.fields.length!==ids.length
        ||!ids.every(function(id,i){var f=p.fields[i];return f&&f.id===id&&typeof f.value==='string'&&typeof f.label==='string';})
        ||typeof p.expiresAt!=='string'||!Number.isFinite(Date.parse(p.expiresAt))
        ||p.fields[0].value!=='IOQ'||p.fields[1].value!=='VND'
        ||!p.fields[2].value.trim()||!p.fields[4].value.trim()
        ||!Number.isFinite(Number(p.fields[6].value))||Number(p.fields[6].value)<=0)throw new Error();
    }catch(e){alert('송장 정보를 인식하지 못했습니다. 모바일 앱의 전체 복사 버튼으로 다시 복사해 주세요.');return;}
    if(Date.parse(p.expiresAt)<=Date.now()){
      alert('만료된 송장 정보입니다. 모바일 앱에서 다시 준비해 주세요.');return;
    }
    var missing=p.fields.filter(function(f){
      var e=document.getElementById(f.id);
      return !e||e.disabled||!(e instanceof HTMLInputElement||e instanceof HTMLTextAreaElement||e instanceof HTMLSelectElement)
        ||(e instanceof HTMLSelectElement&&!Array.from(e.options).some(function(o){return o.value===f.value;}));
    });
    if(missing.length){alert('입력칸을 확인할 수 없습니다: '+missing.map(function(f){return f.label;}).join(', ')+'. 항목별 복사를 이용해 주세요.');return;}
    var overwrite=p.fields.some(function(f){
      if(['invoiceType','comCurrencyExchange','strEndDate'].includes(f.id))return false;
      var current=document.getElementById(f.id).value.trim();
      if(f.id==='strAmount')current=current.replace(/,/g,'');
      return current&&current!==f.value&&!(f.id==='strAmount'&&Number(current)===0);
    });
    if(overwrite&&!confirm('작성 중인 송장 값을 변경할까요?\\n'+p.fields.filter(function(f){return f.id==='customerName'||f.id==='invoiceRef'||f.id==='strAmount';}).map(function(f){return f.label+': '+f.value;}).join('\\n')))return;
    p.fields.forEach(function(f){
      var e=document.getElementById(f.id);
      var proto=e instanceof HTMLSelectElement?HTMLSelectElement.prototype:e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto,'value').set.call(e,f.value);
      ['input','change','blur'].forEach(function(t){e.dispatchEvent(new Event(t,{bubbles:true}));});
    });
    var failed=p.fields.filter(function(f){
      var e=document.getElementById(f.id);
      return !e||(f.id==='strAmount'?e.value.replace(/,/g,'')!==f.value:e.value!==f.value);
    });
    if(failed.length){alert('입력값 확인이 필요합니다: '+failed.map(function(f){return f.label;}).join(', '));return;}
    var notice=document.getElementById('sht-onepay-autofill-result');
    if(!notice){notice=document.createElement('div');notice.id='sht-onepay-autofill-result';document.body.appendChild(notice);}
    notice.setAttribute('role','status');
    notice.style.cssText='position:fixed;bottom:16px;left:16px;right:16px;z-index:2147483647;padding:14px;border:1px solid #86efac;border-radius:12px;background:#f0fdf4;color:#14532d;font:14px/1.5 sans-serif;pointer-events:none';
    notice.textContent='송장 8개 항목 입력 완료. 이메일, 금액과 만료일을 확인한 뒤 발행해 주세요.';
    setTimeout(function(){notice.remove();},8000);
  })();`.replace(/\n\s*/g, '');
}
