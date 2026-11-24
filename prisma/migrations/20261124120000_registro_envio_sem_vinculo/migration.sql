-- Privacidade: o registro que limita 5 envios por e-mail a cada 30 dias não pode ser ligado a um envio.
-- Antes, o id era sequencial e o horário era gravado na mesma transação do envio, então a ordem dos
-- ids e o horário casavam cada envio com o hash de e-mail de quem o mandou.

-- 1) id aleatório (UUID) no lugar do sequencial. A tabela não é referenciada por nenhuma outra.
ALTER TABLE "registro_envio" DROP CONSTRAINT "registro_envio_pkey";
ALTER TABLE "registro_envio" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "registro_envio" ALTER COLUMN "id" SET DATA TYPE UUID USING gen_random_uuid();
ALTER TABLE "registro_envio" ADD CONSTRAINT "registro_envio_pkey" PRIMARY KEY ("id");
DROP SEQUENCE IF EXISTS "registro_envio_id_seq";

-- 2) só a data (meia-noite), sem o horário, nos registros que já existem.
UPDATE "registro_envio" SET "criado_em" = date_trunc('day', "criado_em");
