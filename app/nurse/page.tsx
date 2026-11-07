'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ThemeToggle from '@/components/ThemeToggle';

type Pass = {
  id: string;
  learner_id: string;
  reason_category: string;
  reason_note: string | null;
  status: string;
  sent_at: string;
  acknowledged_at: string | null;
  closed_at: string | null;
  learners: { full_name: string; admission_no: string; class_stream: string } | null;
  staff: { full_name: string } | null;
};

export default function NurseDashboard() {
  const router = useRouter();
  const supabase = createClient();

  const [incoming, setIncoming] = useState<Pass[]>([]);
  const [inSan, setInSan] = useState<Pass[]>([]);
  const [history, setHistory] = useState<Pass[]>([]);
  const [visitCounts, setVisitCounts] = useState<Record<string, number>>({});
  
  const [historyDate, setHistoryDate] = useState('');
  const [loading, setLoading] = useState(true);

  async function fetchData() {
    if (!historyDate) return;
    setLoading(true);
    
    // 1. Fetch active passes
    const { data: activeData } = await supabase
      .from('passes')
      .select(`
        id, learner_id, reason_category, reason_note, status, sent_at, acknowledged_at, closed_at,
        learners ( full_name, admission_no, class_stream ),
        staff:teacher_id ( full_name )
      `)
      .in('status', ['pending', 'acknowledged', 'observation'])
      .order('sent_at', { ascending: true });

    if (activeData) {
      const pending = activeData.filter((p) => p.status === 'pending') as unknown as Pass[];
      const acked = activeData.filter((p) => ['acknowledged', 'observation'].includes(p.status)) as unknown as Pass[];
      setIncoming(pending);
      setInSan(acked);
    }

    // 2. Fetch history for the selected date
    const start = new Date(historyDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(historyDate);
    end.setHours(23, 59, 59, 999);

    const { data: historyData } = await supabase
      .from('passes')
      .select(`
        id, learner_id, reason_category, reason_note, status, sent_at, acknowledged_at, closed_at,
        learners ( full_name, admission_no, class_stream ),
        staff:teacher_id ( full_name )
      `)
      .in('status', ['returned', 'sent_home'])
      .gte('sent_at', start.toISOString())
      .lte('sent_at', end.toISOString())
      .order('closed_at', { ascending: false });

    if (historyData) {
      setHistory(historyData as unknown as Pass[]);
    }

    // 3. Fetch 30-day visit counts
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: countData } = await supabase
      .from('passes')
      .select('learner_id')
      .gte('sent_at', thirtyDaysAgo.toISOString());

    if (countData) {
      const counts = countData.reduce((acc: Record<string, number>, curr) => {
        acc[curr.learner_id] = (acc[curr.learner_id] || 0) + 1;
        return acc;
      }, {});
      setVisitCounts(counts);
    }

    setLoading(false);
  }

  useEffect(() => {
    if (!historyDate) {
      setHistoryDate(new Date().toISOString().split('T')[0]);
    }
  }, [historyDate]);

  useEffect(() => {
    if (!historyDate) return;
    fetchData();

    const channel = supabase
      .channel('nurse-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'passes' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [historyDate]);

  async function handleAcknowledge(passId: string) {
    const { error } = await supabase.rpc('acknowledge_pass', { p_pass_id: passId });
    if (error) alert(error.message);
  }

  async function handleClose(passId: string, outcome: 'returned' | 'sent_home' | 'observation') {
    const promptMessage = outcome === 'observation' 
      ? 'Any notes for keeping the learner for observation?' 
      : `Any notes for sending the learner ${outcome === 'returned' ? 'back to class' : 'home'}? (Optional)`;
      
    const note = prompt(promptMessage);
    if (note === null) return;

    const { error } = await supabase.rpc('close_pass', { 
      p_pass_id: passId, 
      p_outcome: outcome,
      p_note: note || null 
    });
    if (error) alert(error.message);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  const formatTime = (iso: string | null) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-6 transition-colors">
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-4 rounded shadow transition-colors">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Sanatorium</h1>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Kenya High School</p>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <ThemeToggle />
            <button onClick={handleLogout} className="text-sm text-red-600 dark:text-red-400 hover:underline">
              Log out
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          
          {/* Incoming */}
          <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded shadow border-t-4 border-yellow-400 transition-colors">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex justify-between">
              <span>Incoming</span>
              <span className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200 py-1 px-2 rounded-full text-sm">{incoming.length}</span>
            </h2>
            
            {incoming.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm">No learners on the way.</p>
            ) : (
              <ul className="space-y-4">
                {incoming.map((p) => (
                  <li key={p.id} className="border border-gray-200 dark:border-gray-700 p-3 sm:p-4 rounded bg-yellow-50 dark:bg-yellow-900/20">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-2">
                      <div>
                        <p className="font-bold text-gray-900 dark:text-white text-lg leading-tight">{p.learners?.full_name}</p>
                        <p className="text-gray-600 dark:text-gray-300 text-sm">{p.learners?.admission_no} • {p.learners?.class_stream}</p>
                      </div>
                      <div className="sm:text-right">
                        <span className="inline-block bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-600 font-medium">
                          {visitCounts[p.learner_id] || 0} visits (30d)
                        </span>
                      </div>
                    </div>
                    
                    <div className="mt-2 text-sm bg-white dark:bg-gray-800 p-2 sm:p-3 rounded border border-gray-100 dark:border-gray-700">
                      <p className="text-gray-900 dark:text-gray-200"><span className="font-medium text-gray-700 dark:text-gray-400">Reason:</span> <span className="capitalize">{p.reason_category}</span></p>
                      {p.reason_note && <p className="text-gray-600 dark:text-gray-400 mt-1 italic">"{p.reason_note}"</p>}
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        Sent by {p.staff?.full_name} at {formatTime(p.sent_at)}
                      </p>
                    </div>

                    <button
                      onClick={() => handleAcknowledge(p.id)}
                      className="mt-3 w-full bg-blue-600 text-white py-2.5 rounded hover:bg-blue-700 transition-colors"
                    >
                      Acknowledge Arrival
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* In San */}
          <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded shadow border-t-4 border-blue-400 transition-colors">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex justify-between">
              <span>In San</span>
              <span className="bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 py-1 px-2 rounded-full text-sm">{inSan.length}</span>
            </h2>
            
            {inSan.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-sm">San is empty.</p>
            ) : (
              <ul className="space-y-4">
                {inSan.map((p) => (
                  <li key={p.id} className="border border-gray-200 dark:border-gray-700 p-3 sm:p-4 rounded bg-blue-50 dark:bg-blue-900/20">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-2">
                      <div>
                        <p className="font-bold text-gray-900 dark:text-white text-lg leading-tight">{p.learners?.full_name}</p>
                        <p className="text-gray-600 dark:text-gray-300 text-sm">{p.learners?.admission_no} • {p.learners?.class_stream}</p>
                      </div>
                      <div className="sm:text-right">
                        <span className="inline-block bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-600 font-medium">
                          {visitCounts[p.learner_id] || 0} visits (30d)
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 text-sm bg-white dark:bg-gray-800 p-2 sm:p-3 rounded border border-gray-100 dark:border-gray-700">
                      <p className="text-gray-900 dark:text-gray-200">
                        <span className="font-medium text-gray-700 dark:text-gray-400">Reason:</span> <span className="capitalize">{p.reason_category}</span>
                        {p.status === 'observation' && <span className="ml-2 inline-block bg-orange-100 text-orange-800 text-xs px-2 py-0.5 rounded">Resting</span>}
                      </p>
                    </div>
                    
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      Arrived at {p.acknowledged_at ? formatTime(p.acknowledged_at) : '...'}
                    </p>

                    <div className="mt-3 flex flex-col gap-2">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <button
                          onClick={() => handleClose(p.id, 'returned')}
                          className="flex-1 bg-green-600 text-white py-2 rounded hover:bg-green-700 transition-colors"
                        >
                          Return to Class
                        </button>
                        
                        {p.status === 'acknowledged' && (
                          <button
                            onClick={() => handleClose(p.id, 'observation')}
                            className="flex-1 bg-yellow-600 text-white py-2 rounded hover:bg-yellow-700 transition-colors"
                          >
                            Rest (Observe)
                          </button>
                        )}
                      </div>
                      
                      <button
                        onClick={() => handleClose(p.id, 'sent_home')}
                        className="w-full bg-red-600 text-white py-2 rounded hover:bg-red-700 transition-colors text-sm"
                      >
                        Recommend Send Home
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

        </div>

        {/* History Section - Mobile Optimized */}
        <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded shadow mt-6 transition-colors">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">History</h2>
            <input
              type="date"
              value={historyDate}
              onChange={(e) => setHistoryDate(e.target.value)}
              className="w-full sm:w-auto rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-900 dark:text-white dark:bg-gray-700"
            />
          </div>
          
          {history.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">No completed passes for this date.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {history.map((p) => (
                <li key={p.id} className="py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center text-sm gap-1 sm:gap-2">
                  <div className="flex flex-wrap items-center">
                    <span className="font-medium text-gray-900 dark:text-white mr-2">{p.learners?.full_name}</span>
                    <span className="text-gray-500 dark:text-gray-400 mr-2">({p.learners?.admission_no})</span>
                    <span className="text-gray-400 dark:text-gray-500 mr-2">•</span>
                    <span className="text-gray-600 dark:text-gray-300 capitalize">{p.reason_category}</span>
                  </div>
                  <div className={`font-medium ${p.status === 'sent_home' ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                    {p.status === 'returned' ? 'Returned to Class' : 'Sent Home'} at {formatTime(p.closed_at)}
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
