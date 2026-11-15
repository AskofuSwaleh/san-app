'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import ThemeToggle from '@/components/ThemeToggle';
import Modal from '@/components/Modal';
import { useUser } from '@/hooks/useUser';
import { addStaffMember, toggleStaffStatus, resetStaffPassword, updateStaffRole } from './actions';

type StaffMember = {
  id: string; 
  auth_user_id: string | null; 
  full_name: string; 
  email: string; 
  role: string; 
  is_active: boolean;
};

export default function StaffManagementPage() {
  const supabase = createClient();
  const { staff: currentUser } = useUser();

  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  
  const [generatedPass, setGeneratedPass] = useState<string | null>(null);
  const [passOwner, setPassOwner] = useState<string | null>(null);

  const [formData, setFormData] = useState({ fullName: '', email: '', role: 'teacher' });
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit Role State
  const [editRoleModal, setEditRoleModal] = useState<{ isOpen: boolean; id: string | null; name: string; currentRole: string }>({
    isOpen: false, id: null, name: '', currentRole: ''
  });
  const [selectedRole, setSelectedRole] = useState('');

  async function fetchStaff() {
    setLoading(true);
    const { data, error } = await supabase.from('staff').select('*').order('created_at', { ascending: false });
    if (!error && data) setStaffList(data);
    setLoading(false);
  }

  useEffect(() => { fetchStaff(); }, []);

  async function handleAddStaff() {
    if (!formData.fullName || !formData.email) { setError("Please fill in both name and email."); return; }
    setActionLoading(true); setError(null);

    const data = new FormData();
    data.append('fullName', formData.fullName);
    data.append('email', formData.email);
    data.append('role', formData.role);

    const result = await addStaffMember(data);

    if (result.error) setError(result.error);
    else if (result.success) {
      setIsAddModalOpen(false);
      setFormData({ fullName: '', email: '', role: 'teacher' });
      setPassOwner(formData.fullName);
      setGeneratedPass(result.tempPassword!);
      fetchStaff();
    }
    setActionLoading(false);
  }

  async function handleToggleStatus(id: string, currentStatus: boolean) {
    if (!confirm('Are you sure you want to change this staff member\'s status?')) return;
    const result = await toggleStaffStatus(id, currentStatus);
    if (result.error) alert(result.error);
    else fetchStaff();
  }

  async function handleResetPassword(id: string, authUserId: string | null, name: string) {
    if (!authUserId) { alert('This staff member has no linked login account.'); return; }
    if (!confirm(`Reset password for ${name}?`)) return;
    
    const result = await resetStaffPassword(id, authUserId);
    if (result.error) alert(result.error);
    else if (result.success) {
      setPassOwner(name);
      setGeneratedPass(result.tempPassword!);
    }
  }

  async function handleSaveRole() {
    if (!editRoleModal.id) return;
    setActionLoading(true);
    const result = await updateStaffRole(editRoleModal.id, selectedRole);
    if (result.error) alert(result.error);
    else {
      setEditRoleModal({ isOpen: false, id: null, name: '', currentRole: '' });
      fetchStaff();
    }
    setActionLoading(false);
  }

  async function confirmLogout() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-6 transition-colors">
      <div className="max-w-6xl mx-auto space-y-6">
        
        <div className="flex flex-col sm:flex-row justify-between sm:items-center bg-white dark:bg-gray-800 p-4 rounded shadow transition-colors gap-4">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">Staff Management</h1>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Add staff and manage login access</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <Link href="/admin" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Back to Reports</Link>
            <ThemeToggle />
            <button onClick={() => setIsLogoutModalOpen(true)} className="text-sm text-red-600 dark:text-red-400 hover:underline">Log out</button>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded shadow transition-colors">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">All Staff Members</h2>
            <button onClick={() => setIsAddModalOpen(true)} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors font-medium text-sm">+ Add Staff Member</button>
          </div>

          {loading ? (<p className="text-gray-500 dark:text-gray-400">Loading staff...</p>) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-gray-100 dark:bg-gray-900 text-gray-700 dark:text-gray-300">
                      <th className="p-3 border-b dark:border-gray-700">Name</th>
                      <th className="p-3 border-b dark:border-gray-700">Email</th>
                      <th className="p-3 border-b dark:border-gray-700">Role</th>
                      <th className="p-3 border-b dark:border-gray-700">Status</th>
                      <th className="p-3 border-b dark:border-gray-700 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffList.map((s) => (
                      <tr key={s.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="p-3 font-medium text-gray-900 dark:text-white">{s.full_name}</td>
                        <td className="p-3 text-gray-600 dark:text-gray-300">{s.email}</td>
                        <td className="p-3 text-gray-600 dark:text-gray-300 capitalize">{s.role}</td>
                        <td className="p-3">
                          <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${s.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200'}`}>
                            {s.is_active ? 'Active' : 'Deactivated'}
                          </span>
                        </td>
                        <td className="p-3 text-right space-x-3">
                          {currentUser?.id !== s.id && (
                            <button onClick={() => { setEditRoleModal({ isOpen: true, id: s.id, name: s.full_name, currentRole: s.role }); setSelectedRole(s.role); }} className="text-gray-600 dark:text-gray-400 hover:underline">Edit Role</button>
                          )}
                          <button onClick={() => handleResetPassword(s.id, s.auth_user_id, s.full_name)} className="text-blue-600 dark:text-blue-400 hover:underline">Reset Pass</button>
                          {currentUser?.id !== s.id && (
                            <button onClick={() => handleToggleStatus(s.id, s.is_active)} className={s.is_active ? 'text-red-600 dark:text-red-400 hover:underline' : 'text-green-600 dark:text-green-400 hover:underline'}>{s.is_active ? 'Deactivate' : 'Activate'}</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-4">
                {staffList.map((s) => (
                  <div key={s.id} className="border border-gray-200 dark:border-gray-700 p-4 rounded-lg bg-gray-50 dark:bg-gray-900/50 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-bold text-gray-900 dark:text-white">{s.full_name}</p>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">{s.email}</p>
                      </div>
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${s.is_active ? 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200'}`}>
                        {s.is_active ? 'Active' : 'Off'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 capitalize mb-3">Role: {s.role}</p>
                    <div className="flex flex-wrap gap-2">
                      {currentUser?.id !== s.id && (
                        <button onClick={() => { setEditRoleModal({ isOpen: true, id: s.id, name: s.full_name, currentRole: s.role }); setSelectedRole(s.role); }} className="flex-1 bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 py-1.5 rounded text-sm font-medium">Edit Role</button>
                      )}
                      <button onClick={() => handleResetPassword(s.id, s.auth_user_id, s.full_name)} className="flex-1 bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 py-1.5 rounded text-sm font-medium">Reset Pass</button>
                      {currentUser?.id !== s.id && (
                        <button onClick={() => handleToggleStatus(s.id, s.is_active)} className={`flex-1 py-1.5 rounded text-sm font-medium ${s.is_active ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200' : 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200'}`}>{s.is_active ? 'Deactivate' : 'Activate'}</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ADD STAFF MODAL */}
      <Modal isOpen={isAddModalOpen} title="Add Staff Member" message="Create a new login account." confirmText={actionLoading ? 'Creating...' : 'Create Account'} onCancel={() => { setIsAddModalOpen(false); setError(null); }} onConfirm={handleAddStaff} isDanger={false}>
        <div className="space-y-4 mt-2">
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Full Name</label><input type="text" required placeholder="e.g. Mr. John Doe" value={formData.fullName} onChange={(e) => setFormData({...formData, fullName: e.target.value})} className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white dark:bg-gray-700" /></div>
          <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email Address</label><input type="email" required placeholder="e.g. john@kenyahigh.example" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white dark:bg-gray-700" /></div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Role</label>
            <select value={formData.role} onChange={(e) => setFormData({...formData, role: e.target.value})} className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white dark:bg-gray-700">
              <option value="teacher">Teacher</option>
              <option value="nurse">Nurse</option>
              <option value="admin">Admin (Deputy)</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 p-2 rounded">{error}</p>}
        </div>
      </Modal>

      {/* EDIT ROLE MODAL */}
      <Modal isOpen={editRoleModal.isOpen} title="Edit Role" message={`Change the role for ${editRoleModal.name}.`} confirmText={actionLoading ? 'Saving...' : 'Save Changes'} onCancel={() => setEditRoleModal({ isOpen: false, id: null, name: '', currentRole: '' })} onConfirm={handleSaveRole} isDanger={false}>
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Role</label>
          <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)} className="mt-1 w-full rounded border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-white dark:bg-gray-700">
            <option value="teacher">Teacher</option>
            <option value="nurse">Nurse</option>
            <option value="admin">Admin (Deputy)</option>
          </select>
        </div>
      </Modal>

      {/* SHOW PASSWORD MODAL */}
      <Modal isOpen={!!generatedPass} title="Account Details" message={`Please copy this temporary password and share it with ${passOwner}. They will be prompted to change it on first login.`} confirmText="I have copied it" onCancel={() => setGeneratedPass(null)} onConfirm={() => setGeneratedPass(null)} isDanger={false}>
        <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-900 rounded border border-gray-300 dark:border-gray-700 text-center">
          <span className="text-2xl font-mono font-bold text-gray-900 dark:text-white tracking-wider">{generatedPass}</span>
        </div>
      </Modal>

      <Modal isOpen={isLogoutModalOpen} title="Log Out" message="Are you sure you want to log out?" confirmText="Yes, Log Out" isDanger={true} onCancel={() => setIsLogoutModalOpen(false)} onConfirm={confirmLogout} />
    </main>
  );
}
