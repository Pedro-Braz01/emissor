'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientSupabaseClient } from '@/lib/supabase-client';

type Empresa = { id: string; razao_social: string; regime_tributario: string };
type Config = {
  id?: string;
  empresa_id?: string;
  aliquota_iss: number;
  aliquota_pis: number;
  aliquota_cofins: number;
  aliquota_csll: number;
  aliquota_irrf: number;
  aliquota_inss: number;
  iss_retido_fonte: boolean;
  codigo_servico: string;
  item_lista_servico: string;
} | null;

const DEFAULTS: Omit<NonNullable<Config>, 'id' | 'empresa_id'> = {
  aliquota_iss: 2.0,
  aliquota_pis: 0.65,
  aliquota_cofins: 3.0,
  aliquota_csll: 1.0,
  aliquota_irrf: 1.5,
  aliquota_inss: 11.0,
  iss_retido_fonte: false,
  codigo_servico: '1.01',
  item_lista_servico: '1',
};

export default function ConfiguracoesTributariasClient({
  empresa, config
}: { empresa: Empresa; config: Config }) {
  const router = useRouter();
  const [form, setForm] = useState({ ...DEFAULTS, ...config });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const isSimplesNacional = empresa.regime_tributario === 'simples_nacional';

  function set(key: string, value: string | number | boolean) {
    setForm(f => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    const supabase = createClientSupabaseClient();

    const payload = {
      empresa_id: empresa.id,
      aliquota_iss: form.aliquota_iss,
      aliquota_pis: isSimplesNacional ? 0 : form.aliquota_pis,
      aliquota_cofins: isSimplesNacional ? 0 : form.aliquota_cofins,
      aliquota_csll: isSimplesNacional ? 0 : form.aliquota_csll,
      aliquota_irrf: isSimplesNacional ? 0 : form.aliquota_irrf,
      aliquota_inss: isSimplesNacional ? 0 : form.aliquota_inss,
      iss_retido_fonte: form.iss_retido_fonte,
      codigo_servico: form.codigo_servico,
      item_lista_servico: form.item_lista_servico,
      updated_at: new Date().toISOString(),
    };

    const { error: err } = config?.id
      ? await supabase.from('configuracoes_tributarias').update(payload).eq('id', config.id)
      : await supabase.from('configuracoes_tributarias').insert(payload);

    if (err) { setError(err.message); setSaving(false); return; }
    setSaved(true);
    setSaving(false);
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <button onClick={() => router.push('/dashboard')}
              className="text-gray-400 hover:text-white text-sm flex items-center gap-1.5 mb-1">
              ← Dashboard
            </button>
            <h1 className="text-white font-semibold">Configurações Tributárias</h1>
            <p className="text-gray-400 text-xs mt-0.5">{empresa.razao_social}</p>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full border bg-blue-500/10 text-blue-400 border-blue-500/20">
            {empresa.regime_tributario.replace(/_/g, ' ').toUpperCase()}
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Serviço */}
        <Section title="Código de Serviço">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Código do Serviço (LC 116)" hint="Ex: 1.01">
              <input value={form.codigo_servico}
                onChange={e => set('codigo_servico', e.target.value)}
                className={inputCls} placeholder="1.01" />
            </Field>
            <Field label="Item da Lista LC 116" hint="Ex: 1">
              <input value={form.item_lista_servico}
                onChange={e => set('item_lista_servico', e.target.value)}
                className={inputCls} placeholder="1" />
            </Field>
          </div>
        </Section>

        {/* ISS */}
        <Section title="ISS — Imposto Sobre Serviços">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Alíquota ISS (%)" hint="Definida pelo município">
              <input type="number" step="0.01" min="0" max="5" value={form.aliquota_iss}
                onChange={e => set('aliquota_iss', parseFloat(e.target.value) || 0)}
                className={inputCls} />
            </Field>
            <Field label="ISS Retido na Fonte">
              <label className="flex items-center gap-3 mt-2 cursor-pointer">
                <div
                  onClick={() => set('iss_retido_fonte', !form.iss_retido_fonte)}
                  className={`w-11 h-6 rounded-full transition-colors cursor-pointer relative
                    ${form.iss_retido_fonte ? 'bg-blue-600' : 'bg-gray-600'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all
                    ${form.iss_retido_fonte ? 'left-6' : 'left-1'}`} />
                </div>
                <span className="text-gray-300 text-sm">
                  {form.iss_retido_fonte ? 'Sim — tomador retém' : 'Não — prestador recolhe'}
                </span>
              </label>
            </Field>
          </div>
        </Section>

        {/* Federais */}
        <Section
          title="Retenções Federais"
          badge={isSimplesNacional ? 'Não aplicável — Simples Nacional' : undefined}
        >
          {isSimplesNacional ? (
            <p className="text-gray-500 text-sm">
              No Simples Nacional as retenções federais (PIS, COFINS, CSLL, IRRF) são unificadas no DAS
              e não são destacadas na NFS-e. Alíquotas zeradas automaticamente.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {(['pis', 'cofins', 'csll', 'irrf', 'inss'] as const).map(imp => (
                <Field
                  key={imp}
                  label={`Alíquota ${imp.toUpperCase()} (%)`}
                  hint={imp === 'irrf' ? 'Isento se base < R$ 215,05' : imp === 'inss' ? 'Retenção previdenciária' : undefined}
                >
                  <input
                    type="number" step="0.01" min="0" max="10"
                    value={(form as Record<string, unknown>)[`aliquota_${imp}`] as number}
                    onChange={e => set(`aliquota_${imp}`, parseFloat(e.target.value) || 0)}
                    className={inputCls}
                  />
                </Field>
              ))}
            </div>
          )}
        </Section>

        {/* Preview de cálculo */}
        <Section title="Simulação (base R$ 1.000,00)">
          <PreviewCalculo form={form} regime={empresa.regime_tributario} />
        </Section>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-colors"
        >
          {saving ? 'Salvando...' : saved ? '✓ Configurações Salvas' : 'Salvar Configurações'}
        </button>
      </main>
    </div>
  );
}

