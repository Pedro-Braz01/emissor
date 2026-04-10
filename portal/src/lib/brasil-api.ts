export interface CnpjData {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  telefone: string;
  email: string;
}

export interface CepData {
  cep: string;
  state: string;
  city: string;
  neighborhood: string;
  street: string;
  cityIbge: string;
}

export async function fetchCnpj(cnpj: string): Promise<CnpjData | null> {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return null;

  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      cnpj: data.cnpj,
      razao_social: data.razao_social || '',
      nome_fantasia: data.nome_fantasia || '',
      logradouro: data.logradouro || '',
      numero: data.numero || '',
      complemento: data.complemento || '',
      bairro: data.bairro || '',
      municipio: data.municipio || '',
      uf: data.uf || '',
      cep: data.cep || '',
      telefone: data.ddd_telefone_1 || '',
      email: data.email || '',
    };
  } catch {
    return null;
  }
}

export async function fetchCep(cep: string): Promise<CepData | null> {
  const digits = cep.replace(/\D/g, '');
  if (digits.length !== 8) return null;

  try {
    const res = await fetch(`https://brasilapi.com.br/api/cep/v2/${digits}`);
    if (!res.ok) return null;
    const data = await res.json();
    return {
      cep: data.cep,
      state: data.state || '',
      city: data.city || '',
      neighborhood: data.neighborhood || '',
      street: data.street || '',
      cityIbge: data.city_ibge ? String(data.city_ibge) : '',
    };
  } catch {
    return null;
  }
}
