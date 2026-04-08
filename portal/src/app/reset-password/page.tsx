'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClientSupabaseClient } from '@/lib/supabase-client';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const supabase = createClientSupabaseClient();

    // Tenta processar tokens do hash fragment (access_token, refresh_token)
    // O Supabase envia esses tokens via hash no redirect do email de recovery
    const handleRecovery = async () => {
      // Verifica se há hash params (format: #access_token=...&type=recovery...)
      const hash = window.location.hash;
      if (hash && hash.includes('access_token')) {
        // O Supabase client processa automaticamente o hash
        // mas precisamos aguardar o evento de auth state change
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setSessionReady(true);
        setChecking(false);
        return;
      }

      // Escuta mudanças de auth (recovery event ou token exchange)
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
            if (session) {
              setSessionReady(true);
              setChecking(false);
            }
          }
        }
      );

      // Timeout: se após 3s não tiver sessão, pode ser link expirado
      setTimeout(() => {
        setChecking(false);
      }, 3000);

      return () => subscription.unsubscribe();
    };

    handleRecovery();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não conferem.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const supabase = createClientSupabaseClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        console.error('Update password error:', updateError);
        setError('Erro ao redefinir senha. O link pode ter expirado. Solicite um novo.');
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push('/dashboard'), 2000);
    } catch (err) {
      console.error('Update password exception:', err);
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Redefinir Senha</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Crie uma nova senha para sua conta</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-xl">
          {checking ? (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
              <p className="text-gray-500 dark:text-gray-400 text-sm">Verificando link de recuperação...</p>
            </div>
          ) : success ? (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 dark:bg-green-500/10 rounded-full mb-2">
                <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Senha redefinida!</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm">Redirecionando para o painel...</p>
            </div>
          ) : !sessionReady ? (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-yellow-100 dark:bg-yellow-500/10 rounded-full mb-2">
                <svg className="w-6 h-6 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Link expirado ou inválido</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                O link de recuperação pode ter expirado. Solicite um novo link.
              </p>
              <a href="/forgot-password" className="inline-block text-blue-400 hover:text-blue-300 text-sm mt-2">
                Solicitar novo link
              </a>
            </div>
          ) : (
            <>
              {error && (
                <div className="bg-red-100 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 rounded-lg p-3 mb-5">
                  <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Nova senha</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={'Mínimo 6 caracteres'}
                    required
                    minLength={6}
                    className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Confirmar nova senha</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Repita a senha"
                    required
                    minLength={6}
                    className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !password || !confirmPassword}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                             text-white font-medium py-2.5 rounded-lg transition-colors"
                >
                  {loading ? 'Salvando...' : 'Redefinir senha'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
