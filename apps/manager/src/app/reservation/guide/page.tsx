'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function ReservationGuidePage() {
    const router = useRouter();
    const [agreed, setAgreed] = useState(false);

    const handleProceed = () => {
        if (!agreed) {
            alert('안내사항을 확인하고 동의해주세요.');
            return;
        }
        router.push('/reservation/cruise');
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
            <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
                {/* 헤더 */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500 rounded-full mb-4">
                        <span className="text-3xl">🎉</span>
                    </div>
                    <h1 className="text-3xl font-bold text-gray-800 mb-2">
                        스테이하롱 예약에 감사드립니다
                    </h1>
                    <p className="text-gray-600">
                        아래 내용을 잘 읽어보시고 예약을 진행해주시면 감사하겠습니다
                    </p>
                </div>

                {/* 메인 컨텐츠 */}
                <div className="space-y-6">
                    {/* 이메일 정보 수집 안내 */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-4">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">🔒</span>
                                <h2 className="text-xl font-bold text-white">예약자의 이메일 정보 수집 안내</h2>
                            </div>
                        </div>
                        <div className="px-6 py-5">
                            <p className="text-gray-700 mb-4">
                                스테이하롱은 아래와 같은 경우에 한하여 고객의 이메일 정보를 사용할 수 있습니다.
                            </p>
                            <div className="space-y-3">
                                <div className="flex items-start gap-3">
                                    <span className="text-green-500 text-xl flex-shrink-0">✓</span>
                                    <p className="text-gray-700">예약확인서의 이메일 발송</p>
                                </div>
                                <div className="flex items-start gap-3">
                                    <span className="text-green-500 text-xl flex-shrink-0">✓</span>
                                    <p className="text-gray-700">긴급한 정보전달, 국가재난 공문의 사본 발송 등</p>
                                </div>
                                <div className="flex items-start gap-3">
                                    <span className="text-green-500 text-xl flex-shrink-0">✓</span>
                                    <p className="text-gray-700">신용카드 결제정보 입력에 따른 "고객의 이메일 주소" 기재란</p>
                                </div>
                            </div>
                            <div className="mt-4 bg-yellow-50 border-l-4 border-yellow-400 px-4 py-3 rounded">
                                <div className="flex items-start gap-2">
                                    <span className="text-yellow-600 text-lg flex-shrink-0">⚠️</span>
                                    <p className="text-sm text-yellow-800">
                                        이 외 어떠한 경우에도 스테이하롱트래블은 고객의 이메일 주소를 사용하지 않습니다.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 예약신청 진행과정 */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="bg-gradient-to-r from-purple-500 to-purple-600 px-6 py-4">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">📋</span>
                                <h2 className="text-xl font-bold text-white">예약신청 진행과정</h2>
                            </div>
                        </div>
                        <div className="px-6 py-5">
                            <div className="space-y-6">
                                {/* 1단계 */}
                                <div className="flex items-start gap-4">
                                    <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                                        <span className="text-blue-600 font-bold">1</span>
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xl">✏️</span>
                                            <h3 className="text-lg font-semibold text-gray-800">신청서 작성</h3>
                                        </div>
                                        <p className="text-gray-600">예약 정보를 입력해주세요</p>
                                    </div>
                                </div>

                                <div className="flex justify-center">
                                    <div className="text-gray-300 text-2xl">↓</div>
                                </div>

                                {/* 2단계 */}
                                <div className="flex items-start gap-4">
                                    <div className="flex-shrink-0 w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                                        <span className="text-green-600 font-bold">2</span>
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xl">💬</span>
                                            <h3 className="text-lg font-semibold text-gray-800">최종견적 전달</h3>
                                        </div>
                                        <p className="text-gray-600">상담을 통해 견적을 확인하세요</p>
                                    </div>
                                </div>

                                <div className="flex justify-center">
                                    <div className="text-gray-300 text-2xl">↓</div>
                                </div>

                                {/* 3단계 */}
                                <div className="flex items-start gap-4">
                                    <div className="flex-shrink-0 w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                                        <span className="text-purple-600 font-bold">3</span>
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xl">💳</span>
                                            <h3 className="text-lg font-semibold text-gray-800">결제진행</h3>
                                        </div>
                                        <p className="text-gray-600">안전하게 결제를 완료하세요</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 결제기한 안내 */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-4">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">⏰</span>
                                <h2 className="text-xl font-bold text-white">결제기한에 대한 안내</h2>
                            </div>
                        </div>
                        <div className="px-6 py-5">
                            <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 mb-4">
                                <p className="text-orange-800 font-semibold">결제기한은 2시간 이내</p>
                                <p className="text-sm text-orange-700 mt-1">
                                    크루즈는 2시간 이상, 숙박이나 부킹 Lock을 지정해주지 않습니다.
                                </p>
                            </div>
                            <div className="bg-red-50 border-l-4 border-red-400 px-4 py-3 rounded">
                                <div className="flex items-start gap-2">
                                    <span className="text-red-600 text-lg flex-shrink-0">⚠️</span>
                                    <div>
                                        <p className="font-semibold text-red-800 mb-1">2시간 이내 결제가 불가능한 경우</p>
                                        <p className="text-sm text-red-700">
                                            2시간 이내 결제가 어려우신 경우, 반드시 스테이하롱에 말씀해주세요.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 여권정보 제출 안내 */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 px-6 py-4">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">📘</span>
                                <h2 className="text-xl font-bold text-white">여권정보 제출의 필수 안내</h2>
                            </div>
                        </div>
                        <div className="px-6 py-5">
                            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4">
                                <div className="flex items-start gap-2">
                                    <span className="text-blue-600 text-lg flex-shrink-0">🔍</span>
                                    <p className="text-blue-800 font-semibold">
                                        여권은 바르게 표시 후 카톡 상담방으로 보내주세요.
                                    </p>
                                </div>
                            </div>
                            <ul className="space-y-2 text-gray-700">
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-500 flex-shrink-0">•</span>
                                    <span>크루즈는 승선인원에 대한 여권사본, 승객정보를 정부에 등록해야 합니다.</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-500 flex-shrink-0">•</span>
                                    <span>크루즈에 승선하는 모든 승객에 대한 여권사본을 당사로 보내주셔야 합니다.</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-blue-500 flex-shrink-0">•</span>
                                    <span>
                                        관련 상세한 안내는 스테이하롱에서 전담드린 안내 메시지 내 관련링크에서 확인하실 수 있습니다.
                                    </span>
                                </li>
                            </ul>
                        </div>
                    </div>

                    {/* 정보 오기재 주의 */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="bg-gradient-to-r from-red-500 to-red-600 px-6 py-4">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">⚠️</span>
                                <h2 className="text-xl font-bold text-white">정보 오기재 주의</h2>
                            </div>
                        </div>
                        <div className="px-6 py-5">
                            <p className="text-gray-800 font-semibold mb-4">
                                신청서 제출 전 다시 한번 꼭! 확인해주세요!
                            </p>
                            <ul className="space-y-2 text-gray-700">
                                <li className="flex items-start gap-2">
                                    <span className="text-red-500 flex-shrink-0">•</span>
                                    <span>모든 부분은 신청서에 기재된 내용으로만 진행됩니다.</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-red-500 flex-shrink-0">•</span>
                                    <span>
                                        반드시 반영을 원하시는 부분(카톡물음 등)은 채팅 시 말씀주셔도 기타 요청사항에 반드시 기재해주시고,
                                    </span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="text-red-500 flex-shrink-0">•</span>
                                    <span>정보가 잘못 입력된 부분이 없는지 꼭 한번 더 확인 후 제출해주세요.</span>
                                </li>
                            </ul>
                        </div>
                    </div>

                    {/* 동의 체크박스 및 버튼 */}
                    <div className="bg-white rounded-2xl shadow-lg border-2 border-blue-200 overflow-hidden sticky bottom-4">
                        <div className="px-6 py-5">
                            <label className="flex items-start gap-3 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={agreed}
                                    onChange={(e) => setAgreed(e.target.checked)}
                                    className="w-5 h-5 mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                />
                                <span className="text-gray-700 group-hover:text-gray-900 transition-colors">
                                    위의 모든 안내사항을 확인했으며, 이에 동의합니다.
                                </span>
                            </label>
                            <button
                                onClick={handleProceed}
                                disabled={!agreed}
                                className={`w-full mt-4 py-4 rounded-xl font-bold text-lg transition-all transform ${agreed
                                        ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]'
                                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                    }`}
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <span className="text-xl">✅</span>
                                    <span>이해했습니다. 예약폼으로 이동하기</span>
                                    <span className="text-xl">→</span>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>

                {/* 푸터 */}
                <div className="text-center mt-8 text-sm text-gray-500">
                    <p>문의사항이 있으시면 카카오톡 채널로 연락 주세요</p>
                </div>
            </div>
        </div>
    );
}
