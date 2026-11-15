'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ThemeToggle from '@/components/ThemeToggle';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    searchParams.get('error') === 'no_staff'
      ? 'Your account is not linked to staff records. Contact the admin.'
      : null
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    const { data: staff } = await supabase.from('staff').select('role, require_password_change').eq('auth_user_id', user?.id).single();

    // If they need to change their password, send them to the update page
    if (staff?.require_password_change) {
      router.push('/update-password');
      return;
    }

    const dest = staff?.role === 'nurse' ? '/nurse' : staff?.role === 'admin' ? '/admin' : '/teacher';
    router.push(dest);
    router.refresh();
  }

  async function handleForgotPassword() {
    if (!email) {
      setError("Please enter your email address first, then click 'Forgot Password'.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    });
    setLoading(false);
    
    if (error) setError(error.message);
    else alert("A password reset link has been sent to your email.");
  }

  return (
    <main className="relative min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-6 transition-colors duration-300">
      <div className="absolute top-4 right-4"><ThemeToggle /></div>

      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white dark:bg-gray-800 p-8 rounded-lg shadow space-y-4 transition-colors duration-300">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Sanatorium Pass</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">Kenya High School — staff login</p>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white dark:bg-gray-700" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white dark:bg-gray-700" />
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 p-2 rounded">{error}</p>}

        <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="text-center pt-2">
          <button type="button" onClick={handleForgotPassword} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            Forgot Password?
          </button>
        </div>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-gray-500 dark:text-gray-400">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
