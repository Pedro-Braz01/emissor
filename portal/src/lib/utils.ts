import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// ===================
// CLASSES CSS
// ===================

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ===================
// FORMATAÇÃO
// ===================

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatNumber(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('pt-BR');
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('pt-BR');
}

export function formatCpfCnpj(value: string): string {
  const digits = value.replace(/\D/g, '');
  
  if (digits.length === 11) {
    // CPF: 000.000.000-00
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  } else if (digits.length === 14) {
    // CNPJ: 00.000.000/0000-00
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  
  return value;
}

export function formatCep(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.replace(/(\d{5})(\d{3})/, '$1-$2');
}

export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  
  if (digits.length === 11) {
    return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  } else if (digits.length === 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }
  
  return value;
}

// ===================
// VALIDAÇÃO
// ===================

export function validateCpf(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  
  if (digits.length !== 11) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits[i]) * (10 - i);
  }
  let digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;
  if (digit !== parseInt(digits[9])) return false;
  
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits[i]) * (11 - i);
  }
  digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;
  if (digit !== parseInt(digits[10])) return false;
  
  return true;
}

export function validateCnpj(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, '');
  
  if (digits.length !== 14) return false;
  if (/^(\d)\1+$/.test(digits)) return false;
  
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(digits[i]) * weights1[i];
  }
  let digit = sum % 11;
  digit = digit < 2 ? 0 : 11 - digit;
  if (digit !== parseInt(digits[12])) return false;
  
  sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += parseInt(digits[i]) * weights2[i];
  }
  digit = sum % 11;
  digit = digit < 2 ? 0 : 11 - digit;
  if (digit !== parseInt(digits[13])) return false;
  
  return true;
}

export function validateCpfCnpj(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  
  if (digits.length === 11) return validateCpf(value);
  if (digits.length === 14) return validateCnpj(value);
  
  return false;
}

// ===================
// STATUS
// ===================

export const statusColors: Record<string, { bg: string; text: string }> = {
  RASCUNHO: { bg: 'bg-gray-100', text: 'text-gray-700' },
  AGUARDANDO: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  PROCESSANDO: { bg: 'bg-blue-100', text: 'text-blue-700' },
  EMITIDA: { bg: 'bg-green-100', text: 'text-green-700' },
  REJEITADA: { bg: 'bg-red-100', text: 'text-red-700' },
  CANCELADA: { bg: 'bg-gray-100', text: 'text-gray-700' },
  SUBSTITUIDA: { bg: 'bg-orange-100', text: 'text-orange-700' },
  ATIVO: { bg: 'bg-green-100', text: 'text-green-700' },
  BLOQUEADO: { bg: 'bg-red-100', text: 'text-red-700' },
  TRIAL: { bg: 'bg-blue-100', text: 'text-blue-700' },
  EXPIRADO: { bg: 'bg-red-100', text: 'text-red-700' },
};

export const statusLabels: Record<string, string> = {
  RASCUNHO: 'Rascunho',
  AGUARDANDO: 'Aguardando',
  PROCESSANDO: 'Processando',
  EMITIDA: 'Emitida',
  REJEITADA: 'Rejeitada',
  CANCELADA: 'Cancelada',
  SUBSTITUIDA: 'Substituída',
  ATIVO: 'Ativo',
  BLOQUEADO: 'Bloqueado',
  TRIAL: 'Trial',
  EXPIRADO: 'Expirado',
};

// ===================
// CÁLCULOS
// ===================

export function calcularImpostos(
  valorServicos: number,
  regime: string,
  aliquotaIss: number = 0.05,
  issRetido: boolean = false
) {
  // Alíquotas padrão por regime
  const aliquotas = {
    SIMPLES_NACIONAL: {
      pis: 0,
      cofins: 0,
      csll: 0,
      irrf: 0,
    },
    LUCRO_PRESUMIDO: {
      pis: 0.0065,
      cofins: 0.03,
      csll: 0.0288,
      irrf: 0.015,
    },
    LUCRO_REAL: {
      pis: 0.0165,
      cofins: 0.076,
      csll: 0.09,
      irrf: 0.015,
    },
    MEI: {
      pis: 0,
      cofins: 0,
      csll: 0,
      irrf: 0,
    },
  };

  const aliq = aliquotas[regime as keyof typeof aliquotas] || aliquotas.SIMPLES_NACIONAL;

  const valorIss = valorServicos * aliquotaIss;
  const valorPis = valorServicos * aliq.pis;
  const valorCofins = valorServicos * aliq.cofins;
  const valorCsll = valorServicos * aliq.csll;
  const valorIrrf = valorServicos * aliq.irrf;

  const totalRetencoes = valorPis + valorCofins + valorCsll + valorIrrf + (issRetido ? valorIss : 0);
  const valorLiquido = valorServicos - totalRetencoes;

  return {
    valorServicos,
    valorIss,
    valorPis,
    valorCofins,
    valorCsll,
    valorIrrf,
    totalRetencoes,
    valorLiquido,
    aliquotaIss,
    issRetido,
  };
}
