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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'bulk' | 'manualWeek' | 'addToSpecificWeek'>('bulk');
  
  // Form State
  const [bulkStartDate, setBulkStartDate] = useState('');
  const [bulkWeeks, setBulkWeeks] = useState(13);
  const [manualDate, setManualDate] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [targetWeekStart, setTargetWeekStart] = useState('');

  async function fetchData() {
    setLoading(true);
    const { data: staff } = await supabase.from('staff').select('id, full_name, role').eq('is_active', true).in('role', ['teacher', 'admin']);
    if (staff) setStaffList(staff);

    const { data: duty } = await supabase
      .from('duty_roster')
      .select(`
        id, staff_id, week_start_date,
        staff:staff_id ( id, full_name, role )
      `)
      .order('week_start_date', { ascending: true });

    if (duty) setRoster(duty as unknown as DutyRecord[]);
    setLoading(false);
  }

  useEffect(() => {
    fetchData();
    // Set default bulk start date to this coming Monday
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    setBulkStartDate(monday.toISOString().split('T')[0]);
  }, []);

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

  // 1. GENERATE TERM ROSTER (Clears old weeks first!)
  async function handleBulkGenerate() {
    const teachers = staffList.filter(s => s.role === 'teacher');
    if (teachers.length < 2) { alert("You need at least 2 teachers."); return; }
    if (!bulkStartDate) { alert("Please select a start date."); return; }

    // First, delete existing weeks from the selected start date onwards
    // This prevents the "overlapping terms" bug
    const { error: deleteError } = await supabase
      .from('duty_roster')
      .delete()
      .gte('week_start_date', bulkStartDate);

    if (deleteError) {
      alert("Error clearing old roster: " + deleteError.message);
      return;
    }

    const weeks: string[] = [];
    let currentMonday = getMonday(new Date(bulkStartDate));
    for (let i = 0; i < bulkWeeks; i++) {
      weeks.push(formatLocalDate(currentMonday));
      currentMonday.setDate(currentMonday.getDate() + 7);
    }

    const inserts: { staff_id: string; week_start_date: string }[] = [];
    let teacherIndex = 0;

    for (const week of weeks) {
      const numToPick = 2; 
      for (let i = 0; i < numToPick; i++) {
        const teacher = teachers[teacherIndex % teachers.length];
        inserts.push({ staff_id: teacher.id, week_start_date: week });
        teacherIndex++;
      }
    }

    const { error } = await supabase.from('duty_roster').insert(inserts);

    if (error) alert(error.message);
    else { setIsModalOpen(false); fetchData(); }
  }

  // 2. ADD A SPECIFIC WEEK FROM SCRATCH
  async function handleManualWeek() {
    if (!selectedStaffId || !manualDate) return;
    const selectedDate = new Date(manualDate);
    const monday = getMonday(selectedDate);
    
    const { error } = await supabase.from('duty_roster').upsert({
      staff_id: selectedStaffId,
      week_start_date: formatLocalDate(monday)
    }, { onConflict: 'staff_id, week_start_date', ignoreDuplicates: true });
    
    if (error) alert(error.message);
    else { setIsModalOpen(false); setSelectedStaffId(''); setManualDate(''); fetchData(); }
  }

  // 3. ADD STAFF TO AN EXISTING WEEK CARD
  async function handleAddToSpecificWeek() {
    if (!selectedStaffId || !targetWeekStart) return;
    
    const { error } = await supabase.from('duty_roster').upsert({
      staff_id: selectedStaffId,
      week_start_date: targetWeekStart
    }, { onConflict: 'staff_id, week_start_date', ignoreDuplicates: true });
    
    if (error) alert(error.message);
    else { setIsModalOpen(false); setSelectedStaffId(''); setTargetWeekStart(''); fetchData(); }
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

  const groupedRoster = roster.reduce((acc, record) => {
    if (!acc[record.week_start_date]) acc[record.week_start_date] = [];
    acc[record.week_start_date].push(record);
    return acc;
  }, {} as Record<string, DutyRecord[]>);

  const sortedWeeks = Object.keys(groupedRoster).sort();

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-6 transition-colors">
      <div className="max-w-4xl mx-auto space-y-6">
        
        <div className="flex flex-col sm:flex-row justify-between sm:items-center bg-white dark:bg-gray-800 p-4 rounded shadow transition-colors gap-4">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Duty Roster</h1>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Manage who can send learners to the san</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <Link href="/admin" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Back to Reports</Link>
            <ThemeToggle />
            <button onClick={handleLogout} className="text-sm text-red-600 dark:text-red-400 hover:underline">Log out</button>
          </div>
        </div>

        {loading ? (
          <p className="text-center text-gray-500 py-10">Loading roster...</p>
        ) : (
          <div className="space-y-4">
            
            <div className="flex flex-wrap justify-end gap-3 mb-2">
              <button onClick={() => { setModalMode('manualWeek'); setIsModalOpen(true); }} className="text-sm font-medium bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-4 py-2 rounded hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                + Add Single Week
              </button>
              <button onClick={() => { setModalMode('bulk'); setIsModalOpen(true); }} className="text-sm font-medium bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors">
                ⚡ Generate Term Roster
              </button>
            </div>

            {sortedWeeks.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 p-8 rounded shadow text-center">
                <p className="text-gray-500">No duty weeks assigned yet. Generate a term roster to start.</p>
              </div>
            ) : (
              sortedWeeks.map((weekStart, index) => {
                const records = groupedRoster[weekStart];
                const isCurrentWeek = new Date(weekStart) <= new Date() && new Date(new Date(weekStart).setDate(new Date(weekStart).getDate() + 6)) >= new Date();
                
                return (
                  <div key={weekStart} className={`bg-white dark:bg-gray-800 rounded shadow transition-colors border-l-4 ${isCurrentWeek ? 'border-blue-500' : 'border-gray-300 dark:border-gray-700'}`}>
                    <div className="p-4 flex justify-between items-center border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 rounded-t">
                      <div>
                        <h2 className="font-bold text-gray-900 dark:text-white">
                          Term Week {index + 1}: {formatDateDisplay(weekStart)}
                          {isCurrentWeek && <span className="ml-2 text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 px-2 py-0.5 rounded-full uppercase tracking-wider">Current</span>}
                        </h2>
                      </div>
                      <button
                        onClick={() => { 
                          setTargetWeekStart(weekStart); 
                          setModalMode('addToSpecificWeek'); 
                          setIsModalOpen(true); 
                        }}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
                      >
                        + Add Staff
                      </button>
                    </div>
                    <div className="p-4 flex flex-wrap gap-2">
                      {records.map(r => (
                        <div key={r.id} className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 px-3 py-1.5 rounded-full text-sm">
                          <span className="font-medium text-gray-900 dark:text-white">{r.staff?.full_name}</span>
                          <button onClick={() => handleRemove(r.id)} className="text-red-500 hover:text-red-700 ml-1 font-bold">×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        title={
          modalMode === 'bulk' ? 'Generate Term Roster' : 
          modalMode === 'manualWeek' ? 'Add Single Week' : 
          `Add Staff to Week`
        }
        message={
          modalMode === 'bulk' ? 'Fairly distribute duty weeks. Note: This will overwrite existing weeks starting from the selected date.' : 
          modalMode === 'manualWeek' ? 'Assign a specific teacher to a specific week.' : 
          `Add a teacher to the week of ${formatDateDisplay(targetWeekStart)}.`
        }
        confirmText={
          modalMode === 'bulk' ? 'Generate Roster' : 
          'Add Teacher'
        }
        onCancel={() => { setIsModalOpen(false); setSelectedStaffId(''); }}
        onConfirm={
          modalMode === 'bulk' ? handleBulkGenerate : 
          modalMode === 'manualWeek' ? handleManualWeek : 
          handleAddToSpecificWeek
        }
        isDanger={modalMode === 'bulk'} // Make the button red for Bulk to warn it overwrites
      >
        <div className="space-y-4 mt-2">
          
          {modalMode === 'bulk' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date (Monday)</label>
                <input type="date" value={bulkStartDate} onChange={(e) => setBulkStartDate(e.target.value)} className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white dark:bg-gray-700" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Number of Weeks in Term</label>
                <input type="number" min="1" max="20" value={bulkWeeks} onChange={(e) => setBulkWeeks(Number(e.target.value))} className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white dark:bg-gray-700" />
              </div>
            </>
          )}

          {modalMode === 'manualWeek' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Select Date (Any day in the week)</label>
              <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white dark:bg-gray-700" />
            </div>
          )}

          {(modalMode === 'manualWeek' || modalMode === 'addToSpecificWeek') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Select Teacher</label>
              <select value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)} className="w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white dark:bg-gray-700">
                <option value="">-- Select --</option>
                {staffList.filter(s => s.role === 'teacher').map(s => (<option key={s.id} value={s.id}>{s.full_name}</option>))}
              </select>
            </div>
          )}

        </div>
      </Modal>

    </main>
  );
}
