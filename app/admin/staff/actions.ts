'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

async function verifyAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data: staff } = await supabase.from('staff').select('role').eq('auth_user_id', user.id).single();
  if (staff?.role !== 'admin') throw new Error('Only admins can manage staff');
  return true;
}

const adminClient = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function generatePassword() { return Math.random().toString(36).slice(-8); }

export async function addStaffMember(formData: FormData) {
  try {
    await verifyAdmin();
    const fullName = formData.get('fullName') as string;
    const email = formData.get('email') as string;
    const role = formData.get('role') as string;
    const tempPassword = generatePassword();

    const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
      email, password: tempPassword, email_confirm: true,
    });
    if (authError) return { error: authError.message };

    const { error: dbError } = await adminClient.from('staff').insert({
      full_name: fullName, email, role, auth_user_id: authUser.user.id, require_password_change: true, // FORCE CHANGE
    });

    if (dbError) {
      await adminClient.auth.admin.deleteUser(authUser.user.id);
      return { error: dbError.message };
    }
    return { success: true, tempPassword };
  } catch (err: any) { return { error: err.message }; }
}

export async function toggleStaffStatus(staffId: string, currentStatus: boolean) {
  try {
    await verifyAdmin();
    const { error } = await adminClient.from('staff').update({ is_active: !currentStatus }).eq('id', staffId);
    if (error) return { error: error.message };
    return { success: true };
  } catch (err: any) { return { error: err.message }; }
}

export async function resetStaffPassword(staffId: string, authUserId: string) {
  try {
    await verifyAdmin();
    const newPassword = generatePassword();
    const { error } = await adminClient.auth.admin.updateUserById(authUserId, { password: newPassword });
    if (error) return { error: error.message };
    
    // Also force them to change it when they log in
    await adminClient.from('staff').update({ require_password_change: true }).eq('id', staffId);
    
    return { success: true, tempPassword: newPassword };
  } catch (err: any) { return { error: err.message }; }
}

// NEW: Update Role
export async function updateStaffRole(staffId: string, newRole: string) {
  try {
    await verifyAdmin();
    const { error } = await adminClient.from('staff').update({ role: newRole }).eq('id', staffId);
    if (error) return { error: error.message };
    return { success: true };
  } catch (err: any) { return { error: err.message }; }
}
