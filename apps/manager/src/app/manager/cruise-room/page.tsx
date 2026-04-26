'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ManagerLayout from '@/components/ManagerLayout';
import supabase from '@/lib/supabase';

type CruiseRoomRow = {
  id: string;
  cruise_name: string | null;
  room_name: string | null;
  description: string | null;
  room_description: string | null;
  room_image: string | null;
  images: any;
  updated_at: string | null;
};

type ReviewForm = {
  cruise_name: string;
  room_name: string;
  description: string;
  room_description: string;
  room_image: string;
  images_text: string;
};

const EMPTY_FORM: ReviewForm = {
  cruise_name: '',
  room_name: '',
  description: '',
  room_description: '',
  room_image: '',
  images_text: '',
};

function imagesToText(images: any): string {
  if (Array.isArray(images)) {
    return images.map((v) => String(v || '').trim()).filter(Boolean).join('\n');
  }
  if (typeof images === 'string') {
    const trimmed = images.trim();
    if (!trimmed) return '';
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v || '').trim()).filter(Boolean).join('\n');
      }
    } catch {
      return trimmed;
    }
    return trimmed;
  }
  return '';
}

function textToImages(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/\r?\n|,/)
        .map((v) => v.trim())
        .filter(Boolean)
    )
  );
}

function rowToForm(row: CruiseRoomRow): ReviewForm {
  return {
    cruise_name: row.cruise_name || '',
    room_name: row.room_name || '',
    description: row.description || '',
    room_description: row.room_description || '',
    room_image: row.room_image || '',
    images_text: imagesToText(row.images),
  };
}

