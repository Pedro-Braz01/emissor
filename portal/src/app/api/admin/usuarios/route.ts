import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const MASTER_EMAIL = 'pedro.souza53321+dev@gmail.com';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

async function getAdminInfo(supabase: ReturnType<typeof createServerSupabaseClient>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const email = user.email || '';
  const allAdmins = ADMIN_EMAILS.length > 0 ? ADMIN_EMAILS : [MASTER_EMAIL];
  if (!allAdmins.includes(email)) return null;
  return { id: user.id, email, isMaster: email === MASTER_EMAIL };
}

// GET - List all users with their perfis_usuarios and linked empresas
export async function GET() {
  const supabase = createServerSupabaseClient();
  const adminInfo = await getAdminInfo(supabase);
  if (!adminInfo) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const admin = getAdminClient();

  // Get all users from auth.users via admin API
  const { data: authData, error: authError } = await admin.auth.admin.listUsers();
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  const users = authData?.users || [];

  // Get all perfis with empresa info
  const { data: perfis, error: perfisError } = await admin
    .from('perfis_usuarios')
    .select(`
      user_id,
      empresa_id,
      role,
      ativo,
      empresas (
        razao_social
      )
    `);

  if (perfisError) {
    return NextResponse.json({ error: perfisError.message }, { status: 500 });
  }

  // Build a map: user_id -> perfis[]
  const perfisMap: Record<string, Array<{
    empresa_id: string;
    razao_social: string;
    role: string;
    ativo: boolean;
  }>> = {};

  for (const p of (perfis || [])) {
    if (!perfisMap[p.user_id]) perfisMap[p.user_id] = [];
    perfisMap[p.user_id].push({
      empresa_id: p.empresa_id,
      razao_social: (p.empresas as any)?.razao_social || '',
      role: p.role,
      ativo: p.ativo,
    });
  }

  const usuarios = users.map(u => ({
    id: u.id,
    email: u.email,
    created_at: u.created_at,
    perfis: perfisMap[u.id] || [],
  }));

  return NextResponse.json({ usuarios });
}

// POST - Create new user + link to empresa(s)
export async function POST(request: Request) {
  const supabase = createServerSupabaseClient();
  const adminInfo = await getAdminInfo(supabase);
  if (!adminInfo) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const body = await request.json();
  const { email, senha, perfis } = body;

  if (!email || !senha) {
    return NextResponse.json({ error: 'email e senha obrigatorios' }, { status: 400 });
  }

  if (!perfis || !Array.isArray(perfis) || perfis.length === 0) {
    return NextResponse.json({ error: 'Pelo menos um perfil (empresa_id + role) e obrigatorio' }, { status: 400 });
  }

  // Staff cannot assign super_admin role
  if (!adminInfo.isMaster) {
    const hasSuperAdmin = perfis.some((p: any) => p.role === 'super_admin');
    if (hasSuperAdmin) {
      return NextResponse.json({ error: 'Apenas master pode atribuir role super_admin' }, { status: 403 });
    }
  }

  const admin = getAdminClient();

  // Create user via admin API
  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 500 });
  }

  const userId = newUser.user.id;

  // Create perfis_usuarios entries
  const perfilRows = perfis.map((p: any) => ({
    user_id: userId,
    empresa_id: p.empresa_id,
    role: p.role || 'emissor',
    ativo: true,
  }));

  const { error: perfilError } = await admin
    .from('perfis_usuarios')
    .insert(perfilRows);

  if (perfilError) {
    // User was created but perfis failed - still return the user with error info
    return NextResponse.json({
      warning: 'Usuario criado mas erro ao vincular perfis: ' + perfilError.message,
      user_id: userId,
    }, { status: 207 });
  }

  return NextResponse.json({ user_id: userId, email }, { status: 201 });
}
