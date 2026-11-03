'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ThemeToggle from '@/components/ThemeToggle';

type AuditLog = {
  id: number;
  event_type: string;
  event_at: string;
  actor: { full_name: string; role: string } | null;
  pass: {
    learners: { full_name: string; admission_no: string } | null;
  } | null;
};

export default function AuditLogPage() {
  const router = useRouter();
  const supabase = createClient();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLogs() {
      const { data, error } = await supabase
        .from('pass_events')
        .select(`
          id, event_type, event_at,
          actor:actor_id ( full_name, role ),
          pass:pass_id ( learners ( full_name, admission_no ) )
        `)
        .order('event_at', { ascending: false })
        .limit(50);

      if (!error && data) {
        setLogs(data as unknown as AuditLog[]);
      }
      setLoading(false);
    }
    fetchLogs();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleString([], { 
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
    });
  };

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 transition-colors">
      <div className="max-w-4xl mx-auto space-y-6">
        
        <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-4 rounded shadow transition-colors">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Audit Log</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">System Activity Timeline</p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/admin" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              Back to Reports
            </Link>
            <ThemeToggle />
            <button onClick={handleLogout} className="text-sm text-red-600 dark:text-red-400 hover:underline">
              Log out
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded shadow overflow-hidden transition-colors">
          {loading ? (
            <p className="p-6 text-gray-500 dark:text-gray-400">Loading logs...</p>
          ) : logs.length === 0 ? (
            <p className="p-6 text-gray-500 dark:text-gray-400">No activity recorded yet.</p>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {logs.map((log) => (
                <li key={log.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 transition-colors">
                  <div>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {log.actor?.full_name || 'System'}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400 text-sm ml-1">
                      ({log.actor?.role})
                    </span>
                    <span className="mx-2 text-gray-400 dark:text-gray-500">•</span>
                    <span className="text-gray-800 dark:text-gray-200 font-medium capitalize">
                      {log.event_type.replace('_', ' ')}
                    </span>
                    <span className="text-gray-600 dark:text-gray-300 ml-2">
                      pass for {log.pass?.learners?.full_name} ({log.pass?.learners?.admission_no})
                    </span>
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {formatTime(log.event_at)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
