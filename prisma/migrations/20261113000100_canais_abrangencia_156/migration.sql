-- AlterTable
ALTER TABLE "canal_denuncia" ADD COLUMN "abrangencia" TEXT;

-- Abrangência dos canais que já existiam. Só preenche se ainda estiver vazia.
UPDATE "canal_denuncia" SET "abrangencia" = 'Todo o Brasil'
WHERE "slug" IN ('disque-100', 'ouvidoria-sus') AND "abrangencia" IS NULL;
UPDATE "canal_denuncia" SET "abrangencia" = 'Rio Grande do Sul'
WHERE "slug" = 'delegacia-combate-intolerancia' AND "abrangencia" IS NULL;

-- 156 da Prefeitura de Porto Alegre (pedido da ONG). Se a ONG já cadastrou um canal com
-- esse endereço no painel, mantém o dela.
INSERT INTO "canal_denuncia" ("slug", "nome", "descricao", "telefone", "link", "abrangencia", "ordem", "atualizado_em")
VALUES (
    'prefeitura-poa-156',
    '156 · Prefeitura de Porto Alegre',
    'Central de atendimento da Prefeitura. Recebe reclamações e denúncias sobre serviços municipais, inclusive o atendimento em unidades de saúde da Prefeitura. Também pelo WhatsApp (51) 3433-0156 ou, de fora de Porto Alegre, pelo (51) 3289-0156.',
    '156',
    'https://156web.procempa.com.br/',
    'Porto Alegre',
    4,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO NOTHING;
