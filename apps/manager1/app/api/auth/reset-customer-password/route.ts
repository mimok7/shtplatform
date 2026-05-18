import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const RESET_PASSWORD = 'sht123!';
const ROLE_RANK: Record<string, number> = {
  guest: 0,
  member: 1,
  partner: 2,
  manager: 3,
  admin: 4,
  super_admin: 5,
  superadmin: 5,
  master: 6,
  owner: 7
};

const normalizeRole = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
};

const extractRoles = (user: any): string[] => {
  const roleSet = new Set<string>();

  const addRole = (value: unknown) => {
    const normalized = normalizeRole(value);
    if (normalized) roleSet.add(normalized);
  };

  const addRoles = (values: unknown) => {
    if (!Array.isArray(values)) return;
    for (const value of values) addRole(value);
  };

  addRole(user?.app_metadata?.role);
  addRoles(user?.app_metadata?.roles);
  addRole(user?.user_metadata?.role);
  addRoles(user?.user_metadata?.roles);

  return [...roleSet];
};

const hasManagerOrHigherRole = (roles: string[]): boolean => {
  return roles.some((role) => (ROLE_RANK[role] ?? -1) >= ROLE_RANK.manager);
};

function getClients() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return {
      adminClient: null,
      anonClient: null,
      error: NextResponse.json(
        { error: 'Missing Supabase server environment variables' },
        { status: 500 }
      )
    };
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const anonClient = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return { adminClient, anonClient, error: null };
}

export async function POST(request: NextRequest) {
  try {
    const { adminClient, anonClient, error } = getClients();
    if (!adminClient || !anonClient) return error!;

    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: requesterAuth, error: requesterAuthError } = await anonClient.auth.getUser(token);

    if (requesterAuthError || !requesterAuth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requesterClaimRoles = extractRoles(requesterAuth.user);
    const roleSet = new Set<string>(requesterClaimRoles);

    const appendRoleFromProfile = async (column: 'id' | 'email' | 'phone_number' | 'kakao_id', value?: string) => {
      const normalizedValue = typeof value === 'string' ? value.trim() : '';
      if (!normalizedValue) return;
      const { data, error } = await adminClient
        .from('users')
        .select('role')
        .eq(column, normalizedValue)
        .limit(1);
      if (error) {
        console.warn(`[reset-pw] users.${column} 조회 실패:`, error.message);
        return;
      }
      const role = normalizeRole(data?.[0]?.role);
      if (role) roleSet.add(role);
    };

    const metaPhone =
      requesterAuth.user?.phone ||
      requesterAuth.user?.user_metadata?.phone ||
      requesterAuth.user?.user_metadata?.phone_number ||
      '';
    const metaKakaoId = requesterAuth.user?.user_metadata?.kakao_id || '';

    await appendRoleFromProfile('id', requesterAuth.user.id);
    await appendRoleFromProfile('email', requesterAuth.user.email || requesterAuth.user?.user_metadata?.email || '');
    await appendRoleFromProfile('phone_number', metaPhone);
    await appendRoleFromProfile('kakao_id', metaKakaoId);

    let requesterRoles = [...roleSet];

    if (!hasManagerOrHigherRole(requesterRoles)) {
      try {
        const { data: adminUserData } = await adminClient.auth.admin.getUserById(requesterAuth.user.id);
        const adminApiRoles = extractRoles(adminUserData?.user);
        if (adminApiRoles.length > 0) {
          requesterRoles = [...new Set([...requesterRoles, ...adminApiRoles])];
        }
      } catch (e) {
        console.warn('[reset-pw] admin.getUserById 폴백 실패:', e);
      }
    }

    if (!hasManagerOrHigherRole(requesterRoles)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const { targetUserId } = await request.json();

    if (!targetUserId || typeof targetUserId !== 'string') {
      return NextResponse.json({ error: 'targetUserId is required' }, { status: 400 });
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(targetUserId, {
      password: RESET_PASSWORD
    });

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '서버 오류' }, { status: 500 });
  }
}
