'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import ManagerLayout from '@/components/ManagerLayout';

// 타입 정의
interface BaseNotification {
    id: string;
    type: 'business' | 'customer';
    category: string;
    title: string;
    message: string;
    priority: 'low' | 'normal' | 'high' | 'urgent';
    status: 'unread' | 'read' | 'processing' | 'completed' | 'dismissed';
    target_id?: string;
    target_table?: string;
    assigned_to?: string;
    due_date?: string;
    metadata?: any;
    created_at: string;
    updated_at: string;
    processed_at?: string;
}

interface CustomerNotification extends BaseNotification {
    customer_id?: string;
    customer_name?: string;
    customer_phone?: string;
    customer_email?: string;
    inquiry_type?: string;
    service_type?: string;
    response_deadline?: string;
    customer_satisfaction?: number;
    follow_up_required?: boolean;
    resolution_notes?: string;
}

type NotificationItem = BaseNotification | CustomerNotification;

// 한글 컬럼명 매핑
const getKoreanFieldName = (field: string): string => {
    const fieldMap: Record<string, string> = {
        'type': '유형',
        'category': '카테고리',
        'title': '제목',
        'message': '내용',
        'priority': '우선순위',
        'status': '상태',
        'created_at': '생성일시',
        'updated_at': '수정일시',
        'processed_at': '처리일시',
    };
    return fieldMap[field] || field;
};

const getKoreanStatus = (status: string): string => {
    const statusMap: Record<string, string> = {
        'unread': '읽지않음',
        'read': '읽음',
        'processing': '처리중',
        'completed': '완료',
        'dismissed': '무시됨'
    };
    return statusMap[status] || status;
};

const getKoreanPriority = (priority: string): string => {
    const priorityMap: Record<string, string> = {
        'low': '낮음',
        'normal': '보통',
        'high': '높음',
        'urgent': '긴급'
    };
    return priorityMap[priority] || priority;
};

const getPriorityColor = (priority: string): string => {
    switch (priority) {
        case 'urgent': return 'bg-red-100 text-red-600';
        case 'high': return 'bg-orange-100 text-orange-600';
        case 'normal': return 'bg-blue-100 text-blue-600';
        case 'low': return 'bg-gray-100 text-gray-600';
        default: return 'bg-gray-100 text-gray-600';
    }
};

const getStatusColor = (status: string): string => {
    switch (status) {
        case 'unread': return 'bg-red-100 text-red-600';
        case 'read': return 'bg-blue-100 text-blue-600';
        case 'processing': return 'bg-yellow-100 text-yellow-600';
        case 'completed': return 'bg-green-100 text-green-600';
        case 'dismissed': return 'bg-gray-100 text-gray-600';
        default: return 'bg-gray-100 text-gray-600';
    }
};

