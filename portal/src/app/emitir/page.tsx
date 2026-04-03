'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { useEmpresa } from '@/lib/store';
import { formatCurrency, formatCpfCnpj, calcularImpostos, validateCpfCnpj } from '@/lib/utils';
import { fetchCnpj, fetchCep } from '@/lib/brasil-api';
import DashboardLayout from '@/components/layout/dashboard-layout';
import {
  FileText,
  User,
  MapPin,
  DollarSign,
  Send,
  Loader2,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';

// ===================
// SCHEMA
// ===================

const emissaoSchema = z.object({
  // Tomador
  tomador: z.object({
    cpfCnpj: z.string()
      .min(11, 'CPF/CNPJ inválido')
      .max(18, 'CPF/CNPJ inválido')
      .refine((val) => validateCpfCnpj(val.replace(/\D/g, '')), 'CPF/CNPJ inválido'),
    razaoSocial: z.string().min(3, 'Nome/Razão Social muito curto'),
    email: z.string().email('Email inválido').optional().or(z.literal('')),
    telefone: z.string().optional(),
    endereco: z.object({
      cep: z.string().optional(),
      logradouro: z.string().optional(),
      numero: z.string().optional(),
      complemento: z.string().optional(),
      bairro: z.string().optional(),
      uf: z.string().optional(),
    }).optional(),
  }),
  // Serviço
  servico: z.object({
    valorServicos: z.number({ invalid_type_error: 'Digite um valor' })
      .positive('Valor deve ser maior que zero'),
    discriminacao: z.string()
      .min(10, 'Descreva o serviço com mais detalhes')
      .max(2000, 'Descrição muito longa'),
    itemListaServico: z.string().optional(),
    issRetido: z.boolean().default(false),
  }),
});

type EmissaoForm = z.infer<typeof emissaoSchema>;

// ===================
// COMPONENTE
// ===================

export default function EmitirPage() {
  const empresa = useEmpresa();
  const [loading, setLoading] = useState(false);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [enviarParaTomador, setEnviarParaTomador] = useState(false);
  const [resultado, setResultado] = useState<{
    success: boolean;
    numeroNfse?: number;
    codigoVerificacao?: string;
    error?: string;
  } | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors },
  } = useForm<EmissaoForm>({
    resolver: zodResolver(emissaoSchema),
    defaultValues: {
      servico: {
        issRetido: false,
      },
    },
  });

  const valorServicos = watch('servico.valorServicos') || 0;
  const issRetido = watch('servico.issRetido');

  // Cálculo de impostos em tempo real
  const impostos = calcularImpostos(
    valorServicos,
    empresa?.regimeTributario || 'SIMPLES_NACIONAL',
    empresa?.aliquotaIss || 0.05,
    issRetido
  );

  // Formata CPF/CNPJ enquanto digita
  const handleCpfCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length <= 11) {
      value = value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    } else {
      value = value.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    setValue('tomador.cpfCnpj', value);
  };

  // Auto-fill CNPJ via BrasilAPI
  const handleCnpjBlur = async () => {
    const digits = watch('tomador.cpfCnpj')?.replace(/\D/g, '') || '';
    if (digits.length !== 14) return;
    setCnpjLoading(true);
    const data = await fetchCnpj(digits);
    setCnpjLoading(false);
    if (data) {
      setValue('tomador.razaoSocial', data.razao_social);
      if (data.email) setValue('tomador.email', data.email);
      if (data.telefone) setValue('tomador.telefone', data.telefone);
      if (data.cep) {
        setValue('tomador.endereco.cep', data.cep);
        setValue('tomador.endereco.logradouro', data.logradouro);
        setValue('tomador.endereco.numero', data.numero);
        setValue('tomador.endereco.complemento', data.complemento);
        setValue('tomador.endereco.bairro', data.bairro);
        setValue('tomador.endereco.uf', data.uf);
      }
    }
  };

  // Auto-fill CEP via BrasilAPI
  const handleCepBlur = async () => {
    const digits = watch('tomador.endereco.cep')?.replace(/\D/g, '') || '';
    if (digits.length !== 8) return;
    setCepLoading(true);
    const data = await fetchCep(digits);
    setCepLoading(false);
    if (data) {
      setValue('tomador.endereco.logradouro', data.street);
      setValue('tomador.endereco.bairro', data.neighborhood);
      setValue('tomador.endereco.uf', data.state);
    }
  };

  const onSubmit = async (data: EmissaoForm) => {
    if (!empresa?.id) {
      toast.error('Selecione uma empresa');
      return;
    }

    setLoading(true);
    setResultado(null);

    try {
      const response = await fetch('/api/nfse/emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresaId: empresa.id,
          tomador: {
            cpfCnpj: data.tomador.cpfCnpj.replace(/\D/g, ''),
            razaoSocial: data.tomador.razaoSocial,
            email: data.tomador.email || undefined,
            telefone: data.tomador.telefone,
            endereco: data.tomador.endereco,
          },
          servico: {
            valorServicos: data.servico.valorServicos,
            discriminacao: data.servico.discriminacao,
            itemListaServico: data.servico.itemListaServico,
            issRetido: data.servico.issRetido,
          },
          enviarParaTomador,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setResultado({
          success: true,
          numeroNfse: result.data.numeroNfse,
          codigoVerificacao: result.data.codigoVerificacao,
        });
        toast.success(`NFSe ${result.data.numeroNfse} emitida com sucesso!`);
        reset();
      } else {
        setResultado({
          success: false,
          error: result.error || 'Erro ao emitir nota',
        });
        toast.error(result.error || 'Erro ao emitir nota');
      }
    } catch (error) {
      setResultado({
        success: false,
        error: 'Erro de conexão',
      });
      toast.error('Erro de conexão com o servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Emitir NFSe</h1>
          <p className="mt-1 text-gray-500">
            Preencha os dados para emitir uma nova nota fiscal
          </p>
        </div>

        {/* Resultado */}
        {resultado && (
          <div
            className={`flex items-start gap-3 rounded-lg border p-4 ${
              resultado.success
                ? 'border-green-200 bg-green-50'
                : 'border-red-200 bg-red-50'
            }`}
          >
            {resultado.success ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium text-green-800">
                    NFSe {resultado.numeroNfse} emitida com sucesso!
                  </p>
                  <p className="mt-1 text-sm text-green-700">
                    Código de verificação: {resultado.codigoVerificacao}
                  </p>
                </div>
              </>
            ) : (
              <>
                <AlertCircle className="h-5 w-5 text-red-600" />
                <div>
                  <p className="font-medium text-red-800">Erro na emissão</p>
                  <p className="mt-1 text-sm text-red-700">{resultado.error}</p>
                </div>
              </>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Tomador */}
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <User className="h-5 w-5 text-gray-500" />
              <h2 className="font-semibold text-gray-900">
                Dados do Tomador
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {/* CPF/CNPJ */}
              <div>
                <label className="label">CPF/CNPJ *</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="000.000.000-00"
                    className={`input ${errors.tomador?.cpfCnpj ? 'input-error' : ''}`}
                    {...register('tomador.cpfCnpj')}
                    onChange={handleCpfCnpjChange}
                    onBlur={handleCnpjBlur}
                    maxLength={18}
                  />
                  {cnpjLoading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary-600" />
                    </div>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-gray-400">CNPJ preenche automaticamente via BrasilAPI</p>
                {errors.tomador?.cpfCnpj && (
                  <p className="error-text">{errors.tomador.cpfCnpj.message}</p>
                )}
              </div>

              {/* Razão Social */}
              <div>
                <label className="label">Nome/Razão Social *</label>
                <input
                  type="text"
                  placeholder="Nome completo ou razão social"
                  className={`input ${errors.tomador?.razaoSocial ? 'input-error' : ''}`}
                  {...register('tomador.razaoSocial')}
                />
                {errors.tomador?.razaoSocial && (
                  <p className="error-text">{errors.tomador.razaoSocial.message}</p>
                )}
              </div>

              {/* Email */}
              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  placeholder="email@exemplo.com"
                  className={`input ${errors.tomador?.email ? 'input-error' : ''}`}
                  {...register('tomador.email')}
                />
                {errors.tomador?.email && (
                  <p className="error-text">{errors.tomador.email.message}</p>
                )}
              </div>

              {/* Telefone */}
              <div>
                <label className="label">Telefone</label>
                <input
                  type="tel"
                  placeholder="(00) 00000-0000"
                  className="input"
                  {...register('tomador.telefone')}
                />
              </div>

              {/* CEP */}
              <div>
                <label className="label">CEP</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="00000-000"
                    className="input"
                    {...register('tomador.endereco.cep')}
                    onBlur={handleCepBlur}
                    maxLength={9}
                  />
                  {cepLoading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary-600" />
                    </div>
                  )}
                </div>
              </div>

              {/* Logradouro */}
              <div>
                <label className="label">Logradouro</label>
                <input type="text" placeholder="Rua, Avenida..." className="input"
                  {...register('tomador.endereco.logradouro')} />
              </div>

              {/* Número */}
              <div>
                <label className="label">Número</label>
                <input type="text" placeholder="Nº" className="input"
                  {...register('tomador.endereco.numero')} />
              </div>

              {/* Bairro */}
              <div>
                <label className="label">Bairro</label>
                <input type="text" placeholder="Bairro" className="input"
                  {...register('tomador.endereco.bairro')} />
              </div>

              {/* Enviar para tomador */}
              <div className="md:col-span-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={enviarParaTomador}
                    onChange={e => setEnviarParaTomador(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600"
                  />
                  <span className="text-sm text-gray-700">
                    Enviar nota automaticamente para o email do tomador
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Serviço */}
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-gray-500" />
              <h2 className="font-semibold text-gray-900">
                Dados do Serviço
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {/* Valor */}
              <div>
                <label className="label">Valor dos Serviços *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                    R$
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0,00"
                    className={`input pl-10 ${errors.servico?.valorServicos ? 'input-error' : ''}`}
                    {...register('servico.valorServicos', { valueAsNumber: true })}
                  />
                </div>
                {errors.servico?.valorServicos && (
                  <p className="error-text">{errors.servico.valorServicos.message}</p>
                )}
              </div>

              {/* Item Lista Serviço */}
              <div>
                <label className="label">Item da Lista de Serviços</label>
                <input
                  type="text"
                  placeholder="Ex: 01.07"
                  className="input"
                  {...register('servico.itemListaServico')}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Deixe em branco para usar o padrão da empresa
                </p>
              </div>

              {/* ISS Retido */}
              <div className="md:col-span-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-primary-600"
                    {...register('servico.issRetido')}
                  />
                  <span className="text-sm text-gray-700">
                    ISS retido na fonte pelo tomador
                  </span>
                </label>
              </div>

              {/* Discriminação */}
              <div className="md:col-span-2">
                <label className="label">Discriminação dos Serviços *</label>
                <textarea
                  rows={4}
                  placeholder="Descreva detalhadamente os serviços prestados..."
                  className={`input resize-none ${errors.servico?.discriminacao ? 'input-error' : ''}`}
                  {...register('servico.discriminacao')}
                />
                {errors.servico?.discriminacao && (
                  <p className="error-text">{errors.servico.discriminacao.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Preview de Impostos */}
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-gray-500" />
              <h2 className="font-semibold text-gray-900">
                Resumo dos Valores
              </h2>
            </div>

            <div className="grid gap-3 text-sm md:grid-cols-2">
              <div className="flex justify-between rounded-lg bg-gray-50 px-4 py-2">
                <span className="text-gray-600">Valor dos Serviços</span>
                <span className="font-medium">{formatCurrency(valorServicos)}</span>
              </div>
              <div className="flex justify-between rounded-lg bg-gray-50 px-4 py-2">
                <span className="text-gray-600">
                  ISS ({(empresa?.aliquotaIss || 0.05) * 100}%)
                  {issRetido && ' - Retido'}
                </span>
                <span className="font-medium">{formatCurrency(impostos.valorIss)}</span>
              </div>
              {empresa?.regimeTributario !== 'SIMPLES_NACIONAL' && (
                <>
                  <div className="flex justify-between rounded-lg bg-gray-50 px-4 py-2">
                    <span className="text-gray-600">PIS</span>
                    <span className="font-medium">{formatCurrency(impostos.valorPis)}</span>
                  </div>
                  <div className="flex justify-between rounded-lg bg-gray-50 px-4 py-2">
                    <span className="text-gray-600">COFINS</span>
                    <span className="font-medium">{formatCurrency(impostos.valorCofins)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between rounded-lg bg-primary-50 px-4 py-3 md:col-span-2">
                <span className="font-medium text-primary-900">Valor Líquido</span>
                <span className="text-lg font-bold text-primary-600">
                  {formatCurrency(impostos.valorLiquido)}
                </span>
              </div>
            </div>
          </div>

          {/* Botão */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary px-8 py-3"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Emitindo...
                </>
              ) : (
                <>
                  <Send className="h-5 w-5" />
                  Emitir NFSe
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
