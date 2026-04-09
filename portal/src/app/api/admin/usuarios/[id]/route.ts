import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient, getServiceRoleKey } from '@/lib/supabase-server';

const MASTER_EMAIL = 'pedro.souza53321+dev@gmail.com';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getServiceRoleKey(),
    { auth: { autoRefreshToken: false, persistSession: false } }
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

// PATCH - Update user (password reset, perfis update)
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient();
  const adminInfo = await getAdminInfo(supabase);
  if (!adminInfo) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const { id: userId } = params;
  const body = await request.json();
  const { senha, perfis } = body;
  const admin = getAdminClient();

  // Password reset - ONLY master
  if (senha) {
    if (!adminInfo.isMaster) {
      return NextResponse.json({ error: 'Apenas master pode resetar senha' }, { status: 403 });
    }

    const { error: pwError } = await admin.auth.admin.updateUserById(userId, {
      password: senha,
    });

    if (pwError) {
      return NextResponse.json({ error: pwError.message }, { status: 500 });
    }
  }

  // Perfis update
  if (perfis && Array.isArray(perfis)) {
    // Staff cannot assign super_admin role
    if (!adminInfo.isMaster) {
      const hasSuperAdmin = perfis.some((p: any) => p.role === 'super_admin');
      if (hasSuperAdmin) {
        return NextResponse.json({ error: 'Apenas master pode atribuir role super_admin' }, { status: 403 });
      }
    }

    // Get existing perfis for this user
    const { data: existingPerfis } = await admin
      .from('perfis_usuarios')
      .select('id, empresa_id, role')
      .eq('user_id', userId);

    const existingMap = new Map(
      (existingPerfis || []).map(p => [p.empresa_id, p])
    );

    for (const p of perfis) {
      const existing = existingMap.get(p.empresa_id);

      if (existing) {
        // Update existing perfil
        const updatePayload: Record<string, unknown> = {};
        if (p.role !== undefined) updatePayload.role = p.role;
        if (p.ativo !== undefined) updatePayload.ativo = p.ativo;

        if (Object.keys(updatePayload).length > 0) {
          // Staff cannot change role to super_admin
          if (!adminInfo.isMaster && updatePayload.role === 'super_admin') {
            continue;
          }

          const { error } = await admin
            .from('perfis_usuarios')
            .update(updatePayload)
            .eq('id', existing.id);

          if (error) {
            return NextResponse.json({ error: 'Erro ao atualizar perfil: ' + error.message }, { status: 500 });
          }
        }
      } else {
        // Insert new perfil
        const { error } = await admin
          .from('perfis_usuarios')
          .insert({
            user_id: userId,
            empresa_id: p.empresa_id,
            role: p.role || 'emissor',
            ativo: p.ativo !== undefined ? p.ativo : true,
          });

        if (error) {
          return NextResponse.json({ error: 'Erro ao criar perfil: ' + error.message }, { status: 500 });
        }
      }
    }
  }

  return NextResponse.json({ success: true });
}

// DELETE - Remove user completely. ONLY master.
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createServerSupabaseClient();
  const adminInfo = await getAdminInfo(supabase);
  if (!adminInfo) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  if (!adminInfo.isMaster) {
    return NextResponse.json({ error: 'Apenas master pode excluir usuarios' }, { status: 403 });
  }

  const { id: userId } = params;

  if (!userId || userId === adminInfo.id) {
    return NextResponse.json({ error: 'Operação inválida' }, { status: 400 });
  }

  const admin = getAdminClient();

  // 1. Remove todos os perfis do usuário (hard delete para limpar relações)
  const { error: perfisDeleteError } = await admin
    .from('perfis_usuarios')
    .delete()
    .eq('user_id', userId);

  if (perfisDeleteError) {
    console.error('Erro ao remover perfis:', perfisDeleteError);
    // Continua tentando remover o auth user mesmo se perfis falhar
  }

  // 2. Remove o usuário do Supabase Auth definitivamente
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);

  if (deleteError) {
    // Se falhou ao deletar do auth, tenta pelo menos desativar perfis
    await admin
      .from('perfis_usuarios')
      .update({ ativo: false })
      .eq('user_id', userId);

    return NextResponse.json({
      error: 'Erro ao excluir usuario do auth: ' + deleteError.message,
      partial: true,
      message: 'Perfis foram removidos/desativados, mas o usuario auth permanece.'
    }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: 'Usuario excluido com sucesso' });
}