export default function NotificationManagement() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [customerNotifications, setCustomerNotifications] = useState<any[]>([]);

    // 실시간 알림 팝업 상태
    const [popupNotifications, setPopupNotifications] = useState<NotificationItem[]>([]);
    const [showPopup, setShowPopup] = useState(false);

    // 필터 상태
    const [activeTab, setActiveTab] = useState<'business' | 'customer' | 'all'>('all');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [priorityFilter, setPriorityFilter] = useState<string>('all');

    // 모달 상태
    const [showModal, setShowModal] = useState(false);
    const [selectedNotification, setSelectedNotification] = useState<NotificationItem | null>(null);

    // 알림 처리 상태
    const [processingNote, setProcessingNote] = useState('');
    const [customerSatisfaction, setCustomerSatisfaction] = useState<number>(5);

    // 통계 데이터
    const [stats, setStats] = useState({
        total: 0,
        business: { total: 0, unread: 0, urgent: 0 },
        customer: { total: 0, unread: 0, urgent: 0 }
    });

    useEffect(() => {
        checkAuth();
    }, []);

    useEffect(() => {
        if (user) {
            loadNotifications();
            loadStats();

            // 실시간 알림 체크 (30초마다)
            const interval = setInterval(() => {
                loadNotifications();
            }, 30000);

            return () => clearInterval(interval);
        }
    }, [user, activeTab, statusFilter, priorityFilter]);

    const checkAuth = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) {
                router.push('/login');
                return;
            }

            const { data: userData } = await supabase
                .from('users')
                .select('role')
                .eq('id', session.user.id)
                .single();

            if (!userData || !['manager', 'admin'].includes(userData.role)) {
                alert('접근 권한이 없습니다.');
                router.push('/');
                return;
            }

            setUser(session.user);
        } catch (error) {
            console.error('인증 확인 실패:', error);
            router.push('/login');
        } finally {
            setLoading(false);
        }
    };

    const loadNotifications = async () => {
        try {
            setLoading(true);

            // 1. 기본 notifications 테이블 조회
            let businessQuery = supabase
                .from('notifications')
                .select('*')
                .eq('type', 'business')
                .order('created_at', { ascending: false });

            // 2. customer_notifications 테이블 조회
            let customerQuery = supabase
                .from('customer_notifications')
                .select('*')
                .order('created_at', { ascending: false });

            // 상태별 필터링
            if (statusFilter !== 'all') {
                businessQuery = businessQuery.eq('status', statusFilter);
                customerQuery = customerQuery.eq('status', statusFilter);
            }

            // 우선순위별 필터링  
            if (priorityFilter !== 'all') {
                businessQuery = businessQuery.eq('priority', priorityFilter);
                customerQuery = customerQuery.eq('priority', priorityFilter);
            }

            const [businessResult, customerResult] = await Promise.all([
                businessQuery,
                customerQuery
            ]);

            if (businessResult.error) {
                console.log('📋 notifications 테이블이 없거나 오류:', businessResult.error.message);
            }
            if (customerResult.error) {
                console.log('📋 customer_notifications 테이블이 없거나 오류:', customerResult.error.message);
            }

            const businessNotifications = businessResult.data || [];
            const customerNotifications = customerResult.data || [];

            // 통합 알림 목록 생성
            let allNotifications: NotificationItem[] = [];

            // 탭별 필터링
            if (activeTab === 'business' || activeTab === 'all') {
                allNotifications.push(...businessNotifications.map(n => ({ ...n, type: 'business' as const })));
            }
            if (activeTab === 'customer' || activeTab === 'all') {
                allNotifications.push(...customerNotifications.map(n => ({ ...n, type: 'customer' as const })));
            }

            // 시간순 정렬
            allNotifications.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

            setNotifications(allNotifications);
            setCustomerNotifications(customerNotifications);

            // 실시간 알림 팝업 체크 (읽지않은 긴급 알림)
            const urgentUnread = allNotifications.filter(n =>
                n.status === 'unread' && n.priority === 'urgent'
            );
            if (urgentUnread.length > 0) {
                setPopupNotifications(urgentUnread);
                setShowPopup(true);
            }

            console.log(`✅ 알림 로드 완료: 업무 ${businessNotifications.length}개, 고객 ${customerNotifications.length}개`);
        } catch (error) {
            console.error('알림 로드 실패:', error);
            setNotifications([]);
            setCustomerNotifications([]);
        } finally {
            setLoading(false);
        }
    };

    const loadStats = async () => {
        try {
            // 통계 데이터 로드
            const [businessStats, customerStats] = await Promise.all([
                supabase.from('notifications').select('*').eq('type', 'business'),
                supabase.from('customer_notifications').select('*')
            ]);

            const businessData = businessStats.data || [];
            const customerData = customerStats.data || [];

            setStats({
                total: businessData.length + customerData.length,
                business: {
                    total: businessData.length,
                    unread: businessData.filter(n => n.status === 'unread').length,
                    urgent: businessData.filter(n => n.priority === 'urgent').length
                },
                customer: {
                    total: customerData.length,
                    unread: customerData.filter(n => n.status === 'unread').length,
                    urgent: customerData.filter(n => n.priority === 'urgent').length
                }
            });
        } catch (error) {
            console.error('통계 로드 실패:', error);
        }
    };

    // 알림 처리 상태 업데이트
    const updateNotificationStatus = async (notificationId: string, status: 'read' | 'processing' | 'completed') => {
        try {
            const { data, error } = await supabase.rpc('complete_notification', {
                notification_id: notificationId,
                manager_id: user?.id || '',
                processing_note: processingNote || '',
                customer_satisfaction: status === 'completed' ? customerSatisfaction : null
            });

            if (error) throw error;

            // 로컬 상태 업데이트
            setNotifications(prev => prev.map(notification =>
                notification.id === notificationId
                    ? { ...notification, status, updated_at: new Date().toISOString() }
                    : notification
            ));

            setProcessingNote('');
            setCustomerSatisfaction(5);

            console.log(`✅ 알림 처리 완료: ${notificationId} → ${status}`);
        } catch (error) {
            console.error('❌ 알림 처리 실패:', error);
            alert('알림 처리에 실패했습니다.');
        }
    };

    // 실시간 알림 팝업 닫기
    const dismissPopup = async (notificationId?: string) => {
        if (notificationId) {
            await updateNotificationStatus(notificationId, 'read');
            setPopupNotifications(prev => prev.filter(n => n.id !== notificationId));
        }

        if (!notificationId || popupNotifications.length <= 1) {
            setShowPopup(false);
            setPopupNotifications([]);
        }
    };

    const handleNotificationClick = (notification: NotificationItem) => {
        setSelectedNotification(notification);
        setShowModal(true);

        // 읽지 않음 상태면 읽음으로 변경
        if (notification.status === 'unread') {
            updateNotificationStatus(notification.id, 'read');
        }
    };

    if (loading) {
        return (
            <ManagerLayout title="알림 관리" activeTab="notifications">
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                    <p className="ml-4 text-gray-600">알림을 불러오는 중...</p>
                </div>
            </ManagerLayout>
        );
    }

    return (
        <ManagerLayout title="📬 알림 관리" activeTab="notifications">
            <div className="space-y-6">
                {/* 통계 카드 */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <div className="flex items-center">
                            <div className="p-2 bg-blue-100 rounded-lg">
                                <span className="text-blue-600 text-xl">📋</span>
                            </div>
                            <div className="ml-4">
                                <p className="text-sm font-medium text-gray-600">전체 알림</p>
                                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <div className="flex items-center">
                            <div className="p-2 bg-red-100 rounded-lg">
                                <span className="text-red-600 text-xl">🔴</span>
                            </div>
                            <div className="ml-4">
                                <p className="text-sm font-medium text-gray-600">읽지않음</p>
                                <p className="text-2xl font-bold text-gray-900">
                                    {stats.business.unread + stats.customer.unread}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <div className="flex items-center">
                            <div className="p-2 bg-orange-100 rounded-lg">
                                <span className="text-orange-600 text-xl">🚨</span>
                            </div>
                            <div className="ml-4">
                                <p className="text-sm font-medium text-gray-600">긴급 알림</p>
                                <p className="text-2xl font-bold text-gray-900">
                                    {stats.business.urgent + stats.customer.urgent}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <div className="flex items-center">
                            <div className="p-2 bg-green-100 rounded-lg">
                                <span className="text-green-600 text-xl">👥</span>
                            </div>
                            <div className="ml-4">
                                <p className="text-sm font-medium text-gray-600">고객 알림</p>
                                <p className="text-2xl font-bold text-gray-900">{stats.customer.total}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 필터 및 탭 */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
                        {/* 탭 */}
                        <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
                            <button
                                onClick={() => setActiveTab('all')}
                                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'all'
                                        ? 'bg-white text-blue-600 shadow-sm'
                                        : 'text-gray-600 hover:text-gray-800'
                                    }`}
                            >
                                전체 알림
                            </button>
                            <button
                                onClick={() => setActiveTab('business')}
                                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'business'
                                        ? 'bg-white text-blue-600 shadow-sm'
                                        : 'text-gray-600 hover:text-gray-800'
                                    }`}
                            >
                                💼 업무 알림
                            </button>
                            <button
                                onClick={() => setActiveTab('customer')}
                                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'customer'
                                        ? 'bg-white text-blue-600 shadow-sm'
                                        : 'text-gray-600 hover:text-gray-800'
                                    }`}
                            >
                                👥 고객 알림
                            </button>
                        </div>

                        {/* 필터 */}
                        <div className="flex space-x-4">
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                                <option value="all">모든 상태</option>
                                <option value="unread">읽지 않음</option>
                                <option value="read">읽음</option>
                                <option value="processing">처리중</option>
                                <option value="completed">완료</option>
                            </select>

                            <select
                                value={priorityFilter}
                                onChange={(e) => setPriorityFilter(e.target.value)}
                                className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                                <option value="all">모든 우선순위</option>
                                <option value="urgent">긴급</option>
                                <option value="high">높음</option>
                                <option value="normal">보통</option>
                                <option value="low">낮음</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* 알림 목록 */}
                <div className="bg-white rounded-lg shadow-sm">
                    {notifications.length === 0 ? (
                        <div className="p-12 text-center">
                            <span className="text-4xl mb-4 block">📭</span>
                            <h3 className="text-lg font-medium text-gray-900 mb-2">알림이 없습니다</h3>
                            <p className="text-gray-600">새로운 알림이 도착하면 여기에 표시됩니다.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-200">
                            {notifications.map((notification) => (
                                <div
                                    key={notification.id}
                                    className={`p-6 cursor-pointer hover:bg-gray-50 transition-colors ${notification.status === 'unread' ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                                        }`}
                                    onClick={() => handleNotificationClick(notification)}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(notification.priority)}`}>
                                                    {notification.priority === 'urgent' && '🚨 '}
                                                    {notification.priority === 'high' && '⚡ '}
                                                    {notification.priority === 'normal' && '📋 '}
                                                    {notification.priority === 'low' && '📄 '}
                                                    {getKoreanPriority(notification.priority)}
                                                </span>
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(notification.status)}`}>
                                                    {notification.status === 'unread' && '🔴 '}
                                                    {notification.status === 'read' && '👁️ '}
                                                    {notification.status === 'processing' && '⚙️ '}
                                                    {notification.status === 'completed' && '✅ '}
                                                    {notification.status === 'dismissed' && '❌ '}
                                                    {getKoreanStatus(notification.status)}
                                                </span>
                                                <span className="px-2 py-1 bg-gray-100 rounded-full text-xs font-medium text-gray-600">
                                                    {notification.type === 'business' ? '💼 업무' : '👥 고객'}
                                                </span>
                                                <span className="px-2 py-1 bg-purple-100 rounded-full text-xs font-medium text-purple-600">
                                                    {notification.category}
                                                </span>
                                            </div>

                                            <h3 className="text-lg font-medium text-gray-900 mb-1">
                                                {notification.title}
                                            </h3>
                                            <p className="text-gray-600 text-sm line-clamp-2 mb-3">
                                                {notification.message}
                                            </p>

                                            <div className="flex items-center justify-between">
                                                <div className="text-xs text-gray-500">
                                                    {new Date(notification.created_at).toLocaleString('ko-KR')}
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    {notification.assigned_to && (
                                                        <span className="text-xs text-blue-600">
                                                            담당자: {notification.assigned_to}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 알림 상세 모달 */}
                {showModal && selectedNotification && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                            <div className="p-6">
                                <div className="flex justify-between items-start mb-4">
                                    <h3 className="text-lg font-bold text-gray-900">알림 상세 정보</h3>
                                    <button
                                        onClick={() => setShowModal(false)}
                                        className="text-gray-400 hover:text-gray-600 text-xl"
                                    >
                                        ×
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center gap-3">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(selectedNotification.priority)}`}>
                                            {getKoreanPriority(selectedNotification.priority)}
                                        </span>
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(selectedNotification.status)}`}>
                                            {getKoreanStatus(selectedNotification.status)}
                                        </span>
                                        <span className="px-2 py-1 bg-gray-100 rounded-full text-xs font-medium text-gray-600">
                                            {selectedNotification.type === 'business' ? '💼 업무' : '👥 고객'}
                                        </span>
                                        <span className="px-2 py-1 bg-purple-100 rounded-full text-xs font-medium text-purple-600">
                                            {selectedNotification.category}
                                        </span>
                                    </div>

                                    <div>
                                        <h4 className="font-medium text-gray-900 mb-2">{getKoreanFieldName('title')}</h4>
                                        <p className="text-gray-700">{selectedNotification.title}</p>
                                    </div>

                                    <div>
                                        <h4 className="font-medium text-gray-900 mb-2">{getKoreanFieldName('message')}</h4>
                                        <p className="text-gray-700 whitespace-pre-line">{selectedNotification.message}</p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                            <span className="font-medium text-gray-600">{getKoreanFieldName('created_at')}:</span>
                                            <p className="text-gray-800">{new Date(selectedNotification.created_at).toLocaleString('ko-KR')}</p>
                                        </div>
                                        {selectedNotification.processed_at && (
                                            <div>
                                                <span className="font-medium text-gray-600">{getKoreanFieldName('processed_at')}:</span>
                                                <p className="text-gray-800">{new Date(selectedNotification.processed_at).toLocaleString('ko-KR')}</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* 처리 메모 입력 */}
                                    {selectedNotification.status !== 'completed' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                처리 메모
                                            </label>
                                            <textarea
                                                value={processingNote}
                                                onChange={(e) => setProcessingNote(e.target.value)}
                                                rows={3}
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                                placeholder="처리 내용을 입력하세요..."
                                            />
                                        </div>
                                    )}

                                    {/* 고객 만족도 (고객 알림인 경우) */}
                                    {selectedNotification.type === 'customer' && selectedNotification.status !== 'completed' && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                고객 만족도 (1-5점)
                                            </label>
                                            <select
                                                value={customerSatisfaction}
                                                onChange={(e) => setCustomerSatisfaction(Number(e.target.value))}
                                                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            >
                                                <option value={5}>5점 (매우 만족)</option>
                                                <option value={4}>4점 (만족)</option>
                                                <option value={3}>3점 (보통)</option>
                                                <option value={2}>2점 (불만족)</option>
                                                <option value={1}>1점 (매우 불만족)</option>
                                            </select>
                                        </div>
                                    )}
                                </div>

                                {/* 액션 버튼 */}
                                <div className="flex justify-end space-x-3 mt-6">
                                    <button
                                        onClick={() => setShowModal(false)}
                                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                                    >
                                        닫기
                                    </button>

                                    {selectedNotification.status === 'unread' && (
                                        <button
                                            onClick={() => updateNotificationStatus(selectedNotification.id, 'processing')}
                                            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                                        >
                                            처리 시작
                                        </button>
                                    )}

                                    {selectedNotification.status === 'processing' && (
                                        <button
                                            onClick={() => updateNotificationStatus(selectedNotification.id, 'completed')}
                                            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                                        >
                                            처리 완료
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 실시간 알림 팝업 */}
                {showPopup && popupNotifications.length > 0 && (
                    <div className="fixed top-4 right-4 z-50 space-y-2">
                        {popupNotifications.map((notification) => (
                            <div
                                key={notification.id}
                                className="bg-red-500 text-white rounded-lg shadow-lg p-4 max-w-sm animate-bounce"
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center">
                                        <span className="text-lg mr-2">🚨</span>
                                        <span className="font-bold text-sm">{getKoreanPriority(notification.priority)} 알림</span>
                                    </div>
                                    <button
                                        onClick={() => dismissPopup(notification.id)}
                                        className="text-white hover:text-gray-200 ml-2"
                                    >
                                        ×
                                    </button>
                                </div>

                                <div className="mb-2">
                                    <div className="font-medium text-sm">{notification.title}</div>
                                    <div className="text-xs opacity-90 mt-1 line-clamp-2">{notification.message}</div>
                                </div>

                                <div className="flex justify-between items-center text-xs">
                                    <span className="opacity-75">{getKoreanFieldName('type')}: {notification.type === 'business' ? '업무' : '고객'}</span>
                                    <div className="flex space-x-1">
                                        <button
                                            onClick={() => {
                                                setSelectedNotification(notification);
                                                setShowModal(true);
                                                dismissPopup(notification.id);
                                            }}
                                            className="bg-white bg-opacity-20 px-2 py-1 rounded text-xs hover:bg-opacity-30"
                                        >
                                            상세보기
                                        </button>
                                        <button
                                            onClick={() => updateNotificationStatus(notification.id, 'processing')}
                                            className="bg-white bg-opacity-20 px-2 py-1 rounded text-xs hover:bg-opacity-30"
                                        >
                                            처리하기
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}

                        {popupNotifications.length > 1 && (
                            <div className="bg-gray-800 text-white rounded-lg p-2 text-center">
                                <button
                                    onClick={() => dismissPopup()}
                                    className="text-xs hover:text-gray-300"
                                >
                                    모든 알림 닫기 ({popupNotifications.length}개)
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </ManagerLayout>
    );
}
