'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ThemeToggle from '@/components/ThemeToggle';

type Pass = {
  id: string;
  status: string;
  reason_category: string;
  sent_at: string;
  learner_id: string;
  teacher_id: string;
  learners: { full_name: string; admission_no: string; class_stream: string } | null;
  teacher: { full_name: string } | null;
};

export default function AnomaliesPage() {
  const router = useRouter();
  const supabase = createClient();

  const [days, setDays] = useState(30);
  const [passes, setPasses] = useState<Pass[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAnomalies() {
      setLoading(true);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('passes')
        .select(`
          id, status, reason_category, sent_at, learner_id, teacher_id,
          learners ( full_name, admission_no, class_stream ),
          teacher:teacher_id ( full_name )
        `)
        .gte('sent_at', startDate.toISOString());

      if (!error && data) {
        setPasses(data as unknown as Pass[]);
      }
      setLoading(false);
    }
    fetchAnomalies();
  }, [days]);

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  // --- DATA PROCESSING ---
  
  // 1. Frequent Flyers (Students with > 2 visits)
  const learnerCounts: Record<string, { learner: Pass['learners'], count: number }> = {};
  passes.forEach((p) => {
    if (!p.learner_id || !p.learners) return;
    if (!learnerCounts[p.learner_id]) {
      learnerCounts[p.learner_id] = { learner: p.learners, count: 0 };
    }
    learnerCounts[p.learner_id].count += 1;
  });
  const frequentFlyers = Object.values(learnerCounts)
    .filter((item) => item.count >= 3)
    .sort((a, b) => b.count - a.count);

  // 2. Ghost Passes (Expired passes)
  const ghostPasses = passes
    .filter((p) => p.status === 'expired')
    .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());

  // 3. Teacher Volume (Teachers who send > 10 passes in the period)
  const teacherCounts: Record<string, { teacher: Pass['teacher'], count: number }> = {};
  passes.forEach((p) => {
    if (!p.teacher_id || !p.teacher) return;
    if (!teacherCounts[p.teacher_id]) {
      teacherCounts[p.teacher_id] = { teacher: p.teacher, count: 0 };
    }
    teacherCounts[p.teacher_id].count += 1;
  });
  const highVolumeTeachers = Object.values(teacherCounts)
    .filter((item) => item.count >= 10)
    .sort((a, b) => b.count - a.count);

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleString([], { 
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
    });
  };

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-6 transition-colors">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center bg-white dark:bg-gray-800 p-4 rounded shadow transition-colors gap-4">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Anomaly & Abuse Report</h1>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Tracking system loopholes and frequent users</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <Link href="/admin" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              Back to Daily Report
            </Link>
            <ThemeToggle />
            <button onClick={handleLogout} className="text-sm text-red-600 dark:text-red-400 hover:underline">
              Log out
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded shadow transition-colors flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Time Period:</label>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-900 dark:text-white dark:bg-gray-700"
          >
            <option value={7}>Last 7 Days</option>
            <option value={14}>Last 14 Days</option>
            <option value={30}>Last 30 Days</option>
            <option value={90}>This Term (90 Days)</option>
          </select>
        </div>

        {loading ? (
          <p className="text-center text-gray-500 py-10">Analyzing data...</p>
        ) : (
          <div className="grid lg:grid-cols-2 gap-6">
            
            {/* Frequent Flyers */}
            <div className="bg-white dark:bg-gray-800 rounded shadow transition-colors border-t-4 border-orange-400">
              <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  🚨 Frequent Flyers (Students)
                </h2>
                <p className="text-xs text-gray-500 mt-1">Students with 3 or more visits in this period.</p>
              </div>
              <div className="p-4 max-h-[500px] overflow-y-auto">
                {frequentFlyers.length === 0 ? (
                  <p className="text-green-600 dark:text-green-400 text-sm font-medium">✅ No frequent flyers detected.</p>
                ) : (
                  <ul className="space-y-3">
                    {frequentFlyers.map((item, idx) => (
                      <li key={idx} className="flex justify-between items-center bg-orange-50 dark:bg-orange-900/10 p-3 rounded border border-orange-100 dark:border-gray-700">
                        <div>
                          <p className="font-bold text-gray-900 dark:text-white">{item.learner?.full_name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{item.learner?.admission_no} • {item.learner?.class_stream}</p>
                        </div>
                        <span className="bg-orange-200 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200 py-1 px-3 rounded-full text-sm font-bold shadow-sm">
                          {item.count} visits
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Ghost Passes */}
            <div className="bg-white dark:bg-gray-800 rounded shadow transition-colors border-t-4 border-red-500">
              <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  👻 Ghost Passes (Expired)
                </h2>
                <p className="text-xs text-gray-500 mt-1">Sent by teachers but NEVER arrived at the san.</p>
              </div>
              <div className="p-4 max-h-[500px] overflow-y-auto">
                {ghostPasses.length === 0 ? (
                  <p className="text-green-600 dark:text-green-400 text-sm font-medium">✅ No expired passes. No students skipped class!</p>
                ) : (
                  <ul className="space-y-3">
                    {ghostPasses.map((p) => (
                      <li key={p.id} className="bg-red-50 dark:bg-red-900/10 p-3 rounded border border-red-100 dark:border-gray-700">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-bold text-gray-900 dark:text-white">{p.learners?.full_name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{p.learners?.admission_no} • {p.learners?.class_stream}</p>
                          </div>
                          <span className="text-xs font-semibold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2 py-1 rounded">
                            Expired
                          </span>
                        </div>
                        <div className="mt-2 text-xs text-gray-600 dark:text-gray-300">
                          Sent by <span className="font-medium">{p.teacher?.full_name}</span> on {formatDate(p.sent_at)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* High Volume Teachers */}
            <div className="bg-white dark:bg-gray-800 rounded shadow transition-colors border-t-4 border-purple-500 lg:col-span-2">
              <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  📈 High-Volume Teachers
                </h2>
                <p className="text-xs text-gray-500 mt-1">Teachers who have sent 10 or more students in this period.</p>
              </div>
              <div className="p-4">
                {highVolumeTeachers.length === 0 ? (
                  <p className="text-green-600 dark:text-green-400 text-sm font-medium">✅ All teachers are sending normal amounts of students.</p>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {highVolumeTeachers.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-purple-50 dark:bg-purple-900/10 p-3 rounded border border-purple-100 dark:border-gray-700">
                        <span className="font-bold text-gray-900 dark:text-white">{item.teacher?.full_name}</span>
                        <span className="bg-purple-200 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200 py-1 px-3 rounded-full text-sm font-bold">
                          {item.count} passes
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>
        )}
      </div>
    </main>
  );
}
