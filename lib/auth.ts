import { supabase } from './supabase';
export type UserRole = 'admin' | 'cybersecurity_team' | 'control_owner';
export async function requireProfile() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('يرجى تسجيل الدخول.');
  const { data: profile, error: profileError } = await supabase.from('profiles')
    .select('role,is_active,display_name').eq('user_id', user.id).single();
  if (profileError || !profile?.is_active || !['admin','cybersecurity_team','control_owner'].includes(profile.role)) {
    throw new Error('الحساب غير نشط أو لا يملك صلاحية الدخول.');
  }
  return { user, profile: { ...profile, role: profile.role as UserRole } };
}
