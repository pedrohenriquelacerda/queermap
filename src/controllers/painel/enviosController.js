import * as service from '../../services/enviosPainelService.js';

export async function listar(req, res) {
  const valor = Number(req.query.pagina ?? 1);
  const pagina = Number.isSafeInteger(valor) && valor > 0 && valor <= 100000 ? valor : 1;
  const envios = await service.listar(pagina);
  res.render('painel/envios/lista', {
    title: 'Relatos e sugestões',
    envios: envios.slice(0, 50),
    pagina,
    temProxima: envios.length > 50,
    nomeLocal: service.nomeLocal,
  });
}

export async function mostrar(req, res, next) {
  const envio = await service.buscar(Number(req.params.id));
  if (!envio) return next();
  res.render('painel/envios/mostrar', {
    title: 'Detalhe do envio',
    envio,
    nomeLocal: service.nomeLocal(envio),
  });
}
