import { NextResponse } from 'next/server';
import { createServerSupabaseClient, getServiceRoleKey } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { encryptPassword } from '@/services/xml-signer';
import * as forge from 'node-forge';

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getServiceRoleKey(),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * POST /api/certificado
 * Upload e armazenamento de certificado digital A1 (PFX/PKCS#12)
 */
export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    return NextResponse.json({ error: 'Chave de criptografia não configurada no servidor. Defina ENCRYPTION_KEY.' }, { status: 500 });
  }

  let body: { empresaId: string; certificado: string; senha: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const { empresaId, certificado, senha } = body;

  if (!empresaId || !certificado || !senha) {
    return NextResponse.json({ error: 'empresaId, certificado (base64) e senha são obrigatórios' }, { status: 400 });
  }

  // Verifica permissão na empresa
  const { data: perfil } = await supabase
    .from('perfis_usuarios')
    .select('role')
    .eq('user_id', user.id)
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .single();

  const { data: empresaOwner } = await supabase
    .from('empresas')
    .select('user_id')
    .eq('id', empresaId)
    .single();

  if (!perfil && empresaOwner?.user_id !== user.id) {
    return NextResponse.json({ error: 'Sem permissão para esta empresa' }, { status: 403 });
  }

  // Valida o certificado PFX
  let subject = '';
  let serialNumber = '';
  let validade: Date;

  try {
    const pfxBuffer = Buffer.from(certificado, 'base64');
    const pfxAsn1 = forge.asn1.fromDer(forge.util.createBuffer(pfxBuffer));
    const pfx = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, false, senha);

    // Extrai o certificado
    const certBags = pfx.getBags({ bagType: forge.pki.oids.certBag });
    const certBag = certBags[forge.pki.oids.certBag];

    if (!certBag || certBag.length === 0) {
      return NextResponse.json({ error: 'Certificado não encontrado no arquivo PFX' }, { status: 400 });
    }

    const cert = certBag[0].cert;
    if (!cert) {
      return NextResponse.json({ error: 'Certificado inválido' }, { status: 400 });
    }

    // Extrai dados do certificado
    subject = cert.subject.getField('CN')?.value || 'Desconhecido';
    serialNumber = cert.serialNumber || '';
    validade = cert.validity.notAfter;

    // Verifica se não está expirado
    if (validade < new Date()) {
      return NextResponse.json({ error: `Certificado expirado em ${validade.toLocaleDateString('pt-BR')}` }, { status: 400 });
    }

    // Verifica se tem chave privada
    const keyBags = pfx.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag];
    if (!keyBag || keyBag.length === 0) {
      return NextResponse.json({ error: 'Chave privada não encontrada no certificado' }, { status: 400 });
    }

  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erro desconhecido';
    if (msg.includes('Invalid password') || msg.includes('PKCS#12')) {
      return NextResponse.json({ error: 'Senha do certificado incorreta' }, { status: 400 });
    }
    return NextResponse.json({ error: `Erro ao processar certificado: ${msg}` }, { status: 400 });
  }

  // Criptografa a senha para armazenamento seguro
  const senhaEncrypted = encryptPassword(senha, encryptionKey);

  const admin = getAdminClient();

  // Desativa certificados anteriores da mesma empresa
  await admin
    .from('certificados')
    .update({ ativo: false })
    .eq('empresa_id', empresaId);

  // Insere novo certificado
  const { data: novoCert, error: insertError } = await admin
    .from('certificados')
    .insert({
      empresa_id: empresaId,
      pfx_data: certificado,
      pfx_password_encrypted: senhaEncrypted,
      ativo: true,
      validade: validade!.toISOString(),
      subject,
      serial_number: serialNumber,
    })
    .select('id, subject, validade')
    .single();

  if (insertError) {
    return NextResponse.json({ error: `Erro ao salvar certificado: ${insertError.message}` }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    certificado: {
      id: novoCert.id,
      subject: novoCert.subject,
      validade: novoCert.validade,
    },
    message: `Certificado "${subject}" salvo com sucesso. Válido até ${validade!.toLocaleDateString('pt-BR')}.`,
  });
}

/**
 * GET /api/certificado?empresaId=xxx
 * Retorna dados do certificado ativo (sem dados sensíveis)
 */
export async function GET(request: Request) {
  const supabase = createServerSupabaseClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const empresaId = searchParams.get('empresaId');

  if (!empresaId) {
    return NextResponse.json({ error: 'empresaId obrigatório' }, { status: 400 });
  }

  const { data: cert } = await supabase
    .from('certificados')
    .select('id, ativo, validade, subject, serial_number, created_at')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .single();

  return NextResponse.json({ certificado: cert || null });
}
