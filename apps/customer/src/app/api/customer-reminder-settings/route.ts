import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

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

const SETTINGS_RELATIVE_PATH = path.join('config', 'customer-reminder-settings.json');

async function findWorkspaceRoot(startDir: string): Promise<string> {
  let current = startDir;
  for (let i = 0; i < 8; i += 1) {
    const marker = path.join(current, 'pnpm-workspace.yaml');
    try {
      await fs.access(marker);
      return current;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return startDir;
}

export async function GET() {
  try {
    const root = await findWorkspaceRoot(process.cwd());
    const targetPath = path.join(root, SETTINGS_RELATIVE_PATH);
    const raw = await fs.readFile(targetPath, 'utf-8');
    const parsed = JSON.parse(raw) as CustomerReminderSettings;
    return NextResponse.json(parsed);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '고객 사전알림 설정 조회 실패' }, { status: 500 });
  }
}
