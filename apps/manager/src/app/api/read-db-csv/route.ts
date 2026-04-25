import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
    try {
        const dbCsvPath = path.join(process.cwd(), 'sql', 'db.csv');

        if (!fs.existsSync(dbCsvPath)) {
            return NextResponse.json(
                { error: 'db.csv 파일을 찾을 수 없습니다.' },
                { status: 404 }
            );
        }

        const csvContent = fs.readFileSync(dbCsvPath, 'utf-8');

        return new NextResponse(csvContent, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv',
            },
        });
    } catch (error) {
        console.error('CSV 파일 읽기 오류:', error);
        return NextResponse.json(
            { error: '파일 읽기에 실패했습니다.' },
            { status: 500 }
        );
    }
}
