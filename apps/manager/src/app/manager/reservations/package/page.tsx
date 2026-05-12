'use client';

import React, { useState, useEffect } from 'react';
import supabase from '@/lib/supabase';
import { fetchTableInBatches } from '@/lib/fetchInBatches';
import ManagerLayout from '@/components/ManagerLayout';
import { openCentralPackageDetailModal } from '@/contexts/reservationDetailModalEvents';
import {
    Package, Plus, Eye, User, Calendar, Mail, Search,
    Loader2, AlertCircle, RefreshCw, ChevronRight, CheckCircle2, Clock
} from 'lucide-react';

interface PackageReservation {
    re_id: string;
    re_type: string;
    re_status: string;
    re_created_at: string;
    re_user_id: string;
    package_id: string;
    total_amount: number;
    re_adult_count: number;
    re_child_count: number;
    re_infant_count: number;
    users?: {
        id: string;
        name: string;
        email: string;
    };
    package_master?: {
        name: string;
        package_code: string;
    };
}

export default function PackageReservationsPage() {
    const [reservations, setReservations] = useState<PackageReservation[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    // 상세 보기용

    useEffect(() => {
        loadPackageReservations();
    }, []);

    const loadPackageReservations = async () => {
        try {
            setLoading(true);

            // 1. 패키지 예약 기본 데이터 조회
            const { data: baseData, error: baseError } = await supabase
                .from('reservation')
                .select(`
                    re_id,
                    re_type,
                    re_status,
                    re_created_at,
                    re_user_id,
                    package_id,
                    total_amount,
                    re_adult_count,
                    re_child_count,
                    re_infant_count
                `)
                .eq('re_type', 'package')
                .order('re_created_at', { ascending: false });

            if (baseError) throw baseError;

            if (!baseData || baseData.length === 0) {
                setReservations([]);
                setLoading(false);
                return;
            }

            // 2. 관련 데이터 조회 (배치 방식)
            const userIds = Array.from(new Set(baseData.map(r => r.re_user_id).filter(Boolean))) as string[];
            const packageIds = Array.from(new Set(baseData.map(r => r.package_id).filter(Boolean))) as string[];

            const [userData, packageMasterData] = await Promise.all([
                userIds.length > 0
                    ? fetchTableInBatches<any>('users', 'id', userIds, 'id, name, email', 100)
                    : Promise.resolve([]),
                packageIds.length > 0
                    ? supabase.from('package_master').select('id, name, package_code').in('id', packageIds)
                    : Promise.resolve({ data: [] })
            ]);

            const userMap = new Map(userData.map((u: any) => [u.id, u]));
            const packageMap = new Map((packageMasterData.data || []).map((p: any) => [p.id, p]));

            // 3. 데이터 병합
            const enriched = baseData.map(r => ({
                ...r,
                users: userMap.get(r.re_user_id),
                package_master: packageMap.get(r.package_id)
            })) as PackageReservation[];

            setReservations(enriched);
        } catch (err) {
            console.error('패키지 예약 데이터 로드 실패:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleViewDetail = (userId: string) => {
        openCentralPackageDetailModal(userId);
    };

    const filteredReservations = reservations.filter(r => {
        const matchesSearch = !searchQuery ||
            r.users?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            r.users?.email?.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === 'all' || r.re_status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    if (loading) return (
        <ManagerLayout>
            <div className="flex justify-center items-center h-72">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500" />
            </div>
        </ManagerLayout>
    );

    return (
        <ManagerLayout>
            <div className="p-4 max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <Package className="w-6 h-6 text-indigo-600" />
                        패키지 예약 관리
                    </h1>
                    <button onClick={loadPackageReservations} className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
                        <RefreshCw className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex gap-2 mb-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="이름 또는 이메일 검색"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    >
                        <option value="all">전체 상태</option>
                        <option value="pending">대기</option>
                        <option value="approved">승인</option>
                        <option value="confirmed">확정</option>
                        <option value="completed">완료</option>
                        <option value="cancelled">취소</option>
                    </select>
                </div>

                {filteredReservations.length === 0 ? (
                    <div className="text-center py-16 text-gray-400">
                        <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">패키지 예약이 없습니다.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredReservations.map(r => (
                            <div key={r.re_id} className="group bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow">
                                <div className="flex items-start justify-between mb-3">
                                    <div>
                                        <p className="font-bold text-gray-900">{r.users?.name || '이름 없음'}</p>
                                        <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                            <Mail className="w-3 h-3" /> {r.users?.email || '-'}
                                        </p>
                                    </div>
                                    <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                                        r.re_status === 'confirmed' ? 'bg-green-100 text-green-700' :
                                        r.re_status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                        r.re_status === 'cancelled' ? 'bg-red-100 text-red-700' :
                                        'bg-gray-100 text-gray-600'
                                    }`}>
                                        {r.re_status === 'pending' ? '대기' :
                                         r.re_status === 'approved' ? '승인' :
                                         r.re_status === 'confirmed' ? '확정' :
                                         r.re_status === 'completed' ? '완료' :
                                         r.re_status === 'cancelled' ? '취소' : r.re_status}
                                    </span>
                                </div>

                                <div className="space-y-3 pt-3 border-t border-gray-50">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-gray-400 flex items-center gap-1">
                                            <Package className="w-3 h-3" /> 패키지명
                                        </span>
                                        <span className="text-sm font-bold text-indigo-700">
                                            {r.package_master?.name || r.package_master?.package_code || '일반 패키지'}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-gray-400 flex items-center gap-1">
                                            <User className="w-3 h-3" /> 구성
                                        </span>
                                        <span className="text-sm font-medium text-gray-700">
                                            성인 {r.re_adult_count || 0} / 아동 {r.re_child_count || 0}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-semibold text-gray-400 flex items-center gap-1">
                                            <Calendar className="w-3 h-3" /> 예약일
                                        </span>
                                        <span className="text-sm font-medium text-gray-700">
                                            {new Date(r.re_created_at).toLocaleDateString('ko-KR')}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between bg-gray-50 p-2 rounded-lg mt-2">
                                        <span className="text-xs font-bold text-gray-500 text-xs">총 결제금액</span>
                                        <span className="text-base font-bold text-emerald-600">
                                            {r.total_amount?.toLocaleString() || 0}동
                                        </span>
                                    </div>
                                </div>

                                <button
                                    onClick={() => handleViewDetail(r.re_user_id)}
                                    className="w-full mt-4 py-2 bg-gray-900 text-white rounded-lg text-xs font-bold hover:bg-gray-800 transition-colors flex items-center justify-center gap-2 group-hover:bg-indigo-600"
                                >
                                    <Eye className="w-4 h-4" />
                                    전체 예약 상세 보기
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

        </ManagerLayout>
    );
}
