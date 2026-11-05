'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ThemeToggle from '@/components/ThemeToggle';

type ReportRow = {
  id: string;
  status: string;
  admin_released: boolean;
  reason_category: string;
  sent_at: string;
  acknowledged_at: string | null;
  closed_at: string | null;
  learners: { full_name: string; admission_no: string; class_stream: string } | null;
  teacher: { full_name: string } | null;
  nurse: { full_name: string } | null;
};

export default function AdminDashboard() {
  const router = useRouter();
  const supabase = createClient();

  const [date, setDate] = useState('');
  const [data, setData] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  async function fetchReport() {
    if (!date) return;
    setLoading(true);
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const { data: passes, error } = await supabase
      .from('passes')
      .select(`
        id, status, admin_released, reason_category, sent_at, acknowledged_at, closed_at,
        learners ( full_name, admission_no, class_stream ),
        teacher:teacher_id ( full_name ),
        nurse:nurse_id ( full_name )
      `)
      .gte('sent_at', start.toISOString())
      .lte('sent_at', end.toISOString())
      .order('sent_at', { ascending: false });

    if (!error && passes) {
      setData(passes as unknown as ReportRow[]);
    }
    setLoading(false);
  }

  // 1. Set today's date on first load
  useEffect(() => {
    if (!date) {
      setDate(new Date().toISOString().split('T')[0]);
    }
  }, [date]);

  // 2. Fetch data AND listen for realtime changes
  useEffect(() => {
    if (!date) return;

    fetchReport();

    const channel = supabase
      .channel('admin-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'passes' }, () => {
        fetchReport();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [date]);

  async function handleRelease(passId: string) {
    if (!confirm('Confirm this learner has been released to go home?')) return;
    
    const { error } = await supabase.rpc('release_learner', { p_pass_id: passId });
    if (error) {
      alert(error.message);
    } else {
      fetchReport(); // Refresh the table
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  const formatTime = (iso: string | null) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const filteredData = data.filter((p) => {
    const term = search.toLowerCase();
    const nameMatch = (p.learners?.full_name || '').toLowerCase().includes(term);
    const admMatch = (p.learners?.admission_no || '').toLowerCase().includes(term);
    return nameMatch || admMatch;
  });

  const downloadCSV = () => {
    const headers = ['Admission No', 'Learner', 'Class', 'Reason', 'Status', 'Sent At', 'Acknowledged At', 'Closed At', 'Teacher', 'Nurse'];
    const rows = filteredData.map((p) => [
      p.learners?.admission_no || '',
      p.learners?.full_name || '',
      p.learners?.class_stream || '',
      p.reason_category,
      p.status === 'sent_home' && !p.admin_released ? 'ACTION: Send Home' : p.status,
      formatTime(p.sent_at),
      formatTime(p.acknowledged_at),
      formatTime(p.closed_at),
      p.teacher?.full_name || '',
      p.nurse?.full_name || '',
    ]);
    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `san_report_${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('Kenya High School', 14, 22);
    doc.setFontSize(12);
    doc.text(`Sanatorium Daily Report - ${date}`, 14, 30);
    if (search) {
      doc.setFontSize(10);
      doc.text(`Filtered by: "${search}"`, 14, 36);
    }
    
    const tableColumn = ["Learner", "Class", "Reason", "Status", "Sent", "Ack", "Closed", "Teacher", "Nurse"];
    const tableRows = filteredData.map(p => [
      `${p.learners?.full_name}\n(${p.learners?.admission_no})`,
      p.learners?.class_stream || '',
      p.reason_category,
      p.status === 'sent_home' && !p.admin_released ? 'ACTION: Send Home' : p.status,
      formatTime(p.sent_at),
      formatTime(p.acknowledged_at),
      formatTime(p.closed_at),
      p.teacher?.full_name || '',
      p.nurse?.full_name || '-'
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: search ? 42 : 35,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [41, 128, 185] },
    });

    doc.save(`san_report_${date}.pdf`);
  };

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 transition-colors">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-4 rounded shadow transition-colors">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Admin Report</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Kenya High School — Sanatorium Log</p>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/admin/staff" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              Manage Staff
            </Link>
            <Link href="/admin/audit" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              View Audit Log
            </Link>
            <ThemeToggle />
            <button onClick={handleLogout} className="text-sm text-red-600 dark:text-red-400 hover:underline">
              Log out
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded shadow transition-colors">
          
          {/* Controls */}
          <div className="flex flex-wrap justify-between items-end gap-4 mb-6">
            <div className="flex gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Select Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white dark:bg-gray-700"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Search Learner</label>
                <input
                  type="text"
                  placeholder="Name or Adm No..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white dark:bg-gray-700 min-w-[200px]"
                />
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={downloadCSV}
                disabled={filteredData.length === 0}
                className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                Download CSV
              </button>
              <button
                onClick={downloadPDF}
                disabled={filteredData.length === 0}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                Download PDF
              </button>
            </div>
          </div>

          {/* Action Center for Pending Releases */}
          {filteredData.filter(p => p.status === 'sent_home' && !p.admin_released).length > 0 && (
            <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <h3 className="text-red-800 dark:text-red-400 font-bold mb-3 flex items-center gap-2">
                ⚠️ Action Required: Learners Awaiting Release
              </h3>
              <ul className="space-y-2">
                {filteredData.filter(p => p.status === 'sent_home' && !p.admin_released).map(p => (
                  <li key={p.id} className="flex justify-between items-center bg-white dark:bg-gray-800 p-3 rounded shadow-sm border border-red-100 dark:border-gray-700">
                    <div>
                      <span className="font-bold text-gray-900 dark:text-white">{p.learners?.full_name}</span>
                      <span className="text-gray-500 dark:text-gray-400 ml-2">({p.learners?.admission_no})</span>
                      <span className="text-gray-400 mx-2">•</span>
                      <span className="text-gray-600 dark:text-gray-300 text-sm">Recommended by Nurse at {formatTime(p.closed_at)}</span>
                    </div>
                    <button
                      onClick={() => handleRelease(p.id)}
                      className="bg-red-600 text-white px-4 py-1.5 rounded hover:bg-red-700 text-sm font-medium transition-colors"
                    >
                      Release Learner
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Table */}
          {loading ? (
            <p className="text-gray-500 dark:text-gray-400">Loading report...</p>
          ) : filteredData.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No passes found matching your criteria.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300">
                    <th className="p-3 border-b dark:border-gray-700">Learner</th>
                    <th className="p-3 border-b dark:border-gray-700">Class</th>
                    <th className="p-3 border-b dark:border-gray-700">Reason</th>
                    <th className="p-3 border-b dark:border-gray-700">Status</th>
                    <th className="p-3 border-b dark:border-gray-700">Sent</th>
                    <th className="p-3 border-b dark:border-gray-700">Ack</th>
                    <th className="p-3 border-b dark:border-gray-700">Closed</th>
                    <th className="p-3 border-b dark:border-gray-700">Teacher</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((p) => (
                    <tr key={p.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      
                      {/* Learner */}
                      <td className="p-3">
                        <span className="font-medium text-gray-900 dark:text-white">{p.learners?.full_name}</span>
                        <br/>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{p.learners?.admission_no}</span>
                      </td>
                      
                      {/* Class */}
                      <td className="p-3 text-gray-600 dark:text-gray-300">{p.learners?.class_stream}</td>
                      
                      {/* Reason */}
                      <td className="p-3 text-gray-600 dark:text-gray-300 capitalize">{p.reason_category}</td>
                      
                      {/* Status Badge */}
                      <td className="p-3">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                          p.status === 'pending' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200' :
                          p.status === 'acknowledged' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200' :
                          p.status === 'observation' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200' :
                          p.status === 'returned' ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200' :
                          p.status === 'sent_home' && !p.admin_released ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200 animate-pulse' :
                          p.status === 'sent_home' && p.admin_released ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200' :
                          'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                        }`}>
                          {p.status === 'sent_home' && !p.admin_released ? 'ACTION: Send Home' : 
                           p.status === 'sent_home' && p.admin_released ? 'Released' : 
                           p.status}
                        </span>
                      </td>
                      
                      {/* Sent */}
                      <td className="p-3 text-gray-600 dark:text-gray-300">{formatTime(p.sent_at)}</td>
                      
                      {/* Ack */}
                      <td className="p-3 text-gray-600 dark:text-gray-300">{formatTime(p.acknowledged_at)}</td>
                      
                      {/* Closed */}
                      <td className="p-3 text-gray-600 dark:text-gray-300">{formatTime(p.closed_at)}</td>
                      
                      {/* Teacher */}
                      <td className="p-3 text-gray-600 dark:text-gray-300">{p.teacher?.full_name}</td>
                    
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
