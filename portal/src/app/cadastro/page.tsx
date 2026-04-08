'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClientSupabaseClient } from '@/lib/supabase-client';
import { fetchCnpj, fetchCep } from '@/lib/brasil-api';
import { validateCnpj } from '@/lib/utils';

type Step = 'dados' | 'endereco' | 'confirmacao';

export default function CadastroPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('dados');
  const [loading, setLoading] = useState(false);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Form fields
  const [cnpj, setCnpj] = useState('');
  const [razaoSocial, setRazaoSocial] = useState('');
  const [nomeFantasia, setNomeFantasia] = useState('');
  const [inscricaoMunicipal, setInscricaoMunicipal] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');

  // Endereço
  const [cep, setCep] = useState('');
  const [logradouro, setLogradouro] = useState('');
  const [numero, setNumero] = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');

  const [regimeTributario, setRegimeTributario] = useState('simples_nacional');

  // Auto-fill CNPJ via BrasilAPI
  async function handleCnpjBlur() {
    const digits = cnpj.replace(/\D/g, '');
    if (digits.length !== 14) return;
    if (!validateCnpj(digits)) {
      setError('CNPJ inválido.');
      return;
    }
    setError('');
    setCnpjLoading(true);
    const data = await fetchCnpj(digits);
    setCnpjLoading(false);

    if (data) {
      setRazaoSocial(data.razao_social);
      setNomeFantasia(data.nome_fantasia);
      if (data.telefone) setTelefone(data.telefone);
      if (data.email) setEmail(data.email);
      if (data.cep) {
        setCep(data.cep);
        setLogradouro(data.logradouro);
        setNumero(data.numero);
        setComplemento(data.complemento);
        setBairro(data.bairro);
        setCidade(data.municipio);
        setUf(data.uf);
      }
    }
  }

  // Auto-fill CEP via BrasilAPI
  async function handleCepBlur() {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) return;
    setCepLoading(true);
    const data = await fetchCep(digits);
    setCepLoading(false);
    if (data) {
      setLogradouro(data.street);
      setBairro(data.neighborhood);
      setCidade(data.city);
      setUf(data.state);
    }
  }

  // Format CNPJ as user types
  function handleCnpjChange(value: string) {
    let digits = value.replace(/\D/g, '').slice(0, 14);
    if (digits.length > 12) {
      digits = digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, '$1.$2.$3/$4-$5');
    } else if (digits.length > 8) {
      digits = digits.replace(/(\d{2})(\d{3})(\d{3})(\d{0,4})/, '$1.$2.$3/$4');
    } else if (digits.length > 5) {
      digits = digits.replace(/(\d{2})(\d{3})(\d{0,3})/, '$1.$2.$3');
    } else if (digits.length > 2) {
      digits = digits.replace(/(\d{2})(\d{0,3})/, '$1.$2');
    }
    setCnpj(digits);
  }

  function handleCepChange(value: string) {
    let digits = value.replace(/\D/g, '').slice(0, 8);
    if (digits.length > 5) {
      digits = digits.replace(/(\d{5})(\d{0,3})/, '$1-$2');
    }
    setCep(digits);
  }

  function validateStep1(): boolean {
    if (!cnpj || cnpj.replace(/\D/g, '').length !== 14) {
      setError('Informe um CNPJ válido.');
      return false;
    }
    if (!validateCnpj(cnpj.replace(/\D/g, ''))) {
      setError('CNPJ inválido.');
      return false;
    }
    if (!razaoSocial || razaoSocial.length < 3) {
      setError('Informe a razão social.');
      return false;
    }
    if (!inscricaoMunicipal) {
      setError('Informe a inscrição municipal.');
      return false;
    }
    if (!email) {
      setError('Informe o e-mail.');
      return false;
    }
    if (senha.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return false;
    }
    if (senha !== confirmarSenha) {
      setError('As senhas não conferem.');
      return false;
    }
    setError('');
    return true;
  }

  async function handleSubmit() {
    setLoading(true);
    setError('');

    const endereco = [logradouro, numero, complemento, bairro, cidade, uf]
      .filter(Boolean)
      .join(', ');

    // Tudo via API server-side com service_role — evita RLS bloqueando
    // usuário sem sessão ativa (email confirmation pendente)
    try {
      const res = await fetch('/api/cadastro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          senha,
          cnpj,
          razao_social: razaoSocial,
          nome_fantasia: nomeFantasia || null,
          inscricao_municipal: inscricaoMunicipal,
          regime_tributario: regimeTributario,
          telefone: telefone || null,
          endereco_completo: endereco || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Erro ao realizar cadastro.');
        setLoading(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError('Erro de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-xl">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-500/10 rounded-full mb-4">
              <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Cadastro realizado!</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-2">
              Sua empresa foi cadastrada com sucesso.
            </p>
            <div className="bg-yellow-100 dark:bg-yellow-500/10 border border-yellow-300 dark:border-yellow-500/30 rounded-lg p-3 mb-6">
              <p className="text-yellow-600 dark:text-yellow-400 text-sm">
                Sua licença será ativada após a confirmação do pagamento.
                Entraremos em contato pelo e-mail informado.
              </p>
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-xs mb-4">
              Verifique seu e-mail para confirmar a conta.
            </p>
            <Link
              href="/login"
              className="inline-block w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors"
            >
              Ir para o Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Cadastrar Empresa</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{'Emissor NFSe - Ribeirão Preto'}</p>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {(['dados', 'endereco', 'confirmacao'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                ${step === s ? 'bg-blue-600 text-white' :
                  ((['dados', 'endereco', 'confirmacao'].indexOf(step) > i) ? 'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400' : 'bg-gray-200 dark:bg-gray-700 text-gray-500')}`}>
                {['dados', 'endereco', 'confirmacao'].indexOf(step) > i ? '\u2713' : i + 1}
              </div>
              {i < 2 && <div className="w-8 h-0.5 bg-gray-200 dark:bg-gray-700" />}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-xl">
          {error && (
            <div className="bg-red-100 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 rounded-lg p-3 mb-5">
              <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Step 1: Dados da Empresa */}
          {step === 'dados' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Dados da Empresa</h2>

              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">CNPJ *</label>
                <div className="relative">
                  <input
                    type="text"
                    value={cnpj}
                    onChange={e => handleCnpjChange(e.target.value)}
                    onBlur={handleCnpjBlur}
                    placeholder="00.000.000/0001-00"
                    maxLength={18}
                    className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  />
                  {cnpjLoading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{'Os dados serão preenchidos automaticamente'}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">{'Razão Social *'}</label>
                  <input type="text" value={razaoSocial} onChange={e => setRazaoSocial(e.target.value)}
                    placeholder={'Razão Social da Empresa'}
                    className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Nome Fantasia</label>
                  <input type="text" value={nomeFantasia} onChange={e => setNomeFantasia(e.target.value)}
                    placeholder="Nome Fantasia"
                    className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">{'Inscrição Municipal *'}</label>
                  <input type="text" value={inscricaoMunicipal} onChange={e => setInscricaoMunicipal(e.target.value)}
                    placeholder={'Número da IM'}
                    className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">{'Regime Tributário *'}</label>
                  <select value={regimeTributario} onChange={e => setRegimeTributario(e.target.value)}
                    className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all">
                    <option value="simples_nacional">Simples Nacional</option>
                    <option value="lucro_presumido">Lucro Presumido</option>
                    <option value="lucro_real">Lucro Real</option>
                  </select>
                </div>
              </div>

              <hr className="border-gray-200 dark:border-gray-700" />
              <h3 className="text-sm font-medium text-gray-600 dark:text-gray-300">Dados de Acesso</h3>

              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">E-mail *</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Telefone</label>
                <input type="tel" value={telefone} onChange={e => setTelefone(e.target.value)}
                  placeholder="(00) 00000-0000"
                  className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500
                             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Senha *</label>
                  <input type="password" value={senha} onChange={e => setSenha(e.target.value)}
                    placeholder={'Mínimo 6 caracteres'}
                    className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Confirmar Senha *</label>
                  <input type="password" value={confirmarSenha} onChange={e => setConfirmarSenha(e.target.value)}
                    placeholder="Repita a senha"
                    className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
                </div>
              </div>

              <button
                onClick={() => { if (validateStep1()) setStep('endereco'); }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors mt-2"
              >
                {'Próximo: Endereço'}
              </button>
            </div>
          )}

          {/* Step 2: Endereço */}
          {step === 'endereco' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{'Endereço'}</h2>

              <div>
                <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">CEP</label>
                <div className="relative">
                  <input type="text" value={cep}
                    onChange={e => handleCepChange(e.target.value)}
                    onBlur={handleCepBlur}
                    placeholder="00000-000" maxLength={9}
                    className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
                  {cepLoading && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{'O endereço será preenchido automaticamente'}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Logradouro</label>
                  <input type="text" value={logradouro} onChange={e => setLogradouro(e.target.value)}
                    placeholder="Rua, Avenida..."
                    className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">{'Número'}</label>
                  <input type="text" value={numero} onChange={e => setNumero(e.target.value)}
                    placeholder={'Nº'}
                    className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Complemento</label>
                  <input type="text" value={complemento} onChange={e => setComplemento(e.target.value)}
                    placeholder="Sala, Andar..."
                    className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Bairro</label>
                  <input type="text" value={bairro} onChange={e => setBairro(e.target.value)}
                    placeholder="Bairro"
                    className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Cidade</label>
                  <input type="text" value={cidade} onChange={e => setCidade(e.target.value)}
                    placeholder="Cidade"
                    className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">UF</label>
                  <input type="text" value={uf} onChange={e => setUf(e.target.value)}
                    placeholder="SP" maxLength={2}
                    className="w-full bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500
                               focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
                </div>
              </div>

              <div className="flex gap-3 mt-2">
                <button onClick={() => setStep('dados')}
                  className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium py-2.5 rounded-lg transition-colors">
                  Voltar
                </button>
                <button onClick={() => setStep('confirmacao')}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors">
                  {'Próximo: Confirmar'}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Confirmação */}
          {step === 'confirmacao' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Confirmar Dados</h2>

              <div className="space-y-3 text-sm">
                <InfoRow label="CNPJ" value={cnpj} />
                <InfoRow label={'Razão Social'} value={razaoSocial} />
                {nomeFantasia && <InfoRow label="Nome Fantasia" value={nomeFantasia} />}
                <InfoRow label={'Inscrição Municipal'} value={inscricaoMunicipal} />
                <InfoRow label="Regime" value={regimeTributario.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} />
                <InfoRow label="E-mail" value={email} />
                {telefone && <InfoRow label="Telefone" value={telefone} />}
                {logradouro && <InfoRow label={'Endereço'} value={`${logradouro}, ${numero} ${complemento ? `- ${complemento}` : ''} - ${bairro}, ${cidade}/${uf} - CEP: ${cep}`} />}
              </div>

              <div className="bg-yellow-100 dark:bg-yellow-500/10 border border-yellow-300 dark:border-yellow-500/30 rounded-lg p-3">
                <p className="text-yellow-600 dark:text-yellow-400 text-sm">
                  {'Após o cadastro, sua licença ficará '}
                  <strong>pendente</strong>
                  {' até a confirmação do pagamento.'}
                </p>
              </div>

              <div className="flex gap-3 mt-2">
                <button onClick={() => setStep('endereco')}
                  className="flex-1 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium py-2.5 rounded-lg transition-colors">
                  Voltar
                </button>
                <button onClick={handleSubmit} disabled={loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg transition-colors">
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Cadastrando...
                    </span>
                  ) : 'Finalizar Cadastro'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="text-center mt-6">
          <Link href="/login" className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm transition-colors">
            {'Já tem conta? Faça login'}
          </Link>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-gray-900 dark:text-white font-medium text-right max-w-[60%] truncate">{value}</span>
    </div>
  );
}
