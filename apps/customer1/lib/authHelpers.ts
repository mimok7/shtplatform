import supabase from './supabase';

/**
 * Get user from local session without a network request.
 */
export async function getSessionUser(): Promise<{ user: any; error: any }> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) return { user: null, error };
    if (session?.user) return { user: session.user, error: null };
    return { user: null, error: new Error('No active session') };
  } catch (err) {
    return { user: null, error: err };
  }
}

/**
 * Verify auth session is still valid before a critical operation (form submit).
 * Returns the current user or null + error.
 */
export async function refreshAuthBeforeSubmit(): Promise<{ user: any; error?: any }> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) {
      return { user: null, error: error || new Error('No active session') };
    }
    return { user: session.user, error: null };
  } catch (err) {
    return { user: null, error: err };
  }
}
