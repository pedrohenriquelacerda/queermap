// Painel · Tipos de serviço: mostra a cor ou a bandeira escolhida ao lado do seletor, na hora,
// tanto ao editar um tipo quanto ao criar um novo. Sem JavaScript, o seletor funciona igual; só
// a prévia não muda até salvar.

for (const seletor of document.querySelectorAll('select[name=icone]')) {
  let amostra = seletor.previousElementSibling;
  if (!amostra?.classList.contains('bolinha')) {
    // Formulário de novo tipo: ainda não há prévia, então cria uma ao lado do seletor.
    const linha = document.createElement('span');
    linha.className = 'tipo-celula';
    amostra = document.createElement('span');
    amostra.className = 'bolinha';
    amostra.setAttribute('aria-hidden', 'true');
    seletor.before(linha);
    linha.append(amostra, seletor);
  }

  const atualizar = () => {
    amostra.className = `bolinha marcador--${seletor.value}`;
  };
  seletor.addEventListener('change', atualizar);
  atualizar();
}
