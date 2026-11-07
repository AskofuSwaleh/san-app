'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ThemeToggle from '@/components/ThemeToggle';
import Modal from '@/components/Modal';

type ReportRow = {
  id: string;
  status: string;
  admin_released: boolean;
  admin_rejected: boolean;
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

  // Modal State
  const [actionModal, setActionModal] = useState<{ 
    isOpen: boolean; 
    passId: string | null; 
    name: string; 
    action: 'release' | 'reject' | null 
  }>({
    isOpen: false, passId: null, name: '', action: null
  });

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
        id, status, admin_released, admin_rejected, reason_category, sent_at, acknowledged_at, closed_at,
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

  useEffect(() => {
    if (!date) {
      setDate(new Date().toISOString().split('T')[0]);
    }
  }, [date]);

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

  function handleActionClick(passId: string, name: string, action: 'release' | 'reject') {
    setActionModal({ isOpen: true, passId, name, action });
  }

  async function handleConfirmAction() {
    if (!actionModal.passId || !actionModal.action) return;
    
    const rpcName = actionModal.action === 'release' ? 'release_learner' : 'reject_send_home';
    const { error } = await supabase.rpc(rpcName, { p_pass_id: actionModal.passId });
    
    if (error) {
      alert(error.message);
    } else {
      setActionModal({ isOpen: false, passId: null, name: '', action: null });
      fetchReport(); 
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

  const getStatusBadge = (p: ReportRow, isMobile: boolean = false) => {
    const baseClass = "inline-block px-2 py-1 rounded text-xs font-medium";
    let colorClass = "";
    let text = p.status;

    if (p.status === 'pending') colorClass = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200';
    else if (p.status === 'acknowledged') colorClass = 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200';
    else if (p.status === 'observation') colorClass = 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200';
    else if (p.status === 'returned') colorClass = 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200';
    else if (p.status === 'sent_home' && !p.admin_released && !p.admin_rejected) {
      colorClass = 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200 animate-pulse';
      text = 'ACTION: Send Home';
    }
    else if (p.status === 'sent_home' && p.admin_released) {
      colorClass = 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200';
      text = 'Released';
    }
    else colorClass = 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';

    return <span className={`${baseClass} ${colorClass} ${isMobile ? 'text-sm' : ''}`}>{text}</span>;
  };

  const downloadCSV = () => {
    const headers = ['Admission No', 'Learner', 'Class', 'Reason', 'Status', 'Sent At', 'Acknowledged At', 'Closed At', 'Teacher', 'Nurse'];
    const rows = filteredData.map((p) => [
      p.learners?.admission_no || '',
      p.learners?.full_name || '',
      p.learners?.class_stream || '',
      p.reason_category,
      p.status === 'sent_home' && !p.admin_released && !p.admin_rejected ? 'ACTION: Send Home' : p.status,
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
      p.status === 'sent_home' && !p.admin_released && !p.admin_rejected ? 'ACTION: Send Home' : p.status,
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
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-6 transition-colors">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between sm:items-center bg-white dark:bg-gray-800 p-4 rounded shadow transition-colors gap-4">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Admin Report</h1>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Kenya High School — Sanatorium Log</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">


            <Link href="/admin/anomalies" className="text-sm text-purple-600 dark:text-purple-400 hover:underline font-medium">
              Anomalies
            </Link>
            <Link href="/admin/audit" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              Audit Log
            </Link>

            <ThemeToggle />
            <button onClick={handleLogout} className="text-sm text-red-600 dark:text-red-400 hover:underline">
              Log out
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded shadow transition-colors">
          
          {/* Controls */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4 mb-6">
            <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
              <div className="w-full sm:w-auto">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Select Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full sm:w-auto rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white dark:bg-gray-700"
                />
              </div>
              <div className="w-full sm:w-auto">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Search Learner</label>
                <input
                  type="text"
                  placeholder="Name or Adm No..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full sm:w-auto rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white dark:bg-gray-700 min-w-[200px]"
                />
              </div>
            </div>
            
            <div className="flex gap-2 w-full lg:w-auto">
              <button
                onClick={downloadCSV}
                disabled={filteredData.length === 0}
                className="flex-1 lg:flex-none bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                Download CSV
              </button>
              <button
                onClick={downloadPDF}
                disabled={filteredData.length === 0}
                className="flex-1 lg:flex-none bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                Download PDF
              </button>
            </div>
          </div>

          {/* Action Center */}
          {filteredData.filter(p => p.status === 'sent_home' && !p.admin_released && !p.admin_rejected).length > 0 && (
            <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <h3 className="text-red-800 dark:text-red-400 font-bold mb-3 flex items-center gap-2">
                ⚠️ Action Required: Learners Awaiting Release
              </h3>
              <ul className="space-y-2">
                {filteredData.filter(p => p.status === 'sent_home' && !p.admin_released && !p.admin_rejected).map(p => (
                  <li key={p.id} className="flex flex-col xl:flex-row justify-between xl:items-center bg-white dark:bg-gray-800 p-3 rounded shadow-sm border border-red-100 dark:border-gray-700 gap-3">
                    <div>
                      <span className="font-bold text-gray-900 dark:text-white">{p.learners?.full_name}</span>
                      <span className="text-gray-500 dark:text-gray-400 ml-2">({p.learners?.admission_no})</span>
                      <span className="hidden sm:inline text-gray-400 mx-2">•</span>
                      <span className="block sm:inline text-gray-600 dark:text-gray-300 text-sm mt-1 sm:mt-0">Recommended at {formatTime(p.closed_at)}</span>
                    </div>
                    <div className="flex gap-2 w-full xl:w-auto">
                      <button
                        onClick={() => handleActionClick(p.id, p.learners?.full_name || 'Learner', 'reject')}
                        className="flex-1 xl:flex-none bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-4 py-2 rounded hover:bg-gray-300 dark:hover:bg-gray-600 text-sm font-medium transition-colors"
                      >
                        Reject (Keep in School)
                      </button>
                      <button
                        onClick={() => handleActionClick(p.id, p.learners?.full_name || 'Learner', 'release')}
                        className="flex-1 xl:flex-none bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 text-sm font-medium transition-colors"
                      >
                        Release (Send Home)
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Data */}
          {loading ? (
            <p className="text-gray-500 dark:text-gray-400">Loading report...</p>
          ) : filteredData.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">No passes found matching your criteria.</p>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
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
                        <td className="p-3">
                          <span className="font-medium text-gray-900 dark:text-white">{p.learners?.full_name}</span>
                          <br/>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{p.learners?.admission_no}</span>
                        </td>
                        <td className="p-3 text-gray-600 dark:text-gray-300">{p.learners?.class_stream}</td>
                        <td className="p-3 text-gray-600 dark:text-gray-300 capitalize">{p.reason_category}</td>
                        <td className="p-3">{getStatusBadge(p)}</td>
                        <td className="p-3 text-gray-600 dark:text-gray-300">{formatTime(p.sent_at)}</td>
                        <td className="p-3 text-gray-600 dark:text-gray-300">{formatTime(p.acknowledged_at)}</td>
                        <td className="p-3 text-gray-600 dark:text-gray-300">{formatTime(p.closed_at)}</td>
                        <td className="p-3 text-gray-600 dark:text-gray-300">{p.teacher?.full_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-4">
                {filteredData.map((p) => (
                  <div key={p.id} className="border border-gray-200 dark:border-gray-700 p-4 rounded-lg bg-gray-50 dark:bg-gray-900/50 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-bold text-gray-900 dark:text-white text-lg leading-tight">{p.learners?.full_name}</p>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">{p.learners?.admission_no} • {p.learners?.class_stream}</p>
                      </div>
                      <div className="ml-2">
                        {getStatusBadge(p, true)}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-y-2 text-sm mt-3 mb-3 border-t border-b border-gray-200 dark:border-gray-700 py-3">
                      <div>
                        <span className="text-gray-500 dark:text-gray-400 text-xs block">Reason</span>
                        <span className="text-gray-900 dark:text-gray-200 capitalize font-medium">{p.reason_category}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400 text-xs block">Teacher</span>
                        <span className="text-gray-900 dark:text-gray-200 font-medium">{p.teacher?.full_name}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400 text-xs block">Sent</span>
                        <span className="text-gray-900 dark:text-gray-200">{formatTime(p.sent_at)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 dark:text-gray-400 text-xs block">Ack / Closed</span>
                        <span className="text-gray-900 dark:text-gray-200">
                          {formatTime(p.acknowledged_at)} / {formatTime(p.closed_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* The Sleek Modal (Handles both Release and Reject) */}
      <Modal
        isOpen={actionModal.isOpen}
        title={actionModal.action === 'release' ? 'Release Learner' : 'Reject Send Home'}
        message={
          actionModal.action === 'release' 
            ? `Are you sure you want to release ${actionModal.name}? This confirms that transport/home arrangements have been made.`
            : `Are you sure you want to reject the nurse's recommendation for ${actionModal.name}? The learner will be kept in school and marked as Returned to Class.`
        }
        confirmText={actionModal.action === 'release' ? 'Yes, Release Learner' : 'Yes, Reject'}
        isDanger={actionModal.action === 'release'} // Red button for release, blue for reject
        onCancel={() => setActionModal({ isOpen: false, passId: null, name: '', action: null })}
        onConfirm={handleConfirmAction}
      />
    </main>
  );
}
