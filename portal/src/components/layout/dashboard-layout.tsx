'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClientSupabaseClient as createClient } from '@/lib/supabase-client';
import { useAppStore, useUser, useEmpresa } from '@/lib/store';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FileText,
  Search,
  Building2,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Bell,
  Shield,
  Upload,
  BarChart3,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
} from 'lucide-react';
import { useTheme } from '@/components/providers/theme-provider';

// ===================
// MENU ITEMS
// ===================

const MASTER_EMAIL = process.env.NEXT_PUBLIC_MASTER_EMAIL || '';

const menuItems = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    label: 'Emitir NFSe',
    href: '/emitir',
    icon: FileText,
  },
  {
    label: 'Emissao em Lote',
    href: '/emissao-lote',
    icon: Upload,
  },
  {
    label: 'Consultar Notas',
    href: '/notas',
    icon: Search,
  },
  {
    label: 'Relatórios',
    href: '/relatorios',
    icon: BarChart3,
  },
  {
    label: 'Config. Tributárias',
    href: '/configuracoes/tributarias',
    icon: Settings,
  },
  {
    label: 'Config. Empresa',
    href: '/configuracoes/empresa',
    icon: Building2,
  },
  {
    label: 'Gestão Usuários',
    href: '/configuracoes/usuarios',
    icon: Users,
  },
  {
    label: 'Admin',
    href: '/admin',
    icon: Shield,
    adminOnly: true,
  },
];