export default function CruiseRoomReviewPage() {
  const [rows, setRows] = useState<CruiseRoomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>('');
  const [form, setForm] = useState<ReviewForm>(EMPTY_FORM);
  const [draftInput, setDraftInput] = useState('');
  const [draftError, setDraftError] = useState('');

  const loadRows = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('cruise_info')
      .select('id, cruise_name, room_name, description, room_description, room_image, images, updated_at')
      .order('updated_at', { ascending: false })
      .limit(2000);

    if (error) {
      alert(`데이터 조회 실패: ${error.message}`);
      setRows([]);
      setLoading(false);
      return;
    }

    const nextRows = (data || []) as CruiseRoomRow[];
    setRows(nextRows);
    if (nextRows.length > 0) {
      const firstId = nextRows[0].id;
      setSelectedId((prev) => prev || firstId);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    if (!selectedId) {
      setForm(EMPTY_FORM);
      return;
    }
    const row = rows.find((r) => r.id === selectedId);
    if (!row) return;
    setForm(rowToForm(row));
  }, [selectedId, rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const cruise = String(row.cruise_name || '').toLowerCase();
      const room = String(row.room_name || '').toLowerCase();
      const desc = String(row.room_description || '').toLowerCase();
      return cruise.includes(q) || room.includes(q) || desc.includes(q);
    });
  }, [rows, search]);

  const handleSave = async () => {
    if (!selectedId) {
      alert('먼저 수정할 객실을 선택해주세요.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/manager/cruise-room/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedId,
          cruise_name: form.cruise_name,
          room_name: form.room_name,
          description: form.description,
          room_description: form.room_description,
          room_image: form.room_image,
          images: textToImages(form.images_text),
        }),
      });

      const result = await response.json();
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || '저장 중 오류가 발생했습니다.');
      }

      await loadRows();
      if (result?.id) {
        setSelectedId(result.id);
      }
      alert('저장되었습니다.');
    } catch (error: any) {
      alert(`저장 실패: ${error?.message || '알 수 없는 오류'}`);
    } finally {
      setSaving(false);
    }
  };

  const applyDraftToForm = () => {
    setDraftError('');
    try {
      const parsed = JSON.parse(draftInput);
      const firstCruise = parsed?.extracted?.[0];
      const firstRoom = firstCruise?.rooms?.[0];

      if (!firstCruise || !firstRoom) {
        setDraftError('추출 JSON 형식이 다릅니다. extracted[0].rooms[0] 구조를 확인해주세요.');
        return;
      }

      const cruiseNameCandidate = firstCruise?.cruise_name_candidates?.[0]?.name || firstCruise?.cruise_name_raw || '';
      const roomNameCandidate = firstRoom?.room_name_candidates?.[0]?.name || firstRoom?.room_name_raw || '';
      const roomImages = Array.isArray(firstRoom?.room_images_candidates) ? firstRoom.room_images_candidates : [];

      setForm((prev) => ({
        ...prev,
        cruise_name: cruiseNameCandidate || prev.cruise_name,
        room_name: roomNameCandidate || prev.room_name,
        description: firstCruise?.cruise_intro_raw || prev.description,
        room_description: firstRoom?.room_intro_raw || prev.room_description,
        room_image: roomImages[0] || prev.room_image,
        images_text: roomImages.length > 0 ? roomImages.join('\n') : prev.images_text,
      }));
    } catch (error: any) {
      setDraftError(error?.message || 'JSON 파싱 실패');
    }
  };

  return (
    <ManagerLayout title="크루즈 룸 검수" activeTab="cruise-room">
      <div className="p-4 w-full space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-700">🛏️ 크루즈 룸 검수</h1>
            <p className="text-xs text-gray-500 mt-0.5">추출 결과를 검수하고 cruise_info에 확정 저장합니다.</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !selectedId}
            className="px-3 py-1.5 text-xs bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors font-medium disabled:opacity-50"
          >
            {saving ? '저장 중...' : '확정 저장'}
          </button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-1 bg-white rounded-lg border border-gray-100 p-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="크루즈명/객실명 검색"
              className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-300 mb-3"
            />

            <div className="max-h-[70vh] overflow-auto space-y-2">
              {loading ? (
                <div className="text-sm text-gray-400 py-8 text-center">불러오는 중...</div>
              ) : filteredRows.length === 0 ? (
                <div className="text-sm text-gray-400 py-8 text-center">데이터가 없습니다.</div>
              ) : (
                filteredRows.map((row) => {
                  const active = row.id === selectedId;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => setSelectedId(row.id)}
                      className={`w-full text-left rounded-md border px-3 py-2 transition-colors ${
                        active ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-200'
                      }`}
                    >
                      <p className="text-sm font-medium text-gray-800 truncate">{row.cruise_name || '-'}</p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{row.room_name || '-'}</p>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="xl:col-span-2 space-y-4">
            <div className="bg-white rounded-lg border border-gray-100 p-4 space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">기본 검수 폼</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">크루즈명</label>
                  <input
                    value={form.cruise_name}
                    onChange={(e) => setForm((prev) => ({ ...prev, cruise_name: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">객실명</label>
                  <input
                    value={form.room_name}
                    onChange={(e) => setForm((prev) => ({ ...prev, room_name: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">크루즈 소개 (description)</label>
                <textarea
                  rows={4}
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">객실 소개 (room_description)</label>
                <textarea
                  rows={5}
                  value={form.room_description}
                  onChange={(e) => setForm((prev) => ({ ...prev, room_description: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">대표 이미지 (room_image)</label>
                <input
                  value={form.room_image}
                  onChange={(e) => setForm((prev) => ({ ...prev, room_image: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">추가 이미지 목록 (images, 줄바꿈 또는 콤마 구분)</label>
                <textarea
                  rows={4}
                  value={form.images_text}
                  onChange={(e) => setForm((prev) => ({ ...prev, images_text: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md"
                />
              </div>
            </div>

            <div className="bg-white rounded-lg border border-gray-100 p-4 space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">자동 추출 JSON 반영 (초안)</h2>
              <p className="text-xs text-gray-500">`extract-cruise-content-draft.js` 출력 JSON을 붙여넣고 기본값을 폼에 채웁니다.</p>
              <textarea
                rows={8}
                value={draftInput}
                onChange={(e) => setDraftInput(e.target.value)}
                placeholder="{\"extracted\":[...]}"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md font-mono"
              />
              {draftError && <p className="text-xs text-red-500">{draftError}</p>}
              <button
                type="button"
                onClick={applyDraftToForm}
                className="px-3 py-1.5 text-xs bg-gray-700 text-white rounded-md hover:bg-gray-800"
              >
                JSON 값으로 폼 채우기
              </button>
            </div>
          </div>
        </div>
      </div>
    </ManagerLayout>
  );
}
