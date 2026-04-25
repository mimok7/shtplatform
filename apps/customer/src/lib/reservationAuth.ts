import { getSessionUser } from '@/lib/authHelpers';

export async function getFastAuthUser() {
  const { user, error } = await getSessionUser(5000);
  return { user: user ?? null, error: error ?? null };
}

export async function ensureMemberRole(user: any) {
  // 역할 기반 승격 로직 제거: 로그인 여부만 확인하는 정책으로 단순화
  return;
}

export async function getFastAuthUserWithMemberRole() {
  const { user, error } = await getFastAuthUser();
  if (error || !user) {
    return { user: null, error: error ?? new Error('인증 사용자 없음') };
  }

  // 하위 호환을 위해 함수명은 유지하되 역할 강제는 수행하지 않음
  return { user, error: null };
}
