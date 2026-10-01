import { prisma } from '../../db/prisma.js';

export async function inicio(req, res) {
  const [publicados, rascunhos, enviosNovos] = await Promise.all([
    prisma.local.count({ where: { publicado: true, arquivadoEm: null } }),
    prisma.local.count({ where: { publicado: false, arquivadoEm: null } }),
    prisma.envio.count({ where: { status: 'NOVO' } }),
  ]);
  res.render('painel/inicio', { title: 'Painel', publicados, rascunhos, enviosNovos });
}
