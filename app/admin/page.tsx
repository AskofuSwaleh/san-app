'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type ReportRow = {
  id: string;
  status: string;
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

  async function fetchReport() {
    setLoading(true);
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const { data: passes, error } = await supabase
      .from('passes')
      .select(`
        id, status, reason_category, sent_at, acknowledged_at, closed_at,
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
      return;
    }
    fetchReport();
  }, [date]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const formatTime = (iso: string | null) => {
    if (!iso) return '-';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const downloadCSV = () => {
    const headers = ['Admission No', 'Learner', 'Class', 'Reason', 'Status', 'Sent At', 'Acknowledged At', 'Closed At', 'Teacher', 'Nurse'];
    const rows = data.map((p) => [
      p.learners?.admission_no || '',
      p.learners?.full_name || '',
      p.learners?.class_stream || '',
      p.reason_category,
      p.status,
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
    
    const tableColumn = ["Learner", "Class", "Reason", "Status", "Sent", "Ack", "Closed", "Teacher", "Nurse"];
    const tableRows = data.map(p => [
      `${p.learners?.full_name}\n(${p.learners?.admission_no})`,
      p.learners?.class_stream || '',
      p.reason_category,
      p.status,
      formatTime(p.sent_at),
      formatTime(p.acknowledged_at),
      formatTime(p.closed_at),
      p.teacher?.full_name || '',
      p.nurse?.full_name || '-'
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: 35,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [41, 128, 185] },
    });

    doc.save(`san_report_${date}.pdf`);
  };

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        
        <div className="flex justify-between items-center bg-white p-4 rounded shadow">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Admin Report</h1>
            <p className="text-sm text-gray-500">Kenya High School — Sanatorium Log</p>
          </div>
          <button onClick={handleLogout} className="text-sm text-red-600 hover:underline">
            Log out
          </button>
        </div>

        <div className="bg-white p-6 rounded shadow">
          <div className="flex justify-between items-end mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Select Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded border border-gray-300 px-3 py-2 text-gray-900"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={downloadCSV}
                disabled={data.length === 0}
                className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 disabled:opacity-50"
              >
                Download CSV
              </button>
              <button
                onClick={downloadPDF}
                disabled={data.length === 0}
                className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50"
              >
                Download PDF
              </button>
            </div>
          </div>

          {loading ? (
            <p className="text-gray-500">Loading report...</p>
          ) : data.length === 0 ? (
            <p className="text-gray-500">No passes sent on this date.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100 text-gray-700">
                    <th className="p-3 border-b">Learner</th>
                    <th className="p-3 border-b">Class</th>
                    <th className="p-3 border-b">Reason</th>
                    <th className="p-3 border-b">Status</th>
                    <th className="p-3 border-b">Sent</th>
                    <th className="p-3 border-b">Ack</th>
                    <th className="p-3 border-b">Closed</th>
                    <th className="p-3 border-b">Teacher</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((p) => (
                    <tr key={p.id} className="border-b hover:bg-gray-50">
                      <td className="p-3">
                        <span className="font-medium text-gray-900">{p.learners?.full_name}</span>
                        <br/>
                        <span className="text-xs text-gray-500">{p.learners?.admission_no}</span>
                      </td>
                      <td className="p-3 text-gray-600">{p.learners?.class_stream}</td>
                      <td className="p-3 text-gray-600 capitalize">{p.reason_category}</td>
                      <td className="p-3">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                          p.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          p.status === 'acknowledged' ? 'bg-blue-100 text-blue-800' :
                          p.status === 'returned' ? 'bg-green-100 text-green-800' :
                          p.status === 'expired' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="p-3 text-gray-600">{formatTime(p.sent_at)}</td>
                      <td className="p-3 text-gray-600">{formatTime(p.acknowledged_at)}</td>
                      <td className="p-3 text-gray-600">{formatTime(p.closed_at)}</td>
                      <td className="p-3 text-gray-600">{p.teacher?.full_name}</td>
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
