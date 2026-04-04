import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ===================
// TIPOS
// ===================

interface User {
  id: string;
  email: string;
  nome: string;
  role: string;
  tenantId: string;
  empresasPermitidas: string[];
}

interface Empresa {
  id: string;
  cnpj: string;
  razaoSocial: string;
  inscricaoMunicipal: string;
  ambiente: string;
  regimeTributario: string;
  aliquotaIss: number;
}

interface Licenca {
  status: string;
  ativo: boolean;
  vencimento?: string;
  plano?: string;
}

interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  createdAt: Date;
}

interface AppState {
  // Auth
  user: User | null;
  setUser: (user: User | null) => void;
  
  // Empresa selecionada
  empresaSelecionada: Empresa | null;
  setEmpresaSelecionada: (empresa: Empresa | null) => void;
  
  // Lista de empresas
  empresas: Empresa[];
  setEmpresas: (empresas: Empresa[]) => void;
  
  // Licença
  licenca: Licenca | null;
  setLicenca: (licenca: Licenca | null) => void;
  
  // Notificações
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt'>) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  
  // Loading global
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  
  // Sidebar
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  
  // Reset
  reset: () => void;
}

// ===================
// STORE
// ===================

const initialState = {
  user: null,
  empresaSelecionada: null,
  empresas: [],
  licenca: null,
  notifications: [],
  isLoading: false,
  sidebarOpen: true,
  sidebarCollapsed: false,
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setUser: (user) => set({ user }),

      setEmpresaSelecionada: (empresa) => set({ empresaSelecionada: empresa }),

      setEmpresas: (empresas) => set({ empresas }),

      setLicenca: (licenca) => set({ licenca }),

      addNotification: (notification) => {
        const id = Math.random().toString(36).substring(7);
        set((state) => ({
          notifications: [
            ...state.notifications,
            { ...notification, id, createdAt: new Date() },
          ],
        }));

        // Auto remove após 5 segundos
        setTimeout(() => {
          get().removeNotification(id);
        }, 5000);
      },

      removeNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),

      clearNotifications: () => set({ notifications: [] }),

      setIsLoading: (isLoading) => set({ isLoading }),

      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),

      reset: () => set(initialState),
    }),
    {
      name: 'nfse-storage',
      partialize: (state) => ({
        empresaSelecionada: state.empresaSelecionada,
        sidebarOpen: state.sidebarOpen,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
);

// ===================
// HOOKS
// ===================

export const useUser = () => useAppStore((state) => state.user);
export const useEmpresa = () => useAppStore((state) => state.empresaSelecionada);
export const useLicenca = () => useAppStore((state) => state.licenca);
export const useEmpresas = () => useAppStore((state) => state.empresas);
export const useIsLoading = () => useAppStore((state) => state.isLoading);

export const useIsAdmin = () => {
  const user = useUser();
  return user?.role === 'super_admin' || user?.role === 'owner';
};

export const useIsSuperAdmin = () => {
  const user = useUser();
  return user?.role === 'super_admin';
};

export const useCanEmit = () => {
  const user = useUser();
  return ['super_admin', 'owner', 'emissor'].includes(user?.role || '');
};
