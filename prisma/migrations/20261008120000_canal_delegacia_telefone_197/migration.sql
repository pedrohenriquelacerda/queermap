-- Delegacia de Combate à Intolerância: o botão "Ligar" passa a usar o 197 (emergência da
-- Polícia Civil) e o link vai para o Fale conosco da Polícia Civil, onde está o (51) 3288-2400.
-- Só altera se o telefone ainda for o original, para não desfazer uma edição da ONG no painel.
UPDATE "canal_denuncia"
SET
    "telefone" = '197',
    "link" = 'https://www.pc.rs.gov.br/fale-conosco',
    "descricao" = 'Registra ocorrências de crimes de ódio e discriminação em Porto Alegre. Em emergência, ligue 197. Para outros contatos, use o Fale conosco da Polícia Civil: (51) 3288-2400.',
    "atualizado_em" = CURRENT_TIMESTAMP
WHERE "slug" = 'delegacia-combate-intolerancia'
  AND "telefone" = '(51) 3288-2400';