// ===================
// LAYOUT
// ===================

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useUser();
  const empresa = useEmpresa();
  const { theme, toggleTheme } = useTheme();
  const {
    sidebarOpen, setSidebarOpen,
    sidebarCollapsed, setSidebarCollapsed,
    setUser, setEmpresaSelecionada, setEmpresas, setLicenca,
  } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [empresas, setEmpresasList] = useState<any[]>([]);
  const [empresaDropdownOpen, setEmpresaDropdownOpen] = useState(false);
  const [empresaSearch, setEmpresaSearch] = useState('');

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    const supabase = createClient();

    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      router.push('/login');
      return;
    }

    // Busca o role real do usuário em perfis_usuarios
    const { data: perfil } = await supabase
      .from('perfis_usuarios')
      .select('role')
      .eq('user_id', authUser.id)
      .eq('ativo', true)
      .order('role')   // super_admin primeiro alphabeticamente
      .limit(1)
      .single();

    const role = perfil?.role ?? 'owner';

    setUser({
      id: authUser.id,
      email: authUser.email || '',
      nome: authUser.user_metadata?.razao_social || authUser.email?.split('@')[0] || 'Usuário',
      role,
      tenantId: '',
      empresasPermitidas: [],
    });

    // Fetch empresas que o usuário tem acesso (owner direto ou via perfis)
    const { data: empresasData } = await supabase
      .from('empresas')
      .select('id, cnpj, razao_social, inscricao_municipal, regime_tributario')
      .order('razao_social');

    if (empresasData && empresasData.length > 0) {
      const mappedEmpresas = empresasData.map(e => ({
        id: e.id,
        cnpj: e.cnpj,
        razaoSocial: e.razao_social,
        inscricaoMunicipal: e.inscricao_municipal,
        ambiente: 'PRODUCAO',
        regimeTributario: e.regime_tributario,
        aliquotaIss: 0.02,
      }));

      setEmpresas(mappedEmpresas);
      setEmpresasList(mappedEmpresas);

      if (!empresa && mappedEmpresas.length > 0) {
        setEmpresaSelecionada(mappedEmpresas[0]);
      }

      // Fetch license for first empresa
      const empresaId = empresa?.id || mappedEmpresas[0].id;
      const { data: licenca } = await supabase
        .from('licencas')
        .select('*')
        .eq('empresa_id', empresaId)
        .single();

      if (licenca) {
        setLicenca({
          status: licenca.license_active ? 'ATIVO' : 'BLOQUEADO',
          ativo: licenca.license_active,
          vencimento: licenca.data_expiracao,
          plano: licenca.plano,
        });
      }
    }

    setLoading(false);
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    useAppStore.getState().reset();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 transform bg-white dark:bg-gray-800 shadow-lg transition-all duration-200 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          sidebarCollapsed ? 'w-16' : 'w-64'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center justify-between border-b dark:border-gray-700 px-3">
            {!sidebarCollapsed ? (
              <Link href="/dashboard" className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 text-white shrink-0">
                  <FileText className="h-5 w-5" />
                </div>
                <span className="font-bold text-gray-900 dark:text-white">NFSe Emissor</span>
              </Link>
            ) : (
              <Link href="/dashboard" className="mx-auto">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 text-white">
                  <FileText className="h-5 w-5" />
                </div>
              </Link>
            )}
            {/* Close button - mobile only */}
            {!sidebarCollapsed && (
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            )}
          </div>

          {/* Seletor de Empresa */}
          {empresas.length > 0 && !sidebarCollapsed && (
            <div className="border-b p-4">
              <div className="relative">
                <button
                  onClick={() => setEmpresaDropdownOpen(!empresaDropdownOpen)}
                  className="flex w-full items-center justify-between rounded-lg bg-gray-50 dark:bg-gray-700 px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600"
                >
                  <div className="truncate">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Empresa</p>
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                      {empresa?.razaoSocial || 'Selecione'}
                    </p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                </button>

                {empresaDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-72 overflow-hidden rounded-lg bg-white dark:bg-gray-700 shadow-lg border dark:border-gray-600 flex flex-col">
                    <div className="p-2 border-b dark:border-gray-600">
                      <input
                        type="text"
                        placeholder="Buscar empresa..."
                        value={empresaSearch}
                        onChange={(e) => setEmpresaSearch(e.target.value)}
                        className="w-full rounded-md border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-600 px-3 py-1.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        autoFocus
                      />
                    </div>
                    <div className="overflow-auto max-h-56">
                      {empresas
                        .filter((emp) =>
                          emp.razaoSocial.toLowerCase().includes(empresaSearch.toLowerCase()) ||
                          emp.cnpj?.includes(empresaSearch.replace(/\D/g, ''))
                        )
                        .map((emp) => (
                          <button
                            key={emp.id}
                            onClick={() => {
                              setEmpresaSelecionada(emp);
                              setEmpresaDropdownOpen(false);
                              setEmpresaSearch('');
                            }}
                            className={cn(
                              'w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-600 dark:text-gray-200',
                              empresa?.id === emp.id && 'bg-primary-50 dark:bg-primary-900/30 text-primary-600'
                            )}
                          >
                            {emp.razaoSocial}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Menu */}
          <nav className="flex-1 overflow-y-auto p-2">
            <ul className="space-y-1">
              {menuItems
                .filter((item) => !item.adminOnly || user?.role === 'super_admin' || user?.email === MASTER_EMAIL)
                .map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      title={sidebarCollapsed ? item.label : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-600'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white',
                        sidebarCollapsed && 'justify-center px-2'
                      )}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      {!sidebarCollapsed && item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Collapse toggle - desktop only */}
          <div className="hidden lg:block border-t dark:border-gray-700 px-2 py-2">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300"
              title={sidebarCollapsed ? 'Expandir menu' : 'Minimizar menu'}
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="h-5 w-5" />
              ) : (
                <>
                  <PanelLeftClose className="h-5 w-5" />
                  <span>Minimizar</span>
                </>
              )}
            </button>
          </div>

          {/* Usuário */}
          <div className="border-t dark:border-gray-700 p-3">
            {sidebarCollapsed ? (
              <div className="flex flex-col items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm font-medium">
                  {user?.nome?.charAt(0).toUpperCase() || 'U'}
                </div>
                <button
                  onClick={handleLogout}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600"
                  title="Sair"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 shrink-0">
                  {user?.nome?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="flex-1 truncate">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                    {user?.nome}
                  </p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">{user?.email}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600"
                  title="Sair"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-16 items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 lg:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-700 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2 ml-auto">
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
            >
              {theme === 'dark' ? (
                <Sun className="h-5 w-5 text-yellow-400" />
              ) : (
                <Moon className="h-5 w-5 text-gray-500" />
              )}
            </button>
            {/* Notificações */}
            <button className="relative rounded-lg p-2 hover:bg-gray-100 dark:hover:bg-gray-700">
              <Bell className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
