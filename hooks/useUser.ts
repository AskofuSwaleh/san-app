import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export type StaffProfile = {
  id: string;
  full_name: string;
  role: string;
};

export function useUser() {
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function fetchUser() {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        const { data } = await supabase
          .from('staff')
          .select('id, full_name, role')
          .eq('auth_user_id', user.id)
          .single();
        
        if (data) setStaff(data);
      }
      setLoading(false);
    }
    fetchUser();
  }, []);

  return { staff, loading };
}
