'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase';
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
  Bell,
  Shield,
  Upload,
  BarChart3,
} from 'lucide-react';

// ===================
// MENU ITEMS
// ===================

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
    roles: ['MASTER', 'ADMIN', 'GERENTE', 'OPERADOR'],
  },
  {
    label: 'Importar Lote',
    href: '/importar',
    icon: Upload,
    roles: ['MASTER', 'ADMIN', 'GERENTE', 'OPERADOR'],
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
    label: 'Empresas',
    href: '/empresas',
    icon: Building2,
    roles: ['MASTER', 'ADMIN'],
  },
  {
    label: 'Usuários',
    href: '/usuarios',
    icon: Users,
    roles: ['MASTER', 'ADMIN'],
  },
  {
    label: 'Licenças',
    href: '/licencas',
    icon: Shield,
    roles: ['MASTER'],
  },
  {
    label: 'Configurações',
    href: '/configuracoes',
    icon: Settings,
    roles: ['MASTER', 'ADMIN'],
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
  const { sidebarOpen, setSidebarOpen, setUser, setEmpresaSelecionada, setEmpresas, setLicenca } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [empresas, setEmpresasList] = useState<any[]>([]);
  const [empresaDropdownOpen, setEmpresaDropdownOpen] = useState(false);

  // Carrega dados do usuário
  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    const supabase = createClient();
    
    const { data: { user: authUser } } = await supabase.auth.getUser();
    
    if (!authUser) {
      router.push('/');
      return;
    }

    // Busca usuário
    const { data: usuario } = await supabase
      .from('usuarios')
      .select(`
        *,
        tenants (id, nome, plano),
        licencas:tenants(licencas(status, license_active, validade))
      `)
      .eq('auth_user_id', authUser.id)
      .single();

    if (!usuario) {
      router.push('/');
      return;
    }

    setUser({
      id: usuario.id,
      email: usuario.email,
      nome: usuario.nome,
      role: usuario.role,
      tenantId: usuario.tenant_id,
      empresasPermitidas: usuario.empresas_permitidas || [],
    });

    // Busca empresas
    const { data: empresasData } = await supabase
      .from('empresas')
      .select('id, cnpj, razao_social, inscricao_municipal, ambiente, regime_tributario, aliquota_iss')
      .eq('ativo', true)
      .order('razao_social');

    if (empresasData) {
      const mappedEmpresas = empresasData.map(e => ({
        id: e.id,
        cnpj: e.cnpj,
        razaoSocial: e.razao_social,
        inscricaoMunicipal: e.inscricao_municipal,
        ambiente: e.ambiente,
        regimeTributario: e.regime_tributario,
        aliquotaIss: Number(e.aliquota_iss),
      }));
      
      setEmpresas(mappedEmpresas);
      setEmpresasList(mappedEmpresas);
      
      // Seleciona primeira empresa se não houver selecionada
      if (!empresa && mappedEmpresas.length > 0) {
        setEmpresaSelecionada(mappedEmpresas[0]);
      }
    }

    setLoading(false);
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    useAppStore.getState().reset();
    router.push('/');
  };

  const filteredMenuItems = menuItems.filter(item => {
    if (!item.roles) return true;
    return item.roles.includes(user?.role || '');
  });

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 transform bg-white shadow-lg transition-transform duration-200 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center justify-between border-b px-4">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 text-white">
                <FileText className="h-5 w-5" />
              </div>
              <span className="font-bold text-gray-900">NFSe Emissor</span>
            </Link>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          {/* Seletor de Empresa */}
          <div className="border-b p-4">
            <div className="relative">
              <button
                onClick={() => setEmpresaDropdownOpen(!empresaDropdownOpen)}
                className="flex w-full items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-left hover:bg-gray-100"
              >
                <div className="truncate">
                  <p className="text-xs text-gray-500">Empresa</p>
                  <p className="truncate text-sm font-medium text-gray-900">
                    {empresa?.razaoSocial || 'Selecione'}
                  </p>
                </div>
                <ChevronDown className="h-4 w-4 text-gray-500" />
              </button>

              {empresaDropdownOpen && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-auto rounded-lg bg-white shadow-lg">
                  {empresas.map((emp) => (
                    <button
                      key={emp.id}
                      onClick={() => {
                        setEmpresaSelecionada(emp);
                        setEmpresaDropdownOpen(false);
                      }}
                      className={cn(
                        'w-full px-3 py-2 text-left text-sm hover:bg-gray-50',
                        empresa?.id === emp.id && 'bg-primary-50 text-primary-600'
                      )}
                    >
                      {emp.razaoSocial}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Menu */}
          <nav className="flex-1 overflow-y-auto p-4">
            <ul className="space-y-1">
              {filteredMenuItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary-50 text-primary-600'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Usuário */}
          <div className="border-t p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600">
                {user?.nome?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 truncate">
                <p className="truncate text-sm font-medium text-gray-900">
                  {user?.nome}
                </p>
                <p className="truncate text-xs text-gray-500">{user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                title="Sair"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
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
        <header className="flex h-16 items-center justify-between border-b bg-white px-4 lg:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 hover:bg-gray-100 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-4">
            {/* Ambiente */}
            <span
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium',
                empresa?.ambiente === 'PRODUCAO'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-yellow-100 text-yellow-700'
              )}
            >
              {empresa?.ambiente === 'PRODUCAO' ? 'Produção' : 'Homologação'}
            </span>

            {/* Notificações */}
            <button className="relative rounded-lg p-2 hover:bg-gray-100">
              <Bell className="h-5 w-5 text-gray-500" />
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
