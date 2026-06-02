import { NextResponse } from 'next/server';
import serviceSupabase from '../../../lib/serviceSupabase';

type ReminderServiceType = 'cruise' | 'airport' | 'rentcar' | 'hotel' | 'tour' | 'ticket' | 'package';

type ReminderDateBasis =
  | 'checkin'
  | 'pickup'
  | 'dropoff'
  | 'rentcar_pickup'
  | 'rentcar_return'
  | 'usage'
  | 'start';

type CustomerReminderRule = {
  id: string;
  serviceType: ReminderServiceType;
  dateBasis: ReminderDateBasis;
  label: string;
  enabled: boolean;
  daysBefore: number;
  title: string;
  body: string;
};

type CustomerReminderSettings = {
  updatedAt: string;
  updatedBy: string;
  rules: CustomerReminderRule[];
};
const TABLE_NAME = 'customer_reminder_rules';

export async function GET() {
  try {
    if (!serviceSupabase) {
      return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
    }

    const { data, error } = await serviceSupabase
      .from(TABLE_NAME)
      .select('id, service_type, date_basis, label, enabled, days_before, title, body, sort_order')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      return NextResponse.json({ error: `고객 사전알림 설정 조회 실패: ${error.message}` }, { status: 500 });
    }

    const parsed: CustomerReminderSettings = {
      updatedAt: new Date().toISOString(),
      updatedBy: 'system',
      rules: (data || []).map((row: any) => ({
        id: String(row.id || ''),
        serviceType: row.service_type as ReminderServiceType,
        dateBasis: row.date_basis as ReminderDateBasis,
        label: String(row.label || ''),
        enabled: Boolean(row.enabled),
        daysBefore: Number(row.days_before || 0),
        title: String(row.title || ''),
        body: String(row.body || ''),
      })),
    };

    return NextResponse.json(parsed);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '고객 사전알림 설정 조회 실패' }, { status: 500 });
  }
}
