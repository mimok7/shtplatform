'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PageWrapper from '@/components/PageWrapper';
import SectionBox from '@/components/SectionBox';
import supabase from '@/lib/supabase';
import { clearInvalidSession, isInvalidRefreshTokenError } from '@/lib/authRecovery';
import { useLoadingTimeout } from '@/hooks/useLoadingTimeout';
import { getAuthUserSafe } from '@/lib/authSafe';
import { Home, Camera, Trash2, Ticket } from 'lucide-react';

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

interface PassportDoc {
    id: string;
    image_data: string;
    created_at?: string | null;
}

interface BoardingCodeDoc {
    id: string;
    image_data: string;
    reservation_id?: string | null;
    created_at?: string | null;
    cruise_name?: string | null;
    checkin?: string | null;
}

interface UploadableCruiseReservation {
    reservation_id: string;
    checkin: string;
    checkout_date: string;
}

export default function ProfilePage() {
    const router = useRouter();
    const [authUser, setAuthUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [passportDocs, setPassportDocs] = useState<PassportDoc[]>([]);
    const [passportUploading, setPassportUploading] = useState(false);
    const [uploadableCruiseReservation, setUploadableCruiseReservation] = useState<UploadableCruiseReservation | null>(null);
    const [boardingCodeDocs, setBoardingCodeDocs] = useState<BoardingCodeDoc[]>([]);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
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

    // ===== 여권/승선코드 관련 헬퍼 =====
    const getTodayKstDateString = () => {
        const parts = new Intl.DateTimeFormat('sv-SE', {
            timeZone: 'Asia/Seoul',
            year: 'numeric', month: '2-digit', day: '2-digit',
        }).formatToParts(new Date());
        const pick = (type: string) => parts.find((p) => p.type === type)?.value || '';
        return `${pick('year')}-${pick('month')}-${pick('day')}`;
    };

    const getNightsFromScheduleType = (scheduleType?: string | null): number => {
        const normalized = String(scheduleType || '').trim().toUpperCase();
        if (normalized === 'DAY') return 0;
        const m = normalized.match(/^(\d+)N\d+D$/);
        if (m) return Number(m[1]) || 1;
        return 1;
    };

    const addDaysToDateString = (dateString: string, days: number): string => {
        const base = String(dateString || '').slice(0, 10);
        if (!base) return '';
        const d = new Date(`${base}T00:00:00`);
        if (Number.isNaN(d.getTime())) return base;
        d.setDate(d.getDate() + Math.max(0, days));
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const fetchUploadableCruiseReservation = async (userId: string): Promise<UploadableCruiseReservation | null> => {
        const todayKst = getTodayKstDateString();
        const { data: reservationRows } = await supabase
            .from('reservation')
            .select('re_id')
            .eq('re_user_id', userId)
            .eq('re_type', 'cruise');
        if (!reservationRows?.length) return null;
        const reservationIds = reservationRows.map((r: any) => r.re_id).filter(Boolean);
        if (!reservationIds.length) return null;
        const { data: cruiseRows } = await supabase
            .from('reservation_cruise')
            .select('reservation_id, checkin, room_price_code')
            .in('reservation_id', reservationIds)
            .not('checkin', 'is', null);
        if (!cruiseRows?.length) return null;
        const roomPriceCodes = Array.from(new Set((cruiseRows as any[])
            .map((row) => String(row.room_price_code || '').trim())
            .filter(Boolean)));
        const scheduleTypeByRoomCode: Record<string, string> = {};
        if (roomPriceCodes.length > 0) {
            const { data: rateRows } = await supabase
                .from('cruise_rate_card')
                .select('id, schedule_type')
                .in('id', roomPriceCodes);
            (rateRows || []).forEach((row: any) => {
                const code = String(row?.id || '').trim();
                const scheduleType = String(row?.schedule_type || '').trim();
                if (code && scheduleType) scheduleTypeByRoomCode[code] = scheduleType;
            });
        }
        const upcoming = (cruiseRows as any[])
            .map((row) => ({
                reservation_id: String(row.reservation_id || ''),
                checkin: String(row.checkin || ''),
                dateOnly: String(row.checkin || '').slice(0, 10),
                room_price_code: String(row.room_price_code || '').trim(),
            }))
            .filter((row) => row.reservation_id && row.dateOnly && row.dateOnly >= todayKst)
            .sort((a, b) => a.dateOnly.localeCompare(b.dateOnly));
        if (!upcoming.length) return null;
        const first = upcoming[0];
        const nights = getNightsFromScheduleType(scheduleTypeByRoomCode[first.room_price_code]);
        const checkoutDate = addDaysToDateString(first.dateOnly, nights);
        return {
            reservation_id: first.reservation_id,
            checkin: first.checkin,
            checkout_date: checkoutDate || first.dateOnly,
        };
    };

    const fetchPassportImages = async (userId: string) => {
        try {
            const { data, error } = await supabase
                .from('cruise_document')
                .select('id, image_data, created_at')
                .eq('user_id', userId)
                .eq('document_type', 'passport')
                .order('created_at', { ascending: false });
            if (!error && data) setPassportDocs(data as PassportDoc[]);
            else setPassportDocs([]);
        } catch (err) {
            console.error('여권 사진 조회 오류:', err);
            setPassportDocs([]);
        }
    };

    const fetchBoardingCodes = async (userId: string) => {
        try {
            const { data: docs } = await supabase
                .from('cruise_document')
                .select('id, image_data, reservation_id, created_at')
                .eq('user_id', userId)
                .eq('document_type', 'boarding_code')
                .order('created_at', { ascending: false });
            const list = (docs || []) as BoardingCodeDoc[];
            const reservationIds = Array.from(new Set(list.map(d => d.reservation_id).filter(Boolean))) as string[];
            const cruiseInfoMap: Record<string, { cruise_name?: string; checkin?: string }> = {};
            if (reservationIds.length > 0) {
                const { data: cruiseRows } = await supabase
                    .from('reservation_cruise')
                    .select('reservation_id, checkin, room_price_code')
                    .in('reservation_id', reservationIds);
                const roomCodes = Array.from(new Set((cruiseRows || []).map((c: any) => c.room_price_code).filter(Boolean))) as string[];
                const rateMap: Record<string, string> = {};
                if (roomCodes.length > 0) {
                    const { data: rateRows } = await supabase
                        .from('cruise_rate_card')
                        .select('id, cruise_name')
                        .in('id', roomCodes);
                    (rateRows || []).forEach((r: any) => { if (r.id) rateMap[r.id] = r.cruise_name; });
                }
                (cruiseRows || []).forEach((c: any) => {
                    if (c.reservation_id) {
                        cruiseInfoMap[c.reservation_id] = {
                            cruise_name: c.room_price_code ? rateMap[c.room_price_code] : undefined,
                            checkin: c.checkin || undefined,
                        };
                    }
                });
            }
            setBoardingCodeDocs(list.map(d => ({
                ...d,
                cruise_name: d.reservation_id ? cruiseInfoMap[d.reservation_id]?.cruise_name : undefined,
                checkin: d.reservation_id ? cruiseInfoMap[d.reservation_id]?.checkin : undefined,
            })));
        } catch (err) {
            console.error('승선코드 조회 오류:', err);
            setBoardingCodeDocs([]);
        }
    };

    const resizePassportImage = async (file: File): Promise<string> => {
        const src = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('파일 읽기 실패'));
            reader.readAsDataURL(file);
        });
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new window.Image();
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error('이미지 로딩 실패'));
            el.src = src;
        });
        const MAX = 800;
        const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context 생성 실패');
        ctx.drawImage(img, 0, 0, w, h);
        return canvas.toDataURL('image/jpeg', 0.6);
    };

    const handlePassportUpload = async (files: FileList | File[]) => {
        if (!authUser?.id) return;
        try {
            setPassportUploading(true);
            const linkedReservation = await fetchUploadableCruiseReservation(authUser.id);
            setUploadableCruiseReservation(linkedReservation);
            if (!linkedReservation) {
                throw new Error('업로드 가능한 크루즈 예약이 없습니다. 먼저 크루즈 예약을 생성해 주세요.');
            }
            const selectedFiles = Array.from(files);
            if (!selectedFiles.length) return;
            for (const file of selectedFiles) {
                const imageData = await resizePassportImage(file);
                const { error } = await supabase
                    .from('cruise_document')
                    .insert({
                        user_id: authUser.id,
                        reservation_id: linkedReservation.reservation_id,
                        document_type: 'passport',
                        image_data: imageData,
                        checkout_date: linkedReservation.checkout_date,
                    });
                if (error) {
                    const message = (error as any)?.message || '';
                    if (message.includes('idx_cruise_document_passport_user')) {
                        throw new Error('DB에 여권 1개 제한 인덱스가 남아 있습니다. SQL 마이그레이션을 먼저 적용해 주세요.');
                    }
                    throw error;
                }
            }
            await fetchPassportImages(authUser.id);
            alert('여권 사진이 저장되었습니다.');
        } catch (err: any) {
            console.error('여권 업로드 오류:', err);
            alert(err?.message || '여권 사진 업로드에 실패했습니다.');
        } finally {
            setPassportUploading(false);
        }
    };

    const handlePassportDelete = async (docId: string) => {
        if (!docId) return;
        if (!confirm('여권 사진을 삭제하시겠습니까?')) return;
        try {
            const { error } = await supabase.from('cruise_document').delete().eq('id', docId);
            if (error) throw error;
            setPassportDocs((prev) => prev.filter((doc) => doc.id !== docId));
        } catch (err) {
            console.error('여권 삭제 오류:', err);
            alert('여권 사진 삭제에 실패했습니다.');
        }
    };

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

            // 여권/승선코드 데이터 동시 로드 (실패해도 프로필 로딩은 진행)
            try {
                const linkedReservation = await fetchUploadableCruiseReservation(user.id);
                setUploadableCruiseReservation(linkedReservation);
                await Promise.all([
                    fetchPassportImages(user.id),
                    fetchBoardingCodes(user.id),
                ]);
            } catch (e) {
                console.warn('여권/승선코드 로드 실패:', e);
            }

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

                <div className="hidden"><SectionBox title="🛂 여권 사진">
                    <div className="space-y-3">
                        <p className="text-sm text-gray-600">
                            여권 사진은 여러 장 업로드할 수 있으며, 예약 확인 및 승선코드 처리용으로 사용됩니다.
                            <br />먼저 크루즈 예약을 생성한 후 업로드해 주세요.
                        </p>
                        {uploadableCruiseReservation ? (
                            <div className="bg-green-50 border border-green-200 rounded-md p-3 text-sm text-green-700">
                                업로드는 가까운 크루즈 예약과 자동 연결됩니다. 예약 ID: {uploadableCruiseReservation.reservation_id.slice(-8)} / 체크인: {uploadableCruiseReservation.checkin.slice(0, 10)}
                            </div>
                        ) : (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm text-yellow-700">
                                업로드 가능한 크루즈 예약이 없습니다. 먼저 크루즈 예약을 생성해 주세요.
                            </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                            <label
                                className={`inline-flex items-center gap-2 px-4 py-2 text-white rounded-md text-sm ${uploadableCruiseReservation && !passportUploading ? 'bg-blue-500 hover:bg-blue-600 cursor-pointer' : 'bg-gray-400 cursor-not-allowed'}`}
                            >
                                <Camera className="w-4 h-4" />
                                {passportUploading ? '업로드 중...' : '여권 사진 추가'}
                                <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="hidden"
                                    disabled={passportUploading || !uploadableCruiseReservation}
                                    onChange={async (e) => {
                                        const files = e.target.files;
                                        if (files && files.length > 0) {
                                            await handlePassportUpload(files);
                                        }
                                        e.target.value = '';
                                    }}
                                />
                            </label>
                            <span className="text-xs text-gray-500">현재 {passportDocs.length}장</span>
                        </div>

                        {passportDocs.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {passportDocs.map((doc, index) => (
                                    <div key={doc.id} className="rounded-lg border border-gray-200 p-3 bg-white space-y-2">
                                        <img
                                            src={doc.image_data}
                                            alt={`여권 사진 ${index + 1}`}
                                            className="w-full h-44 object-cover rounded-md border border-gray-100 cursor-zoom-in"
                                            onClick={() => setPreviewImage(doc.image_data)}
                                        />
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-gray-500">사진 {index + 1}</span>
                                            <button
                                                type="button"
                                                onClick={() => handlePassportDelete(doc.id)}
                                                className="inline-flex items-center gap-1 px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-xs"
                                            >
                                                <Trash2 className="w-3 h-3" />삭제
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="border border-dashed border-gray-300 rounded-lg p-6 bg-gray-50 text-center">
                                <p className="text-sm text-gray-500">등록된 여권 사진이 없습니다.</p>
                            </div>
                        )}
                    </div>
                </SectionBox>
                </div>
                <div className="hidden"><SectionBox title="🎫 승선코드">
                    <div className="space-y-3">
                        <p className="text-sm text-gray-600">
                            매니저가 발급/등록한 승선코드입니다.<br />승선코드는 매니저가 발급하므로 직접 업로드할 수 없습니다.
                        </p>
                        {boardingCodeDocs.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {boardingCodeDocs.map((doc, index) => (
                                    <div key={doc.id} className="rounded-lg border border-blue-200 p-3 bg-blue-50 space-y-2">
                                        <img
                                            src={doc.image_data}
                                            alt={`승선코드 ${index + 1}`}
                                            className="w-full h-44 object-cover rounded-md border border-gray-100 bg-white cursor-zoom-in"
                                            onClick={() => setPreviewImage(doc.image_data)}
                                        />
                                        <div className="text-xs text-gray-700 space-y-0.5">
                                            <div className="flex items-center gap-1 font-medium text-blue-700">
                                                <Ticket className="w-3 h-3" />
                                                {doc.cruise_name || '크루즈 승선코드'}
                                            </div>
                                            {doc.checkin && (
                                                <div>체크인: {String(doc.checkin).slice(0, 10)}</div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="border border-dashed border-gray-300 rounded-lg p-6 bg-gray-50 text-center">
                                <p className="text-sm text-gray-500">발급된 승선코드가 없습니다.</p>
                            </div>
                        )}
                    </div>
                </SectionBox>
                </div>
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
            {previewImage && (
                <div
                    className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
                    onClick={() => setPreviewImage(null)}
                >
                    <img
                        src={previewImage}
                        alt="미리보기"
                        className="max-w-full max-h-full rounded-lg shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    />
                    <button
                        type="button"
                        onClick={() => setPreviewImage(null)}
                        className="absolute top-4 right-4 px-3 py-1 bg-white text-gray-800 rounded-md text-sm shadow"
                    >
                        닫기
                    </button>
                </div>
            )}
        </PageWrapper>
    );
}
