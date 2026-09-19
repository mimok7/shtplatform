// 고객 결제용 OnePay 요청 URL과 응답 서명을 처리하는 서버 전용 유틸리티
import crypto from 'crypto';

export interface OnepayConfig {
  paymentUrl: string;
  merchant: string;
  accessCode: string;
  secureSecret: string;
}

export interface CreateOnepayPaymentParams {
  amount: number;
  merchTxnRef: string;
  orderInfo: string;
  returnURL: string;
  ipnURL: string;
  clientIp?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
}

function isPlaceholderValue(value: string): boolean {
  const normalized = String(value || '').trim().toUpperCase();
  return !normalized
    || normalized.includes('YOUR_')
    || normalized.includes('CHANGE_ME')
    || normalized === 'YOUR_ACCESS_CODE'
    || normalized === 'YOUR_MERCHANT_ID'
    || normalized === 'YOUR_SECURE_SECRET';
}

export function getOnepayConfigFromEnv(): OnepayConfig | null {
  const paymentUrl = process.env.ONEPAY_VPC_PAYMENT_URL || '';
  const merchant = process.env.ONEPAY_VPC_MERCHANT || '';
  const accessCode = process.env.ONEPAY_VPC_ACCESS_CODE || '';
  const secureSecret = process.env.ONEPAY_VPC_SECURE_SECRET || '';

  if ([paymentUrl, merchant, accessCode, secureSecret].some(isPlaceholderValue)) return null;
  return { paymentUrl, merchant, accessCode, secureSecret };
}

function createSecureHash(params: Record<string, string>, secureSecret: string): string {
  const hashString = Object.keys(params)
    .filter((key) => (key.startsWith('vpc_') || key.startsWith('user_'))
      && key !== 'vpc_SecureHash'
      && key !== 'vpc_SecureHashType'
      && params[key] !== '')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  const key = /^[0-9a-fA-F]+$/.test(secureSecret) ? Buffer.from(secureSecret, 'hex') : secureSecret;
  return crypto.createHmac('sha256', key).update(hashString, 'utf8').digest('hex').toUpperCase();
}

export function buildOnepayUrl(config: OnepayConfig, payment: CreateOnepayPaymentParams): string {
  const params: Record<string, string> = {
    vpc_Version: '2',
    vpc_Command: 'pay',
    vpc_AccessCode: config.accessCode,
    vpc_Merchant: config.merchant,
    vpc_Locale: 'vn',
    vpc_ReturnURL: payment.returnURL,
    vpc_CallbackURL: payment.ipnURL,
    vpc_MerchTxnRef: payment.merchTxnRef,
    vpc_OrderInfo: payment.orderInfo,
    vpc_Amount: String(Math.round(payment.amount * 100)),
    vpc_Currency: 'VND',
    vpc_TicketNo: payment.clientIp || '',
    vpc_Customer_Name: payment.customerName || '',
    vpc_Customer_Email: payment.customerEmail || '',
    vpc_Customer_Phone: payment.customerPhone || '',
  };
  const secureHash = createSecureHash(params, config.secureSecret);
  return `${config.paymentUrl}?${new URLSearchParams({
    ...params,
    vpc_SecureHash: secureHash,
    vpc_SecureHashType: 'SHA256',
  }).toString()}`;
}

export function verifyOnepayHash(params: URLSearchParams, secureSecret: string): boolean {
  const values: Record<string, string> = {};
  params.forEach((value, key) => {
    values[key] = value;
  });
  const received = values.vpc_SecureHash || '';
  return received.toUpperCase() === createSecureHash(values, secureSecret).toUpperCase();
}
