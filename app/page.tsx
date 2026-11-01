import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export default async function Home() {
  // This tells Next.js 16 to wait for a request instead of prerendering
  await connection();

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
