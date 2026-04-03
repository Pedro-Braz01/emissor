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

  const userId = params.id;
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
    if (perfis.length > 20) {
      return NextResponse.json({ error: 'Maximo de 20 empresas por usuario' }, { status: 400 });
    }

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

// DELETE - Deactivate user (set all perfis to ativo=false). ONLY master.
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
    return NextResponse.json({ error: 'Apenas master pode desativar usuarios' }, { status: 403 });
  }

  const userId = params.id;
  const admin = getAdminClient();

  const { error } = await admin
    .from('perfis_usuarios')
    .update({ ativo: false })
    .eq('user_id', userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: 'Todos os perfis do usuario foram desativados' });
}
