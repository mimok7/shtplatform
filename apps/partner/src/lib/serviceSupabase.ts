import { createClient } from '@supabase/supabase-js';

const serviceSupabase = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

export default serviceSupabase;
