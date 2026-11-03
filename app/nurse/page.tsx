'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Pass = {
  id: string;
  reason_category: string;
  reason_note: string | null;
  status: string;
  sent_at: string;
  acknowledged_at: string | null;
  closed_at: string | null; // Added this
  learners: { full_name: string; admission_no: string; class_stream: string } | null;
  staff: { full_name: string } | null;
};

export default function NurseDashboard() {
  const router = useRouter();
  const supabase = createClient();

  const [incoming, setIncoming] = useState<Pass[]>([]);
  const [inSan, setInSan] = useState<Pass[]>([]);
  const [completed, setCompleted] = useState<Pass[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchPasses() {
    const start = new Date();
    start.setHours(0, 0, 0, 0); // Midnight today

    const { data, error } = await supabase
      .from('passes')
      .select(`
        id, reason_category, reason_note, status, sent_at, acknowledged_at, closed_at,
        learners ( full_name, admission_no, class_stream ),
        staff:teacher_id ( full_name )
      `)
      .gte('sent_at', start.toISOString())
      .order('sent_at', { ascending: false });

    if (!error && data) {
      const pending = data.filter((p) => p.status === 'pending') as unknown as Pass[];
      const acked = data.filter((p) => p.status === 'acknowledged') as unknown as Pass[];
      const done = data.filter((p) => ['returned', 'sent_home'].includes(p.status)) as unknown as Pass[];
      
      setIncoming(pending);
      setInSan(acked);
      setCompleted(done);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchPasses();

    const channel = supabase
      .channel('nurse-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'passes' },
        () => {
          fetchPasses();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function handleAcknowledge(passId: string) {
    const { error } = await supabase.rpc('acknowledge_pass', { p_pass_id: passId });
    if (error) alert(error.message);
  }

  async function handleClose(passId: string, outcome: 'returned' | 'sent_home') {
    const note = prompt(`Any notes for sending the learner ${outcome === 'returned' ? 'back to class' : 'home'}? (Optional)`);
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
    router.push('/login');
    router.refresh();
  }

  const formatTime = (iso: string | null) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) return <div className="p-6 text-center text-gray-500">Loading dashboard...</div>;

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        
        <div className="flex justify-between items-center bg-white p-4 rounded shadow">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Sanatorium Dashboard</h1>
            <p className="text-sm text-gray-500">Kenya High School</p>
          </div>
          <button onClick={handleLogout} className="text-sm text-red-600 hover:underline">
            Log out
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          
          {/* Incoming */}
          <div className="bg-white p-6 rounded shadow border-t-4 border-yellow-400">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex justify-between">
              <span>Incoming</span>
              <span className="bg-yellow-100 text-yellow-800 py-1 px-2 rounded-full text-sm">{incoming.length}</span>
            </h2>
            
            {incoming.length === 0 ? (
              <p className="text-gray-500 text-sm">No learners on the way.</p>
            ) : (
              <ul className="space-y-4">
                {incoming.map((p) => (
                  <li key={p.id} className="border border-gray-200 p-4 rounded bg-yellow-50">
                    <p className="font-bold text-gray-900 text-lg">{p.learners?.full_name}</p>
                    <p className="text-gray-600 text-sm">{p.learners?.admission_no} • {p.learners?.class_stream}</p>
                    
                    <div className="mt-2 text-sm bg-white p-2 rounded border border-gray-100">
                      <p><span className="font-medium text-gray-700">Reason:</span> {p.reason_category}</p>
                      {p.reason_note && <p className="text-gray-600 mt-1 italic">"{p.reason_note}"</p>}
                      <p className="text-xs text-gray-500 mt-2">
                        Sent by {p.staff?.full_name} at {formatTime(p.sent_at)}
                      </p>
                    </div>

                    <button
                      onClick={() => handleAcknowledge(p.id)}
                      className="mt-3 w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
                    >
                      Acknowledge Arrival
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* In San */}
          <div className="bg-white p-6 rounded shadow border-t-4 border-blue-400">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex justify-between">
              <span>Currently in San</span>
              <span className="bg-blue-100 text-blue-800 py-1 px-2 rounded-full text-sm">{inSan.length}</span>
            </h2>
            
            {inSan.length === 0 ? (
              <p className="text-gray-500 text-sm">San is empty.</p>
            ) : (
              <ul className="space-y-4">
                {inSan.map((p) => (
                  <li key={p.id} className="border border-gray-200 p-4 rounded bg-blue-50">
                    <p className="font-bold text-gray-900 text-lg">{p.learners?.full_name}</p>
                    <p className="text-gray-600 text-sm">{p.learners?.admission_no} • {p.learners?.class_stream}</p>
                    
                    <p className="text-xs text-gray-500 mt-2">
                      Arrived at {p.acknowledged_at ? formatTime(p.acknowledged_at) : '...'}
                    </p>

                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => handleClose(p.id, 'returned')}
                        className="flex-1 bg-green-600 text-white py-2 rounded hover:bg-green-700"
                      >
                        Return to Class
                      </button>
                      <button
                        onClick={() => handleClose(p.id, 'sent_home')}
                        className="flex-1 bg-gray-600 text-white py-2 rounded hover:bg-gray-700"
                      >
                        Sent Home
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

        </div>

        {/* Completed Today Section */}
        <div className="bg-white p-6 rounded shadow mt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex justify-between">
            <span>Completed Today</span>
            <span className="bg-gray-100 text-gray-600 py-1 px-2 rounded-full text-sm">{completed.length}</span>
          </h2>
          {completed.length === 0 ? (
            <p className="text-gray-500 text-sm">No completed passes yet today.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {completed.map((p) => (
                <li key={p.id} className="py-3 flex justify-between items-center text-sm">
                  <div>
                    <span className="font-medium text-gray-900">{p.learners?.full_name}</span>
                    <span className="text-gray-500 ml-2">({p.learners?.admission_no})</span>
                    <span className="text-gray-400 mx-2">•</span>
                    <span className="text-gray-600 capitalize">{p.reason_category}</span>
                  </div>
                  <div className="text-gray-500">
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
