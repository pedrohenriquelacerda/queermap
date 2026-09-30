-- CreateEnum
CREATE TYPE "papel_admin" AS ENUM ('ADMIN', 'EDITOR');

-- CreateEnum
CREATE TYPE "tipo_envio" AS ENUM ('SUGESTAO_LOCAL', 'ELOGIO', 'RECLAMACAO', 'DISCRIMINACAO');

-- CreateEnum
CREATE TYPE "status_envio" AS ENUM ('NOVO', 'EM_ANALISE', 'RESOLVIDO', 'ARQUIVADO');

-- CreateTable
CREATE TABLE "admin" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "papel" "papel_admin" NOT NULL DEFAULT 'EDITOR',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_login_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_auditoria" (
    "id" SERIAL NOT NULL,
    "admin_id" INTEGER,
    "acao" TEXT NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidade_id" INTEGER,
    "detalhes" JSONB,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "log_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categoria" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icone" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caracteristica" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "descricao" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "caracteristica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "local" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "descricao" TEXT,
    "categoria_id" INTEGER NOT NULL,
    "logradouro" TEXT NOT NULL,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT NOT NULL DEFAULT 'Porto Alegre',
    "uf" CHAR(2) NOT NULL DEFAULT 'RS',
    "cep" VARCHAR(9),
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "telefone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "site" TEXT,
    "horario_funcionamento" TEXT,
    "publicado" BOOLEAN NOT NULL DEFAULT false,
    "publicado_em" TIMESTAMP(3),
    "arquivado_em" TIMESTAMP(3),
    "criado_por_id" INTEGER,
    "atualizado_por_id" INTEGER,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "local_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "envio" (
    "id" SERIAL NOT NULL,
    "tipo" "tipo_envio" NOT NULL,
    "status" "status_envio" NOT NULL DEFAULT 'NOVO',
    "local_id" INTEGER,
    "mensagem" TEXT NOT NULL,
    "nome_local_sugerido" TEXT,
    "endereco_local_sugerido" TEXT,
    "deseja_contato" BOOLEAN NOT NULL DEFAULT false,
    "email_contato" TEXT,
    "sinalizado" BOOLEAN NOT NULL DEFAULT false,
    "motivo_filtro" TEXT,
    "notas_internas" TEXT,
    "lido_em" TIMESTAMP(3),
    "resolvido_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "envio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verificacao_email" (
    "id" SERIAL NOT NULL,
    "email_hash" TEXT NOT NULL,
    "codigo_hash" TEXT NOT NULL,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "expira_em" TIMESTAMP(3) NOT NULL,
    "usado_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verificacao_email_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registro_envio" (
    "id" SERIAL NOT NULL,
    "email_hash" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registro_envio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CaracteristicaToLocal" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_CaracteristicaToLocal_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_email_key" ON "admin"("email");

-- CreateIndex
CREATE INDEX "log_auditoria_entidade_entidade_id_idx" ON "log_auditoria"("entidade", "entidade_id");

-- CreateIndex
CREATE INDEX "log_auditoria_criado_em_idx" ON "log_auditoria"("criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "categoria_nome_key" ON "categoria"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "categoria_slug_key" ON "categoria"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "caracteristica_nome_key" ON "caracteristica"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "caracteristica_slug_key" ON "caracteristica"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "local_slug_key" ON "local"("slug");

-- CreateIndex
CREATE INDEX "local_publicado_arquivado_em_idx" ON "local"("publicado", "arquivado_em");

-- CreateIndex
CREATE INDEX "local_categoria_id_idx" ON "local"("categoria_id");

-- CreateIndex
CREATE INDEX "envio_status_criado_em_idx" ON "envio"("status", "criado_em");

-- CreateIndex
CREATE INDEX "envio_tipo_idx" ON "envio"("tipo");

-- CreateIndex
CREATE INDEX "verificacao_email_email_hash_criado_em_idx" ON "verificacao_email"("email_hash", "criado_em");

-- CreateIndex
CREATE INDEX "verificacao_email_expira_em_idx" ON "verificacao_email"("expira_em");

-- CreateIndex
CREATE INDEX "registro_envio_email_hash_criado_em_idx" ON "registro_envio"("email_hash", "criado_em");

-- CreateIndex
CREATE INDEX "_CaracteristicaToLocal_B_index" ON "_CaracteristicaToLocal"("B");

-- AddForeignKey
ALTER TABLE "log_auditoria" ADD CONSTRAINT "log_auditoria_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local" ADD CONSTRAINT "local_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local" ADD CONSTRAINT "local_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local" ADD CONSTRAINT "local_atualizado_por_id_fkey" FOREIGN KEY ("atualizado_por_id") REFERENCES "admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envio" ADD CONSTRAINT "envio_local_id_fkey" FOREIGN KEY ("local_id") REFERENCES "local"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CaracteristicaToLocal" ADD CONSTRAINT "_CaracteristicaToLocal_A_fkey" FOREIGN KEY ("A") REFERENCES "caracteristica"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CaracteristicaToLocal" ADD CONSTRAINT "_CaracteristicaToLocal_B_fkey" FOREIGN KEY ("B") REFERENCES "local"("id") ON DELETE CASCADE ON UPDATE CASCADE;
