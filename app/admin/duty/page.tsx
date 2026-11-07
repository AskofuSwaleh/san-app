'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import ThemeToggle from '@/components/ThemeToggle';
import Modal from '@/components/Modal';

type Staff = { id: string; full_name: string; role: string };
type DutyRecord = { id: string; staff_id: string; week_start_date: string; staff: Staff };

export default function DutyRosterPage() {
  const router = useRouter();
  const supabase = createClient();

  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [roster, setRoster] = useState<DutyRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [modalState, setModalState] = useState({ 
    isOpen: false, 
    weekStart: '', 
    title: '', 
    message: '', 
    action: 'add' as 'add' | 'bulk', 
  });
  const [selectedStaffId, setSelectedStaffId] = useState('');

  async function fetchData() {
    setLoading(true);
    // Fetch teachers only
    const { data: staff } = await supabase.from('staff').select('id, full_name, role').eq('is_active', true).in('role', ['teacher', 'admin']);
    if (staff) setStaffList(staff);

    // Fetch roster for the current term (next 90 days)
    const { data: duty } = await supabase
      .from('duty_roster')
      .select(`
        id, staff_id, week_start_date,
        staff:staff_id ( id, full_name, role )
      `)
      .gte('week_start_date', new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0])
      .order('week_start_date', { ascending: true });

    if (duty) setRoster(duty as unknown as DutyRecord[]);
    setLoading(false);
  }

  useEffect(() => {
    fetchData();
  }, []);

  // Helper to get Monday of the current week safely
  const getMonday = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff));
  };

  const formatLocalDate = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  async function handleAddStaff() {
    if (!selectedStaffId || !modalState.weekStart) return;
    await supabase.from('duty_roster').insert({
      staff_id: selectedStaffId,
      week_start_date: modalState.weekStart
    });
    setModalState({ ...modalState, isOpen: false });
    setSelectedStaffId('');
    fetchData();
  }

  async function handleBulkGenerate() {
    // 1. Get only teachers
    const teachers = staffList.filter(s => s.role === 'teacher');
    if (teachers.length < 2) {
      alert("You need at least 2 teachers in the system to generate a roster.");
      return;
    }

    // 2. Generate 12 weeks of Mondays starting from this week
    const weeks: string[] = [];
    let currentMonday = getMonday(new Date());
    for (let i = 0; i < 12; i++) {
      weeks.push(formatLocalDate(currentMonday));
      currentMonday.setDate(currentMonday.getDate() + 7);
    }

    // 3. Prepare the data to insert
    const inserts: { staff_id: string; week_start_date: string }[] = [];
    
    for (const week of weeks) {
      // Shuffle teachers and pick 2 or 3
      const shuffled = [...teachers].sort(() => 0.5 - Math.random());
      const numToPick = Math.floor(Math.random() * 2) + 2; // 2 or 3 teachers
      const selected = shuffled.slice(0, numToPick);

      for (const teacher of selected) {
        inserts.push({
          staff_id: teacher.id,
          week_start_date: week
        });
      }
    }

    // 4. Insert into database
    const { error } = await supabase.from('duty_roster').insert(inserts);
    if (error) {
      alert(error.message);
    } else {
      setModalState({ ...modalState, isOpen: false });
      fetchData();
    }
  }

  async function handleRemove(id: string) {
    if (!confirm('Remove this teacher from duty?')) return;
    await supabase.from('duty_roster').delete().eq('id', id);
    fetchData();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  const formatDateDisplay = (dateStr: string) => {
    const d = new Date(dateStr);
    const end = new Date(dateStr);
    end.setDate(end.getDate() + 6);
    return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
  };

  // Group roster by week
  const groupedRoster = roster.reduce((acc, record) => {
    if (!acc[record.week_start_date]) acc[record.week_start_date] = [];
    acc[record.week_start_date].push(record);
    return acc;
  }, {} as Record<string, DutyRecord[]>);

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-6 transition-colors">
      <div className="max-w-4xl mx-auto space-y-6">
        
        <div className="flex flex-col sm:flex-row justify-between sm:items-center bg-white dark:bg-gray-800 p-4 rounded shadow transition-colors gap-4">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Duty Roster</h1>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Manage who can send learners to the san</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <Link href="/admin" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
              Back to Reports
            </Link>
            <ThemeToggle />
            <button onClick={handleLogout} className="text-sm text-red-600 dark:text-red-400 hover:underline">
              Log out
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-center text-gray-500 py-10">Loading roster...</p>
        ) : (
          <div className="space-y-4">
            {Object.keys(groupedRoster).length === 0 ? (
              <div className="bg-white dark:bg-gray-800 p-8 rounded shadow text-center">
                <p className="text-gray-500 mb-4">No duty weeks assigned yet.</p>
                <button 
                  onClick={() => setModalState({ ...modalState, isOpen: true, action: 'bulk', title: 'Bulk Generate Roster', message: 'This will randomly assign 2-3 teachers for the next 12 weeks (This Term).' })}
                  className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition-colors"
                >
                  Generate This Term's Roster
                </button>
              </div>
            ) : (
              <>
                <div className="flex justify-end mb-2">
                  <button 
                    onClick={() => setModalState({ ...modalState, isOpen: true, action: 'bulk', title: 'Bulk Generate Roster', message: 'This will randomly assign 2-3 teachers for the next 12 weeks.' })}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    + Generate Next 12 Weeks
                  </button>
                </div>
                {Object.entries(groupedRoster).map(([weekStart, records]) => {
                  const isCurrentWeek = new Date(weekStart) <= new Date() && new Date(new Date(weekStart).setDate(new Date(weekStart).getDate() + 6)) >= new Date();
                  
                  return (
                    <div key={weekStart} className={`bg-white dark:bg-gray-800 rounded shadow transition-colors border-l-4 ${isCurrentWeek ? 'border-blue-500' : 'border-gray-300 dark:border-gray-700'}`}>
                      <div className="p-4 flex justify-between items-center border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 rounded-t">
                        <div>
                          <h2 className="font-bold text-gray-900 dark:text-white">
                            Week: {formatDateDisplay(weekStart)}
                            {isCurrentWeek && <span className="ml-2 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 px-2 py-0.5 rounded-full uppercase tracking-wider">Current</span>}
                          </h2>
                        </div>
                        <button
                          onClick={() => setModalState({ ...modalState, isOpen: true, action: 'add', weekStart, title: 'Add Teacher', message: `Assign a teacher to the week of ${formatDateDisplay(weekStart)}` })}
                          className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
                        >
                          + Add Staff
                        </button>
                      </div>
                      <div className="p-4 flex flex-wrap gap-2">
                        {records.map(r => (
                          <div key={r.id} className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 px-3 py-1.5 rounded-full text-sm">
                            <span className="font-medium text-gray-900 dark:text-white">{r.staff?.full_name}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">({r.staff?.role})</span>
                            <button onClick={() => handleRemove(r.id)} className="text-red-500 hover:text-red-700 ml-1 font-bold">×</button>
                          </div>
                        ))}
                        {records.length === 0 && <span className="text-sm text-gray-400 italic">No staff assigned.</span>}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>

      {/* Universal Modal for Add & Bulk Generate */}
      <Modal
        isOpen={modalState.isOpen}
        title={modalState.title}
        message={modalState.message}
        confirmText={modalState.action === 'add' ? 'Assign to Week' : 'Generate Roster'}
        onCancel={() => setModalState({ ...modalState, isOpen: false })}
        onConfirm={modalState.action === 'add' ? handleAddStaff : handleBulkGenerate}
        requireInput={false}
        isDanger={false}
      >
        {modalState.action === 'add' && (
          <select 
            value={selectedStaffId} 
            onChange={(e) => setSelectedStaffId(e.target.value)}
            className="w-full mt-2 rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white dark:bg-gray-700"
          >
            <option value="">-- Select Teacher --</option>
            {staffList.filter(s => s.role === 'teacher').map(s => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </select>
        )}
      </Modal>

    </main>
  );
}
