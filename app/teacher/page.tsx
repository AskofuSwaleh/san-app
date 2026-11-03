'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Pass = {
  id: string;
  learner_id: string;
  reason_category: string;
  status: string;
  sent_at: string;
  expires_at: string;
  learners: { full_name: string; admission_no: string; class_stream: string } | null;
};

function TeacherDashboard() {
  const router = useRouter();
  const supabase = createClient();

  const [admissionNo, setAdmissionNo] = useState('');
  const [reason, setReason] = useState('headache');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  
  const [openPasses, setOpenPasses] = useState<Pass[]>([]);
  const [todayPasses, setTodayPasses] = useState<Pass[]>([]);

  useEffect(() => {
    fetchPasses();

    const channel = supabase
      .channel('teacher-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'passes' }, () => {
        fetchPasses();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchPasses() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('passes')
      .select(`
        id, learner_id, reason_category, status, sent_at, expires_at,
        learners ( full_name, admission_no, class_stream )
      `)
      .gte('sent_at', start.toISOString())
      .order('sent_at', { ascending: false });

    if (!error && data) {
      setTodayPasses(data as unknown as Pass[]);
      const open = data.filter(p => ['pending', 'acknowledged'].includes(p.status));
      setOpenPasses(open as unknown as Pass[]);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    const { data: learner, error: learnerError } = await supabase
      .from('learners')
      .select('id, full_name')
      .eq('admission_no', admissionNo.trim().toUpperCase())
      .eq('is_active', true)
      .single();

    if (learnerError || !learner) {
      setError('Learner not found. Check the admission number.');
      setLoading(false);
      return;
    }

    const { error: rpcError } = await supabase.rpc('create_pass', {
      p_learner_id: learner.id,
      p_reason_category: reason,
      p_reason_note: note || null,
    });

    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }

    setSuccessMsg(`Pass created for ${learner.full_name}. Valid for 30 mins.`);
    setAdmissionNo('');
    setNote('');
    fetchPasses(); 
    setLoading(false);
  }

  async function handleCancel(passId: string) {
    if (!confirm('Cancel this pass?')) return;
    const { error } = await supabase.rpc('cancel_pass', { p_pass_id: passId });
    if (error) alert(error.message);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        
        <div className="flex justify-between items-center bg-white p-4 rounded shadow">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Teacher Dashboard</h1>
            <p className="text-sm text-gray-500">Send learners to the sanatorium</p>
          </div>
          <button onClick={handleLogout} className="text-sm text-red-600 hover:underline">
            Log out
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded shadow">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">New Pass</h2>
            <form onSubmit={handleSend} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Admission Number</label>
                <input type="text" required placeholder="e.g. KHS-0001" value={admissionNo} onChange={(e) => setAdmissionNo(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-gray-900 uppercase" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Reason</label>
                <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-gray-900">
                  <option value="headache">Headache</option>
                  <option value="stomach">Stomach ache</option>
                  <option value="injury">Injury</option>
                  <option value="fever">Fever</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Note (optional)</label>
                <input type="text" maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-gray-900" placeholder="Brief context..." />
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
              {successMsg && <p className="text-sm text-green-700 bg-green-50 p-2 rounded">{successMsg}</p>}
              <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50">
                {loading ? 'Sending...' : 'Send to San'}
              </button>
            </form>
          </div>

          <div className="bg-white p-6 rounded shadow">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Currently Open</h2>
            {openPasses.length === 0 ? (
              <p className="text-gray-500 text-sm">No learners currently at the san.</p>
            ) : (
              <ul className="space-y-3">
                {openPasses.map((p) => (
                  <li key={p.id} className="border border-gray-200 p-3 rounded text-sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-gray-900">{p.learners?.full_name}</p>
                        <p className="text-gray-500">{p.learners?.admission_no}</p>
                      </div>
                      <div className="text-right">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${p.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'}`}>
                          {p.status === 'pending' ? 'Awaiting Nurse' : 'In San'}
                        </span>
                        {p.status === 'pending' && (
                          <button onClick={() => handleCancel(p.id)} className="block mt-2 text-xs text-red-600 hover:underline">Cancel</button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* My Recent Passes Table */}
        <div className="bg-white p-6 rounded shadow mt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">My Recent Passes (Today)</h2>
          {todayPasses.length === 0 ? (
            <p className="text-gray-500 text-sm">You haven't sent any learners today.</p>
          ) : (
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600">
                  <th className="p-2 border-b">Learner</th>
                  <th className="p-2 border-b">Reason</th>
                  <th className="p-2 border-b">Status</th>
                  <th className="p-2 border-b">Sent At</th>
                </tr>
              </thead>
              <tbody>
                {todayPasses.map((p) => (
                  <tr key={p.id} className="border-b">
                    <td className="p-2 font-medium text-gray-900">
                      {p.learners?.full_name} <span className="text-gray-500 font-normal">({p.learners?.admission_no})</span>
                    </td>
                    <td className="p-2 text-gray-600 capitalize">{p.reason_category}</td>
                    <td className="p-2">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                        p.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        p.status === 'acknowledged' ? 'bg-blue-100 text-blue-800' :
                        p.status === 'returned' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="p-2 text-gray-500">
                      {new Date(p.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </main>
  );
}

export default function TeacherPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-gray-500">Loading dashboard...</div>}>
      <TeacherDashboard />
    </Suspense>
  );
}
