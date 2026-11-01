export const dynamic = 'force-dynamic';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: staff } = await supabase
    .from('staff')
    .select('role')
    .eq('auth_user_id', user.id)
    .single();

  if (staff?.role === 'nurse') redirect('/nurse');
  if (staff?.role === 'admin') redirect('/admin');
  redirect('/teacher');
}
