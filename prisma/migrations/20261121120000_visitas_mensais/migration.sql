-- CreateTable
CREATE TABLE "visita_mensal" (
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "visita_mensal_pkey" PRIMARY KEY ("ano","mes")
);
