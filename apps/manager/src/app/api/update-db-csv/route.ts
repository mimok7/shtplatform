import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
    try {
        const { csvContent } = await request.json();

        if (!csvContent) {
            return NextResponse.json(
                { error: 'CSV 내용이 제공되지 않았습니다.' },
                { status: 400 }
            );
        }

        const dbCsvPath = path.join(process.cwd(), 'sql', 'db.csv');

        // sql 디렉토리가 없으면 생성
        const sqlDir = path.dirname(dbCsvPath);
        if (!fs.existsSync(sqlDir)) {
            fs.mkdirSync(sqlDir, { recursive: true });
        }

        // 기존 파일 백업 (있다면)
        if (fs.existsSync(dbCsvPath)) {
            const backupPath = path.join(
                sqlDir,
                `db_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`
            );
            fs.copyFileSync(dbCsvPath, backupPath);
        }

        // 새 내용으로 파일 업데이트
        fs.writeFileSync(dbCsvPath, csvContent, 'utf-8');

        return NextResponse.json({
            success: true,
            message: `db.csv 파일이 성공적으로 업데이트되었습니다. (${new Date().toLocaleString()})`
        });
    } catch (error) {
        console.error('CSV 파일 업데이트 오류:', error);
        return NextResponse.json(
            { error: '파일 업데이트에 실패했습니다.' },
            { status: 500 }
        );
    }
}
