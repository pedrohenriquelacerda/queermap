import * as service from '../../services/enviosPainelService.js';
import { z } from '../../utils/validacao.js';

const situacao = z.object({ status: z.enum(service.STATUS) }).strict();
const notas = z.object({ notasInternas: z.string().trim().max(5000) }).strict();

export async function listar(req, res) {
  res.json({ envios: await service.listar() });
}

export async function mostrar(req, res) {
  responder(res, await service.buscar(Number(req.params.id)));
}

export async function ler(req, res) {
  responder(res, await service.alterar(Number(req.params.id), req.admin.id, 'ler'));
}

export async function mudarSituacao(req, res) {
  const resultado = situacao.safeParse(req.body);
  if (!resultado.success) return res.status(400).json({ erro: 'Situação inválida.' });
  responder(
    res,
    await service.alterar(Number(req.params.id), req.admin.id, 'situacao', resultado.data.status),
  );
}

export async function anotar(req, res) {
  const resultado = notas.safeParse(req.body);
  if (!resultado.success) {
    return res.status(400).json({ erro: 'Informe uma anotação de até 5.000 caracteres.' });
  }
  responder(
    res,
    await service.alterar(
      Number(req.params.id),
      req.admin.id,
      'anotar',
      resultado.data.notasInternas || null,
    ),
  );
}

function responder(res, envio) {
  if (!envio) return res.status(404).json({ erro: 'Envio não encontrado.' });
  res.json({ envio });
}
