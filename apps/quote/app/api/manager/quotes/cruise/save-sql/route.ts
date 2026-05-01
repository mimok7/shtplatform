import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

type RoomEntry = {
    room_code: string;
    person_count: number;
    extra_count?: number;
    single_count?: number;
    base_price?: number;
};

type CarEntry = {
    car_code: string;
    car_count: number;
    base_price?: number;
};

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { quoteId, rooms, cars } = body as { quoteId: string; rooms?: RoomEntry[]; cars?: CarEntry[] };
        if (!quoteId) return NextResponse.json({ error: 'quoteId is required' }, { status: 400 });

        const statements: string[] = [];
        statements.push('-- Generated SQL for manager cruise save');
        statements.push(`-- quoteId: ${quoteId}`);
        statements.push('BEGIN;');

        // room inserts
        (rooms || []).forEach((r: RoomEntry, idx: number) => {
            const person = Number(r.person_count || 0);
            const extra = Number(r.extra_count || 0);
            const single = Number(r.single_count || 0);
            const bp = r.base_price != null ? Number(r.base_price) : null;
            const cols = ['room_code', 'person_count', 'extra_count', 'single_charge_count'];
            const vals = [`'${r.room_code.replace(/'/g, "''")}'`, `${person}`, `${extra}`, `${single}`];
            if (bp !== null) {
                cols.push('base_price');
                vals.push(`${bp}`);
            }
            statements.push(`-- room ${idx + 1}`);
            statements.push(`INSERT INTO room (${cols.join(', ')}) VALUES (${vals.join(', ')});`);
            // quote_item referencing last inserted room by room_code
            const totalQty = person + extra + single;
            statements.push(`INSERT INTO quote_item (quote_id, service_type, service_ref_id, quantity, unit_price, total_price)
VALUES ('${quoteId}', 'room', (SELECT id FROM room WHERE room_code='${r.room_code.replace(/'/g, "''")} ' ORDER BY id DESC LIMIT 1), ${totalQty}, ${bp !== null ? bp : 0}, ${(bp !== null ? bp : 0) * totalQty});`);
        });

        // car inserts
        (cars || []).forEach((c: CarEntry, idx: number) => {
            const cnt = Number(c.car_count || 0);
            const bp = c.base_price != null ? Number(c.base_price) : null;
            const cols = ['car_code', 'car_count'];
            const vals = [`'${c.car_code.replace(/'/g, "''")}'`, `${cnt}`];
            if (bp !== null) {
                cols.push('base_price');
                vals.push(`${bp}`);
            }
            statements.push(`-- car ${idx + 1}`);
            statements.push(`INSERT INTO car (${cols.join(', ')}) VALUES (${vals.join(', ')});`);
            statements.push(`INSERT INTO quote_item (quote_id, service_type, service_ref_id, quantity, unit_price, total_price)
VALUES ('${quoteId}', 'car', (SELECT id FROM car WHERE car_code='${c.car_code.replace(/'/g, "''")} ' ORDER BY id DESC LIMIT 1), ${cnt}, ${bp !== null ? bp : 0}, ${(bp !== null ? bp : 0) * cnt});`);
        });

        statements.push('COMMIT;');

        const sql = statements.join('\n');

        // write to sql directory
        const sqlDir = path.join(process.cwd(), 'sql');
        if (!fs.existsSync(sqlDir)) fs.mkdirSync(sqlDir, { recursive: true });
        const fileName = `manager_cruise_save_${new Date().toISOString().replace(/[:.]/g, '-')}.sql`;
        const filePath = path.join(sqlDir, fileName);
        fs.writeFileSync(filePath, sql, 'utf-8');

        return NextResponse.json({ success: true, file: `/sql/${fileName}`, path: filePath });
    } catch (error) {
        console.error('save-sql error', error);
        return NextResponse.json({ error: 'failed to generate sql' }, { status: 500 });
    }
}
