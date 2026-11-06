-- AlterTable
ALTER TABLE "admin" ADD COLUMN     "totp_ativado_em" TIMESTAMP(3),
ADD COLUMN     "totp_segredo" TEXT,
ADD COLUMN     "totp_ultimo_passo" INTEGER;

-- CreateTable
CREATE TABLE "codigo_recuperacao" (
    "id" SERIAL NOT NULL,
    "admin_id" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "usado_em" TIMESTAMP(3),

    CONSTRAINT "codigo_recuperacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "codigo_recuperacao_admin_id_hash_idx" ON "codigo_recuperacao"("admin_id", "hash");

-- AddForeignKey
ALTER TABLE "codigo_recuperacao" ADD CONSTRAINT "codigo_recuperacao_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
