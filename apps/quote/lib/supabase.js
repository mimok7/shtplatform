// lib/supabase.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️ Supabase 환경변수가 설정되지 않았습니다. .env.local 파일을 확인해주세요.');
}

const supabase = createClient(supabaseUrl || '', supabaseKey || '');
export default supabase;
