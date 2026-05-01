/*
 Small helper to apply a .sql file to your Postgres (e.g., Supabase) DB.
 Usage:
   $ setx SUPABASE_DB_URL "postgresql://user:pass@host:5432/postgres"
   $ node scripts/apply-sql.js sql/create-customer-requests-tables.sql
*/
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
    const dbUrl = process.env.SUPABASE_DB_URL;
    const fileArg = process.argv[2];
    if (!dbUrl) {
        console.error('Missing SUPABASE_DB_URL env. Set it to your Postgres connection string.');
        process.exit(1);
    }
    if (!fileArg) {
        console.error('Usage: node scripts/apply-sql.js <path-to-sql-file>');
        process.exit(1);
    }
    const sqlPath = path.resolve(process.cwd(), fileArg);
    if (!fs.existsSync(sqlPath)) {
        console.error('SQL file not found:', sqlPath);
        process.exit(1);
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');

    const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    try {
        console.log('Connecting to DB...');
        await client.connect();
        console.log('Applying SQL:', sqlPath);
        await client.query(sql);
        console.log('Done. ✅');
    } catch (err) {
        console.error('Failed. ❌');
        console.error(err.message);
        if (err.detail) console.error('detail:', err.detail);
        if (err.hint) console.error('hint:', err.hint);
        if (err.position) console.error('position:', err.position);
        process.exitCode = 1;
    } finally {
        await client.end();
    }
}

main();
