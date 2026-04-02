import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'Emissor NFSe — Ribeirão Preto',
  description: 'Sistema de emissão de NFS-e para Ribeirão Preto (ABRASF 2.04)',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="bg-gray-900 text-white antialiased">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
