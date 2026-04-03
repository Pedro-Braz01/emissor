'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClientSupabaseClient } from '@/lib/supabase-client';
import { useEmpresa, useAppStore } from '@/lib/store';
import { fetchCnpj, fetchCep } from '@/lib/brasil-api';
import DashboardLayout from '@/components/layout/dashboard-layout';
import {
  Building2,
  Shield,
  Mail,
  Upload,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';

export default function ConfiguracoesEmpresaPage() {
  const router = useRouter();
  const empresa = useEmpresa();
  const { setEmpresaSelecionada } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [cepLoading, setCepLoading] = useState(false);

  // Form state
  const [razaoSocial, setRazaoSocial] = useState('');
  const [nomeFantasia, setNomeFantasia] = useState('');
  const [inscricaoMunicipal, setInscricaoMunicipal] = useState('');
  const [regimeTributario, setRegimeTributario] = useState('simples_nacional');
  const [emailEmpresa, setEmailEmpresa] = useState('');
  const [emailContador, setEmailContador] = useState('');
  const [telefone, setTelefone] = useState('');
  const [endereco, setEndereco] = useState('');

  // Email toggles
  const [envioAutoContador, setEnvioAutoContador] = useState(false);
  const [envioAutoEmissor, setEnvioAutoEmissor] = useState(false);

  // Certificate
  const [certFile, setCertFile] = useState<File | null>(null);
  const [certSenha, setCertSenha] = useState('');
  const [certStatus, setCertStatus] = useState<'none' | 'uploaded' | 'error'>('none');

  useEffect(() => {
    loadEmpresaData();
  }, [empresa?.id]);

  async function loadEmpresaData() {
    if (!empresa?.id) return;
    setLoading(true);
    const supabase = createClientSupabaseClient();

    const { data } = await supabase
      .from('empresas')
      .select('*')
      .eq('id', empresa.id)
      .single();

    if (data) {
      setRazaoSocial(data.razao_social || '');
      setNomeFantasia(data.nome_fantasia || '');
      setInscricaoMunicipal(data.inscricao_municipal || '');
      setRegimeTributario(data.regime_tributario || 'simples_nacional');
      setEmailEmpresa(data.email_empresa || '');
      setEmailContador(data.email_contador || '');
      setTelefone(data.telefone || '');
      setEndereco(data.endereco || '');
      setEnvioAutoContador((data as any).envio_auto_contador ?? false);
      setEnvioAutoEmissor((data as any).envio_auto_emissor ?? false);
      setCertStatus((data as any).certificado_digital_encrypted ? 'uploaded' : 'none');
    }
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setSaved(false);

    const supabase = createClientSupabaseClient();

    const payload: Record<string, unknown> = {
      razao_social: razaoSocial,
      nome_fantasia: nomeFantasia || null,
      inscricao_municipal: inscricaoMunicipal,
      regime_tributario: regimeTributario,
      email_empresa: emailEmpresa || null,
      email_contador: emailContador || null,
      telefone: telefone || null,
      endereco: endereco || null,
    };

    const { error: updateError } = await supabase
      .from('empresas')
      .update(payload)
      .eq('id', empresa!.id);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setEmpresaSelecionada({
      ...empresa!,
      razaoSocial,
      inscricaoMunicipal: inscricaoMunicipal,
      regimeTributario: regimeTributario,
    });

    setSaved(true);
    setSaving(false);
  }

  async function handleCertUpload() {
    if (!certFile || !certSenha) {
      setError('Selecione o arquivo do certificado e informe a senha.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const buffer = await certFile.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      const res = await fetch('/api/certificado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresaId: empresa!.id,
          certificado: base64,
          senha: certSenha,
        }),
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setCertStatus('uploaded');
      setCertFile(null);
      setCertSenha('');
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar certificado');
      setCertStatus('error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{'Configurações da Empresa'}</h1>
          <p className="mt-1 text-gray-500">{'Gerencie os dados e preferências da sua empresa'}</p>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
            <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {saved && (
          <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
            <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
            <p className="text-sm text-green-700">{'Configurações salvas com sucesso!'}</p>
          </div>
        )}

        {/* Dados da Empresa */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-gray-500" />
            <h2 className="font-semibold text-gray-900">Dados da Empresa</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="label">{'Razão Social'}</label>
              <input type="text" value={razaoSocial} onChange={e => setRazaoSocial(e.target.value)}
                className="input" />
            </div>
            <div>
              <label className="label">Nome Fantasia</label>
              <input type="text" value={nomeFantasia} onChange={e => setNomeFantasia(e.target.value)}
                className="input" />
            </div>
            <div>
              <label className="label">{'Inscrição Municipal'}</label>
              <input type="text" value={inscricaoMunicipal} onChange={e => setInscricaoMunicipal(e.target.value)}
                className="input" />
            </div>
            <div>
              <label className="label">{'Regime Tributário'}</label>
              <select value={regimeTributario} onChange={e => setRegimeTributario(e.target.value)}
                className="input">
                <option value="simples_nacional">Simples Nacional</option>
                <option value="lucro_presumido">Lucro Presumido</option>
                <option value="lucro_real">Lucro Real</option>
              </select>
            </div>
            <div>
              <label className="label">Telefone</label>
              <input type="tel" value={telefone} onChange={e => setTelefone(e.target.value)}
                placeholder="(00) 00000-0000" className="input" />
            </div>
            <div className="md:col-span-2">
              <label className="label">{'Endereço'}</label>
              <input type="text" value={endereco} onChange={e => setEndereco(e.target.value)}
                placeholder={'Rua, Número, Bairro, Cidade/UF'}
                className="input" />
            </div>
          </div>
        </div>

        {/* Certificado Digital */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5 text-gray-500" />
            <h2 className="font-semibold text-gray-900">Certificado Digital (A1)</h2>
          </div>

          {certStatus === 'uploaded' && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 p-3">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <p className="text-sm text-green-700">Certificado configurado</p>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Arquivo do Certificado (.pfx)</label>
              <input
                type="file"
                accept=".pfx,.p12"
                onChange={e => setCertFile(e.target.files?.[0] || null)}
                className="input text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary-50
                           file:px-3 file:py-1 file:text-sm file:text-primary-700 file:cursor-pointer"
              />
            </div>
            <div>
              <label className="label">Senha do Certificado</label>
              <input type="password" value={certSenha} onChange={e => setCertSenha(e.target.value)}
                placeholder="Senha do .pfx" className="input" />
            </div>
          </div>

          <button onClick={handleCertUpload} disabled={!certFile || !certSenha || saving}
            className="btn btn-outline mt-4">
            <Upload className="h-4 w-4" />
            {saving ? 'Enviando...' : 'Enviar Certificado'}
          </button>
        </div>

        {/* Configurações de Email */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Mail className="h-5 w-5 text-gray-500" />
            <h2 className="font-semibold text-gray-900">{'Configurações de Email'}</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Email da Empresa</label>
              <input type="email" value={emailEmpresa} onChange={e => setEmailEmpresa(e.target.value)}
                placeholder="empresa@email.com" className="input" />
            </div>
            <div>
              <label className="label">Email do Contador</label>
              <input type="email" value={emailContador} onChange={e => setEmailContador(e.target.value)}
                placeholder="contador@email.com" className="input" />
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <Toggle
              label="Enviar XML e PDF automaticamente para o contador"
              description={'Ao emitir uma nota, o XML e PDF serão enviados para o email do contador'}
              checked={envioAutoContador}
              onChange={setEnvioAutoContador}
              disabled={!emailContador}
            />
            <Toggle
              label="Enviar nota automaticamente para o emissor"
              description={'Receba uma cópia da nota emitida no email da empresa'}
              checked={envioAutoEmissor}
              onChange={setEnvioAutoEmissor}
              disabled={!emailEmpresa}
            />
          </div>
        </div>

        {/* Salvar */}
        <button onClick={handleSave} disabled={saving}
          className="btn btn-primary w-full py-3">
          {saving ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
          ) : (
            <><Save className="h-4 w-4" /> {'Salvar Configurações'}</>
          )}
        </button>
      </div>
    </DashboardLayout>
  );
}

function Toggle({ label, description, checked, onChange, disabled }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between rounded-lg border p-4 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors
          ${checked ? 'bg-primary-600' : 'bg-gray-200'}
          ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform
          ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}
