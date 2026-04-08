'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClientSupabaseClient } from '@/lib/supabase-client';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClientSupabaseClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      router.replace(session ? '/dashboard' : '/login');
    });
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-500 dark:text-gray-400 text-sm">Carregando...</p>
      </div>
    </div>
  );
}
