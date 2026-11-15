'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const supabase = createClient();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    setError(null);

    // 1. Update the auth password
    const { error: authError } = await supabase.auth.updateUser({ password });
    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // 2. Clear the require_password_change flag
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { error: updateError } = await supabase.from('staff').update({ require_password_change: false }).eq('auth_user_id', user.id);
      
      if (updateError) {
        setError("Password changed, but failed to update profile. Please contact Admin.");
        setLoading(false);
        return;
      }
      
      // 3. Redirect to their correct dashboard
      const { data: staff } = await supabase.from('staff').select('role').eq('auth_user_id', user.id).single();
      if (staff?.role === 'admin') router.push('/admin');
      else if (staff?.role === 'nurse') router.push('/nurse');
      else router.push('/teacher');
      router.refresh();
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-6">
      <form onSubmit={handleUpdate} className="w-full max-w-md bg-white dark:bg-gray-800 p-8 rounded-lg shadow space-y-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Set Your Password</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">Please enter a new password for your account.</p>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">New Password</label>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white dark:bg-gray-700" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Confirm Password</label>
          <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white dark:bg-gray-700" />
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 p-2 rounded">{error}</p>}

        <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Updating...' : 'Update Password'}
        </button>
      </form>
    </main>
  );
}
