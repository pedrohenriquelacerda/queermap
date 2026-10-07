// Formulário de envio: mostra só os campos que fazem sentido para o tipo escolhido.
// Sem JavaScript, todos os campos aparecem (e o servidor ignora os que não se aplicam).

const form = document.getElementById('form-envio');

if (form) {
  const blocos = form.querySelectorAll('[data-se-tipo]');
  const outroLugar = form.querySelector('[data-se-outro-lugar]');
  const modalCanais = document.getElementById('modal-canais');

  const atualizar = () => {
    const tipo = form.elements.tipo.value;
    for (const bloco of blocos) {
      bloco.hidden = !tipo || !bloco.dataset.seTipo.split(' ').includes(tipo);
    }
    // "Nome do lugar" só quando o relato é sobre um lugar fora do mapa.
    outroLugar.hidden = form.elements.localId.value !== 'outro';
  };

  form.addEventListener('change', (e) => {
    if (e.target.name === 'tipo' || e.target.name === 'localId') atualizar();
    if (e.target.name === 'tipo' && e.target.value === 'DISCRIMINACAO') {
      modalCanais?.showModal();
    }
  });
  for (const botao of document.querySelectorAll('[data-fechar-canais]')) {
    botao.addEventListener('click', () => modalCanais?.close());
  }
  atualizar();
}
