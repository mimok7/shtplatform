'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageWrapper from '@/components/PageWrapper';
import SectionBox from '@/components/SectionBox';
import supabase from '@/lib/supabase';
import { clearInvalidSession, isInvalidRefreshTokenError } from '@/lib/authRecovery';
import { useLoadingTimeout } from '@/hooks/useLoadingTimeout';
import { getAuthUserSafe } from '@/lib/authSafe';
import { Home } from 'lucide-react';

interface UserProfile {
    id: string;
    email: string | null;
    name: string | null;
    english_name?: string | null;
    nickname?: string | null;
    phone_number?: string | null;
    role?: string | null;
    birth_date?: string | null;
    child_birth_dates?: string[] | null; // 아동 생년월일 배열 (JSONB)
    notifications?: boolean; // UI 전용 토글 (실제 컬럼 여부에 따라 저장 스킵)
}

export default function ProfilePage() {
    const router = useRouter();
    const [authUser, setAuthUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' });
    const [pwSaving, setPwSaving] = useState(false);
    const [pwError, setPwError] = useState<string | null>(null);

    useLoadingTimeout(loading, setLoading, 12000);

    const handleGoHome = () => {
        router.push('/mypage');
    };

    useEffect(() => {
        init();
    }, []);

    const formatPhoneNumber = (value?: string | null) => {
        const digits = (value || '').replace(/\D/g, '').slice(0, 11);
        if (digits.length <= 3) return digits;
        if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
        return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    };

    const normalizeEnglishName = (value?: string | null) => (value || '').toUpperCase();
    const sanitizeEnglishName = (value?: string | null) => normalizeEnglishName(value).replace(/[^A-Z\s]/g, '');

    const init = async () => {
        try {
            const { user, error, timedOut } = await getAuthUserSafe({ timeoutMs: 8000, retries: 1 });

            if (timedOut) {
                alert('세션 확인이 지연되었습니다. 다시 로그인해 주세요.');
                router.push('/login');
                return;
            }

            if (error || !user) {
                if (error && isInvalidRefreshTokenError(error)) {
                    await clearInvalidSession();
                }
                router.push('/login');
                return;
            }
            setAuthUser(user);

            // users 테이블에서 프로필 로드 (없으면 기본 생성 X, 조회만)
            const { data: urow, error: uerr } = await supabase
                .from('users')
                .select('id, email, name, english_name, nickname, phone_number, role, birth_date, child_birth_dates')
                .eq('id', user.id)
                .maybeSingle();

            if (uerr) {
                console.warn('users 조회 실패:', uerr?.message);
                setProfile({
                    id: user.id,
                    email: user.email ?? null,
                    name: null,
                    english_name: null,
                    nickname: null,
                    phone_number: null,
                    role: 'member',
                    birth_date: null,
                    child_birth_dates: [],
                    notifications: true,
                });
            } else if (urow) {
                setProfile({
                    ...urow,
                    english_name: sanitizeEnglishName(urow.english_name),
                    phone_number: formatPhoneNumber(urow.phone_number),
                    notifications: true,
                });
            } else {
                setProfile({
                    id: user.id,
                    email: user.email ?? null,
                    name: null,
                    english_name: null,
                    nickname: null,
                    phone_number: null,
                    role: 'member',
                    birth_date: null,
                    child_birth_dates: [],
                    notifications: true,
                });
            }
        } catch (e) {
            if (isInvalidRefreshTokenError(e)) {
                await clearInvalidSession();
                router.push('/login');
                return;
            }
            console.error('프로필 초기화 오류:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!authUser || !profile) return;
        setSaving(true);
        try {
            // users 레코드가 없을 수도 있으므로 upsert 사용 (id pk)
            const payload: any = {
                id: profile.id,
                email: profile.email,
                name: profile.name,
                english_name: sanitizeEnglishName(profile.english_name),
                nickname: profile.nickname,
                phone_number: formatPhoneNumber(profile.phone_number),
                role: profile.role ?? 'member',
                birth_date: profile.birth_date,
                child_birth_dates: profile.child_birth_dates || [],
                updated_at: new Date().toISOString(),
            };

            const { error } = await supabase
                .from('users')
                .upsert(payload, { onConflict: 'id' });

            if (error) throw error;

            alert('프로필이 저장되었습니다.');
            router.push('/mypage');
        } catch (e: any) {
            console.error('프로필 저장 오류:', e);
            alert(`저장 실패: ${e?.message || '알 수 없는 오류'}`);
        } finally {
            setSaving(false);
        }
    };

    const handlePasswordChange = async () => {
        setPwError(null);
        const { current, next, confirm } = pwForm;
        if (!current) { setPwError('기존 비밀번호를 입력해 주세요.'); return; }
        if (!next || next.length < 8) { setPwError('새 비밀번호는 8자 이상이어야 합니다.'); return; }
        if (next !== confirm) { setPwError('새 비밀번호와 확인이 일치하지 않습니다.'); return; }

        setPwSaving(true);
        try {
            // 기존 비밀번호 확인
            const email = profile?.email || authUser?.email;
            if (!email) throw new Error('이메일 정보를 찾을 수 없습니다.');

            const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: current });
            if (signInErr) {
                setPwError('기존 비밀번호가 올바르지 않습니다.');
                return;
            }

            const { error: updateErr } = await supabase.auth.updateUser({ password: next });
            if (updateErr) throw updateErr;

            alert('비밀번호가 변경되었습니다.');
            setPwForm({ current: '', next: '', confirm: '' });
        } catch (e: any) {
            setPwError(e?.message || '비밀번호 변경 중 오류가 발생했습니다.');
        } finally {
            setPwSaving(false);
        }
    };

    if (loading || !profile) {
        return (
            <PageWrapper title="내 정보">
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                    <p className="ml-4 text-gray-600">프로필을 불러오는 중...</p>
                </div>
            </PageWrapper>
        );
    }

    return (
        <PageWrapper
            title="👤 내 정보"
            actions={
                <button
                    type="button"
                    onClick={handleGoHome}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
                >
                    <Home className="w-4 h-4" />
                    홈
                </button>
            }
        >
            <div className="space-y-6">

                {/* 회원가입 후 안내 메시지 */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-700">
                        💡 <strong>환영합니다!</strong> 아래 정보를 입력하시면 더 편리하게 서비스를 이용하실 수 있습니다.
                    </p>
                </div>

                <SectionBox title="👤 기본 정보">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm text-gray-600 mb-1">이메일</label>
                            <input
                                type="email"
                                value={profile.email ?? ''}
                                readOnly
                                className="w-full px-3 py-2 border border-gray-200 rounded bg-gray-50 text-gray-700 cursor-not-allowed"
                                placeholder="email@example.com"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-600 mb-1">이름</label>
                            <input
                                type="text"
                                value={profile.name ?? ''}
                                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-200 rounded"
                                placeholder="홍길동"
                                lang="ko-KR"
                                inputMode="text"
                                autoComplete="name"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-600 mb-1">영문 이름</label>
                            <input
                                type="text"
                                value={profile.english_name ?? ''}
                                onChange={(e) => setProfile({ ...profile, english_name: sanitizeEnglishName(e.target.value) })}
                                className="w-full px-3 py-2 border border-gray-200 rounded"
                                placeholder="HONG GILDONG"
                                inputMode="text"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-600 mb-1">닉네임</label>
                            <input
                                type="text"
                                value={profile.nickname ?? ''}
                                onChange={(e) => setProfile({ ...profile, nickname: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-200 rounded"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-600 mb-1">휴대폰 번호</label>
                            <input
                                type="tel"
                                value={profile.phone_number ?? ''}
                                onChange={(e) => setProfile({ ...profile, phone_number: formatPhoneNumber(e.target.value) })}
                                className="w-full px-3 py-2 border border-gray-200 rounded"
                                placeholder="- 없이 숫자만 입력하세요"
                                inputMode="numeric"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-600 mb-1">생년월일</label>
                            <input
                                type="date"
                                value={profile.birth_date ?? ''}
                                onChange={(e) => setProfile({ ...profile, birth_date: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-200 rounded"
                            />
                        </div>
                    </div>
                </SectionBox>




                <SectionBox title="👶 아동 생년월일 (최대 3명)">
                    <div className="space-y-3">
                        <div className="bg-blue-50 p-3 rounded text-sm text-blue-800 mb-3">
                            크루즈 예약 시 입력한 아동 생년월일이 여기에 저장됩니다.
                        </div>
                        {[0, 1, 2].map((index) => (
                            <div key={index} className="flex items-center gap-4">
                                <label className="w-28 text-sm font-medium text-gray-700">
                                    아동 {index + 1}
                                </label>
                                <input
                                    type="date"
                                    value={(profile.child_birth_dates && profile.child_birth_dates[index]) || ''}
                                    onChange={(e) => {
                                        const currentDates = profile.child_birth_dates || ['', '', ''];
                                        const newDates = [...currentDates];
                                        newDates[index] = e.target.value;
                                        setProfile({ ...profile, child_birth_dates: newDates });
                                    }}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="생년월일 선택"
                                />
                            </div>
                        ))}
                    </div>
                </SectionBox>

                <SectionBox title="🔒 비밀번호 변경">
                    <div className="space-y-4">
                        {pwError && (
                            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                                {pwError}
                            </div>
                        )}
                        <div>
                            <label className="block text-sm text-gray-600 mb-1">기존 비밀번호</label>
                            <input
                                type="password"
                                value={pwForm.current}
                                onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-200 rounded"
                                placeholder="현재 비밀번호 입력"
                                autoComplete="current-password"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-600 mb-1">새 비밀번호</label>
                            <input
                                type="password"
                                value={pwForm.next}
                                onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-200 rounded"
                                placeholder="새 비밀번호 (8자 이상)"
                                autoComplete="new-password"
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-600 mb-1">새 비밀번호 확인</label>
                            <input
                                type="password"
                                value={pwForm.confirm}
                                onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-200 rounded"
                                placeholder="새 비밀번호 다시 입력"
                                autoComplete="new-password"
                            />
                        </div>
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={handlePasswordChange}
                                disabled={pwSaving}
                                className={`px-6 py-2 rounded text-white ${pwSaving ? 'bg-gray-400' : 'bg-orange-500 hover:bg-orange-600'}`}
                            >
                                {pwSaving ? '변경 중...' : '비밀번호 변경'}
                            </button>
                        </div>
                    </div>
                </SectionBox>

                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className={`px-6 py-2 rounded text-white ${saving ? 'bg-gray-400' : 'bg-blue-500 hover:bg-blue-600'}`}
                    >
                        {saving ? '저장 중...' : '저장하기'}
                    </button>
                </div>
            </div>
        </PageWrapper>
    );
}
