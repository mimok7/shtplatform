// Minimal supabase stub for local diagnostics. Real project should use the actual Supabase client.
const supabase: any = {
  auth: {
    async getUser() {
      return { data: { user: null }, error: null };
    }
  },
  from: (table: string) => ({
    select: (cols?: string) => ({
      eq: (col: string, val: any) => ({ single: async () => ({ data: null, error: null }) }),
      single: async () => ({ data: null, error: null }),
      limit: (_n: number) => ({ maybe: null })
    }),
    insert: async (payload: any) => ({ data: null, error: null }),
    update: async (payload: any) => ({ data: null, error: null }),
    eq: (_col: string, _val: any) => ({ select: async () => ({ data: null, error: null }) })
  })
};

export default supabase;