// ── Sub-componentes ──────────────────────────────────────────────────

const inputCls = `w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm
  placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`;

function Section({ title, badge, children }: {
  title: string; badge?: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-white font-medium text-sm">{title}</h2>
        {badge && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
      {hint && <p className="text-xs text-gray-500 mb-1">{hint}</p>}
      {children}
    </div>
  );
}

function PreviewCalculo({ form, regime }: { form: typeof DEFAULTS; regime: string }) {
  const base = 1000;
  const isSN = regime === 'simples_nacional';
  const pct = (a: number) => parseFloat((base * (a / 100)).toFixed(2));

  const iss    = pct(form.aliquota_iss);
  const pis    = isSN ? 0 : pct(form.aliquota_pis);
  const cofins = isSN ? 0 : pct(form.aliquota_cofins);
  const csll   = isSN ? 0 : pct(form.aliquota_csll);
  const irrf   = isSN ? 0 : (base >= 215.05 ? pct(form.aliquota_irrf) : 0);
  const inss   = isSN ? 0 : pct(form.aliquota_inss);
  const total  = iss + pis + cofins + csll + irrf + inss;
  const liquido = base - total;

  const fmt = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const rows = [
    { label: 'Valor dos Serviços', value: fmt(base), bold: false },
    { label: `ISS (${form.aliquota_iss}%)`, value: fmt(iss), bold: false },
    ...(!isSN ? [
      { label: `PIS (${form.aliquota_pis}%)`,    value: fmt(pis),    bold: false },
      { label: `COFINS (${form.aliquota_cofins}%)`, value: fmt(cofins), bold: false },
      { label: `CSLL (${form.aliquota_csll}%)`,  value: fmt(csll),   bold: false },
      { label: `IRRF (${form.aliquota_irrf}%)`,  value: irrf > 0 ? fmt(irrf) : 'Isento', bold: false },
      { label: `INSS (${form.aliquota_inss}%)`,  value: fmt(inss), bold: false },
    ] : []),
    { label: 'Total de Impostos', value: fmt(total), bold: false },
    { label: 'Valor Líquido', value: fmt(liquido), bold: true },
  ];

  return (
    <div className="space-y-2">
      {rows.map(row => (
        <div key={row.label} className={`flex justify-between text-sm
          ${row.bold ? 'text-white font-semibold border-t border-gray-700 pt-2 mt-2' : 'text-gray-400'}`}>
          <span>{row.label}</span>
          <span className={row.bold ? 'text-green-400' : ''}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}
