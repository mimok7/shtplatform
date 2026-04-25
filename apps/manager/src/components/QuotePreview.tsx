'use client';
import React from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export default function QuotePreview({ quote }: { quote: any }) {
  const handleDownloadPDF = async () => {
    const element = document.getElementById('quote-preview');
    if (!element) return;

    const canvas = await html2canvas(element);
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const width = pdf.internal.pageSize.getWidth();
    const height = (canvas.height * width) / canvas.width;

    pdf.addImage(imgData, 'PNG', 0, 0, width, height);
    pdf.save(`견적서_${quote.id}.pdf`);
  };

  return (
    <>
      <div id="quote-preview" className="p-4 bg-gray-50 rounded mb-4">
        <h2 className="text-lg font-bold mb-2">📄 견적 확인서</h2>

        <div className="text-sm space-y-1">
          <p>📅 체크인: {quote.checkin}</p>
          <p>🛳️ 크루즈: {quote.cruise_code}</p>
          <p>🗓️ 일정: {quote.schedule_code}</p>
          <p>💳 결제방식: {quote.payment_code}</p>
          <p>🔖 할인율: {quote.discount_rate}%</p>
        </div>

        <hr className="my-4" />

        {quote.quote_room.map((room: any, i: number) => (
          <div key={room.id} className="mb-4">
            <h4 className="font-semibold mb-1">
              🏨 객실 {i + 1}: {room.room_info?.name || room.room_code}
            </h4>
            <ul className="pl-5 list-disc text-sm space-y-1">
              {room.quote_room_detail.map((detail: any) => (
                <li key={detail.id}>
                  {detail.category_info?.name || detail.category} – {detail.person_count}명 · 💰{' '}
                  {detail.room_total_price?.toLocaleString()}동
                </li>
              ))}
            </ul>
          </div>
        ))}

        <hr className="my-4" />

        <p>🛏️ 객실 총액: {quote.quote_price_summary?.total_room_price?.toLocaleString()}동</p>
        <p>🚐 차량 총액: {quote.quote_price_summary?.total_car_price?.toLocaleString()}동</p>
        <p className="font-bold text-lg mt-2">
          💰 최종 금액: {quote.quote_price_summary?.final_total?.toLocaleString()}동
        </p>
      </div>

      <button
        onClick={handleDownloadPDF}
        className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        📄 PDF 저장
      </button>
    </>
  );
}

