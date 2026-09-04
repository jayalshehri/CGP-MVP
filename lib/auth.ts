import { supabase } from './supabase';

export type UserRole = 'admin' | 'cybersecurity_team' | 'control_owner';

export type AuthProfile = {
  role: UserRole;
  is_active: boolean;
  display_name: string | null;
};

const validRoles: UserRole[] = ['admin', 'cybersecurity_team', 'control_owner'];

export function hasRole(role: UserRole, allowedRoles?: readonly UserRole[]) {
  return !allowedRoles?.length || allowedRoles.includes(role);
}

export async function requireProfile(allowedRoles?: readonly UserRole[]) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('يرجى تسجيل الدخول.');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role,is_active,display_name')
    .eq('user_id', user.id)
    .single();

  if (
    profileError ||
    !profile?.is_active ||
    !validRoles.includes(profile.role as UserRole)
  ) {
    throw new Error('الحساب غير نشط أو لا يملك صلاحية الدخول.');
  }

  const typedProfile: AuthProfile = {
    role: profile.role as UserRole,
    is_active: Boolean(profile.is_active),
    display_name: profile.display_name ?? null,
  };

  if (!hasRole(typedProfile.role, allowedRoles)) {
    throw new Error('لا تملك الصلاحية للوصول إلى هذه الصفحة.');
  }

  return { user, profile: typedProfile };
}
