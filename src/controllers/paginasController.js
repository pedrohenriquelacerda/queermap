import * as canaisDenuncia from '../services/canaisDenunciaService.js';

export function sobre(req, res) {
  res.render('paginas/sobre', {
    title: 'Sobre',
    descricao: 'O que é o Mapa SerQueer, o que está no mapa e como os locais são validados.',
  });
}

export async function canais(req, res) {
  const canais = await canaisDenuncia.listarAtivos();
  res.render('paginas/canais', {
    title: 'Canais de denúncia',
    descricao:
      'Onde denunciar discriminação e LGBTfobia: Disque 100, Delegacia de Combate à Intolerância e Ouvidoria do SUS.',
    canais,
  });
}

export function privacidade(req, res) {
  res.render('paginas/privacidade', {
    title: 'Privacidade',
    descricao: 'Como o Mapa SerQueer trata os seus dados, de acordo com a LGPD.',
  });
}
