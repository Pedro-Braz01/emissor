'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
import { toast } from 'sonner';
import { FileText, Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const supabase = createClient();
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          toast.error('Email ou senha incorretos');
        } else {
          toast.error(error.message);
        }
        return;
      }

      if (data.user) {
        // Verifica se usuário existe na tabela usuarios
        const { data: usuario, error: userError } = await supabase
          .from('usuarios')
          .select('*, tenants(nome, plano), licencas(status, license_active)')
          .eq('auth_user_id', data.user.id)
          .eq('ativo', true)
          .single();

        if (userError || !usuario) {
          toast.error('Usuário não cadastrado no sistema');
          await supabase.auth.signOut();
          return;
        }

        // Verifica licença
        const licenca = usuario.licencas;
        if (!licenca?.license_active) {
          toast.error('Licença inativa. Entre em contato com o suporte.');
          await supabase.auth.signOut();
          return;
        }

        // Atualiza último login
        await supabase
          .from('usuarios')
          .update({ ultimo_login: new Date().toISOString() })
          .eq('id', usuario.id);

        toast.success(`Bem-vindo, ${usuario.nome}!`);
        router.push('/dashboard');
      }
    } catch (error) {
      toast.error('Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Lado esquerdo - Formulário */}
      <div className="flex flex-1 flex-col justify-center px-8 py-12 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          {/* Logo */}
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-600 text-white">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">NFSe Emissor</h1>
              <p className="text-sm text-gray-500">Ribeirão Preto</p>
            </div>
          </div>

          {/* Título */}
          <h2 className="text-2xl font-bold text-gray-900">
            Acesse sua conta
          </h2>
          <p className="mt-2 text-gray-600">
            Digite suas credenciais para continuar
          </p>

          {/* Formulário */}
          <form onSubmit={handleLogin} className="mt-8 space-y-5">
            {/* Email */}
            <div>
              <label htmlFor="email" className="label">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  className="input pl-10"
                  disabled={loading}
                />
              </div>
            </div>

            {/* Senha */}
            <div>
              <label htmlFor="password" className="label">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="input pl-10 pr-10"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Botão */}
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full py-3"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Entrando...
                </>
              ) : (
                'Entrar'
              )}
            </button>
          </form>

          {/* Rodapé */}
          <p className="mt-8 text-center text-sm text-gray-500">
            Problemas para acessar?{' '}
            <a href="mailto:suporte@exemplo.com" className="link">
              Fale com o suporte
            </a>
          </p>
        </div>
      </div>

      {/* Lado direito - Imagem/Gradiente */}
      <div className="hidden flex-1 bg-gradient-to-br from-primary-600 to-primary-800 lg:flex lg:flex-col lg:justify-center lg:px-16">
        <div className="max-w-md text-white">
          <h2 className="text-3xl font-bold">
            Emita suas notas fiscais de forma simples e rápida
          </h2>
          <p className="mt-4 text-lg text-primary-100">
            Sistema completo para emissão de NFSe conforme padrão ABRASF 2.04, 
            específico para Ribeirão Preto.
          </p>

          <div className="mt-12 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
                <FileText className="h-5 w-5" />
              </div>
              <span>Emissão individual e em lote</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
                <Mail className="h-5 w-5" />
              </div>
              <span>Envio automático por email</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
                <Lock className="h-5 w-5" />
              </div>
              <span>Segurança com certificado digital A1</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
