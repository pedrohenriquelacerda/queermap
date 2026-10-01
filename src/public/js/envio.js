// Formulário de envio: mostra só os campos que fazem sentido para o tipo escolhido.
// Sem JavaScript, todos os campos aparecem (e o servidor ignora os que não se aplicam).

const form = document.getElementById('form-envio');

if (form) {
  const blocos = form.querySelectorAll('[data-se-tipo]');

  const atualizar = () => {
    const tipo = form.elements.tipo.value;
    for (const bloco of blocos) {
      bloco.hidden = !tipo || !bloco.dataset.seTipo.split(' ').includes(tipo);
    }
  };

  form.addEventListener('change', (e) => {
    if (e.target.name === 'tipo') atualizar();
  });
  atualizar();
}
