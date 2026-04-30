const ROLE_CACHE_KEY = 'app:user:role';
const ROLE_COOKIE_KEY = 'role';

const setCookie = (name: string, value: string, minutes = 30) => {
  try {
    if (typeof document === 'undefined') return;
    const expires = new Date(Date.now() + minutes * 60 * 1000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
  } catch {}
};

const getCookie = (name: string): string | null => {
  try {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(new RegExp('(^|; )' + name.replace(/([.*+?^${}()|[\]\\])/g, '\\$1') + '=([^;]*)'));
    return match ? decodeURIComponent(match[2]) : null;
  } catch { return null; }
};

export const getCachedRole = (): 'guest' | 'member' | 'manager' | 'admin' | null => {
  try {
    if (typeof window === 'undefined') return null;
    const v = window.localStorage.getItem(ROLE_CACHE_KEY) || window.sessionStorage.getItem(ROLE_CACHE_KEY);
    if (v === 'guest' || v === 'member' || v === 'manager' || v === 'admin') return v;
    return null;
  } catch { return null; }
};

export const setCachedRole = (role: string | null | undefined) => {
  try {
    if (typeof window === 'undefined') return;
    if (!role) {
      window.localStorage.removeItem(ROLE_CACHE_KEY);
      window.sessionStorage.removeItem(ROLE_CACHE_KEY);
      setCookie(ROLE_COOKIE_KEY, '', -1);
      return;
    }
    window.localStorage.setItem(ROLE_CACHE_KEY, role);
    window.sessionStorage.setItem(ROLE_CACHE_KEY, role);
    setCookie(ROLE_COOKIE_KEY, role, 30);
  } catch {}
};

export const clearCachedRole = () => {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(ROLE_CACHE_KEY);
    window.sessionStorage.removeItem(ROLE_CACHE_KEY);
    setCookie(ROLE_COOKIE_KEY, '', -1);
  } catch {}
};

export const getCookieRole = (): 'guest' | 'member' | 'manager' | 'admin' | null => {
  const v = getCookie(ROLE_COOKIE_KEY);
  if (v === 'guest' || v === 'member' || v === 'manager' || v === 'admin') return v;
  return null;
};

// 사용자 프로필 생성/업데이트 함수
import supabase from '@/lib/supabase';

export const upsertUserProfile = async (
  userId: string,
  email: string,
  additionalData: {
    name?: string;
    english_name?: string;
    phone_number?: string;
    role?: string;
  } = {}
) => {
  try {
    const { data: existingUser, error: fetchError } = await supabase
      .from('users')
      .select('id, role, email')
      .eq('id', userId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('사용자 정보 조회 오류:', fetchError);

      const { data: emailUser } = await supabase
        .from('users')
        .select('id, role, email')
        .eq('email', email)
        .single();

      if (emailUser && emailUser.id !== userId) {
        return {
          success: false,
          error: {
            message: '이미 사용 중인 이메일입니다. 다른 계정으로 가입되어 있습니다.',
            code: 'EMAIL_DUPLICATE'
          }
        };
      }
    }

    const updateData: any = {
      id: userId,
      email: email,
      updated_at: new Date().toISOString(),
    };

    if (additionalData.name) updateData.name = additionalData.name;
    if (additionalData.english_name) updateData.english_name = additionalData.english_name;
    if (additionalData.phone_number) updateData.phone_number = additionalData.phone_number;

    if (existingUser) {
      updateData.role = existingUser.role;
    } else {
      updateData.role = additionalData.role || 'guest';
      updateData.status = 'active';
      updateData.created_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('users')
      .upsert(updateData, {
        onConflict: 'id',
        ignoreDuplicates: false
      });

    if (error) {
      console.error('❌ 사용자 프로필 생성/업데이트 실패:', error);
      if (error.message?.includes('users_email_key') || error.code === '23505') {
        return {
          success: false,
          error: {
            ...error,
            message: '이미 사용 중인 이메일입니다.',
            code: 'EMAIL_DUPLICATE'
          }
        };
      }
      return { success: false, error };
    }

    return { success: true, error: null };
  } catch (error: any) {
    console.error('❌ upsertUserProfile 오류:', error);
    if (error?.message?.includes('users_email_key') || error?.code === '23505') {
      return {
        success: false,
        error: {
          ...error,
          message: '이미 사용 중인 이메일입니다.',
          code: 'EMAIL_DUPLICATE'
        }
      };
    }
    return { success: false, error };
  }
};
