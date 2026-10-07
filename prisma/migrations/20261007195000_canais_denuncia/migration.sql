CREATE TABLE "canal_denuncia" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canal_denuncia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "canal_denuncia_slug_key" ON "canal_denuncia"("slug");
CREATE INDEX "canal_denuncia_ativo_ordem_idx" ON "canal_denuncia"("ativo", "ordem");

INSERT INTO "canal_denuncia" ("slug", "nome", "descricao", "telefone", "link", "ordem", "atualizado_em")
VALUES
    ('disque-100', 'Disque 100 · Direitos Humanos', 'Recebe denúncias de violações de direitos humanos, incluindo LGBTfobia. Gratuito, 24 horas, e permite denúncia anônima.', '100', 'https://www.gov.br/pt-br/servicos/denunciar-violacao-de-direitos-humanos', 1, CURRENT_TIMESTAMP),
    ('delegacia-combate-intolerancia', 'Delegacia de Combate à Intolerância (Polícia Civil RS)', 'Registra ocorrências de crimes de ódio e discriminação em Porto Alegre.', '(51) 3288-2400', 'https://www.pc.rs.gov.br/delegacia-de-combate-a-intolerancia', 2, CURRENT_TIMESTAMP),
    ('ouvidoria-sus', 'Ouvidoria do SUS', 'Para reclamações sobre atendimento em serviços de saúde públicos, inclusive desrespeito ao nome social.', '136', 'https://www.gov.br/saude/pt-br/canais-de-atendimento/ouvsus', 3, CURRENT_TIMESTAMP);
