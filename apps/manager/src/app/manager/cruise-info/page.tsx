'use client';

import React, { useState, useEffect, useCallback } from 'react';
import ManagerLayout from '@/components/ManagerLayout';
import supabase from '@/lib/supabase';

type CruiseLocation = {
  id: string;
  kr_name: string;
  en_name: string;
  pier_location: string | null;
};

const EMPTY_FORM: Omit<CruiseLocation, 'id'> = { kr_name: '', en_name: '', pier_location: '' };

export default function CruiseInfoPage() {
  const [rows, setRows] = useState<CruiseLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string>('');
  const [search, setSearch] = useState('');

  // 모달 상태
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CruiseLocation | null>(null);
  const [form, setForm] = useState<Omit<CruiseLocation, 'id'>>(EMPTY_FORM);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('cruise_location')
      .select('id, kr_name, en_name, pier_location')
      .order('kr_name');
    if (!error) setRows(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (row: CruiseLocation) => {
    setEditTarget(row);
    setForm({ kr_name: row.kr_name, en_name: row.en_name, pier_location: row.pier_location ?? '' });
    setFormError('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.kr_name.trim() || !form.en_name.trim()) {
      setFormError('한글명과 영문명은 필수 항목입니다.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      if (editTarget) {
        const { error } = await supabase
          .from('cruise_location')
          .update({ kr_name: form.kr_name.trim(), en_name: form.en_name.trim(), pier_location: form.pier_location?.trim() || null })
          .eq('id', editTarget.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('cruise_location')
          .insert({ kr_name: form.kr_name.trim(), en_name: form.en_name.trim(), pier_location: form.pier_location?.trim() || null });
        if (error) throw error;
      }
      setModalOpen(false);
      await load();
    } catch (err: any) {
      setFormError(err?.message || '저장 중 오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: CruiseLocation) => {
    if (!confirm(`"${row.kr_name}" 항목을 삭제하시겠습니까?`)) return;
    const { error } = await supabase.from('cruise_location').delete().eq('id', row.id);
    if (error) { alert('삭제 실패: ' + error.message); return; }
    await load();
  };

  const handleBackfillPierLocation = async () => {
    if (!confirm('현재 선착장으로 남아있는 SHT 차량의 픽업/드랍 위치를 최신 크루즈 선착장으로 보정하시겠습니까?')) {
      return;
    }

    setBackfilling(true);
    setBackfillResult('');
    try {
      const res = await fetch('/api/admin/cruise-pier-backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || '선착장 보정 처리에 실패했습니다.');
      }

      const msg = `보정 완료: ${json.updatedCount}건 (대상 ${json.targetCount}건)`;
      setBackfillResult(msg);
      alert(msg);
    } catch (err: any) {
      const message = err?.message || '선착장 보정 처리 중 오류가 발생했습니다.';
      setBackfillResult(`오류: ${message}`);
      alert(message);
    } finally {
      setBackfilling(false);
    }
  };

  const filtered = rows.filter(r =>
    r.kr_name.includes(search) || r.en_name.toLowerCase().includes(search.toLowerCase()) || (r.pier_location || '').includes(search)
  );

  return (
    <ManagerLayout title="크루즈 정보" activeTab="cruise-info">
      <div className="p-4 max-w-4xl mx-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-700">🚢 크루즈 정보 관리</h1>
            <p className="text-xs text-gray-500 mt-0.5">크루즈 로케이션(cruise_location) 데이터를 관리합니다.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBackfillPierLocation}
              disabled={backfilling}
              className="px-3 py-1.5 text-xs bg-emerald-500 text-white rounded-md hover:bg-emerald-600 transition-colors font-medium disabled:opacity-50"
            >
              {backfilling ? '보정 중...' : '기존 선착장 보정'}
            </button>
            <button
              onClick={openAdd}
              className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors font-medium"
            >
              + 추가
            </button>
          </div>
        </div>

        {backfillResult && (
          <p className="mb-3 text-xs text-gray-600 bg-emerald-50 border border-emerald-100 rounded-md px-3 py-2">
            {backfillResult}
          </p>
        )}

        {/* 검색 */}
        <div className="mb-3">
          <input
            type="text"
            placeholder="크루즈명 / 영문명 / 선착장 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-300"
          />
        </div>

        {/* 테이블 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
          {loading ? (
            <div className="flex justify-center items-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-400">데이터가 없습니다.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-2.5 text-left font-medium">한글명</th>
                  <th className="px-4 py-2.5 text-left font-medium">영문명</th>
                  <th className="px-4 py-2.5 text-left font-medium">선착장</th>
                  <th className="px-4 py-2.5 text-center font-medium w-24">관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, idx) => (
                  <tr key={row.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${idx % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                    <td className="px-4 py-2.5 text-gray-700 font-medium">{row.kr_name}</td>
                    <td className="px-4 py-2.5 text-gray-500">{row.en_name}</td>
                    <td className="px-4 py-2.5 text-gray-500">{row.pier_location || <span className="text-gray-300">-</span>}</td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        onClick={() => openEdit(row)}
                        className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors mr-1"
                      >
                        수정
                      </button>
                      <button
                        onClick={() => handleDelete(row)}
                        className="px-2 py-1 text-xs bg-red-50 text-red-500 rounded hover:bg-red-100 transition-colors"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-2">총 {filtered.length}건 {search && `(전체 ${rows.length}건 중 필터)`}</p>
      </div>

      {/* 추가/수정 모달 */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-5">
            <h2 className="text-base font-semibold text-gray-700 mb-4">
              {editTarget ? '✏️ 크루즈 정보 수정' : '➕ 크루즈 정보 추가'}
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">한글명 <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={form.kr_name}
                  onChange={e => setForm(f => ({ ...f, kr_name: e.target.value }))}
                  placeholder="예: 엠버서더 크루즈"
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">영문명 <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  value={form.en_name}
                  onChange={e => setForm(f => ({ ...f, en_name: e.target.value }))}
                  placeholder="예: Ambassador Cruise"
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">선착장</label>
                <input
                  type="text"
                  value={form.pier_location ?? ''}
                  onChange={e => setForm(f => ({ ...f, pier_location: e.target.value }))}
                  placeholder="예: Tuan Chau, Ha Long"
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-300"
                />
              </div>
            </div>

            {formError && (
              <p className="mt-2 text-xs text-red-500">{formError}</p>
            )}

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setModalOpen(false)}
                className="px-3 py-1.5 text-xs text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-1.5 text-xs bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ManagerLayout>
  );
}
