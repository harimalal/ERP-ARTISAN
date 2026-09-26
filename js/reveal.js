/* -------------------------------------------------------
   AppMee — reveal.js
   Petite animation partagée : un mot apparaît lettre par
   lettre avec un fondu + léger glissement, en cascade.
   Utilisé sur l'écran de chargement (app.html) et la page
   de connexion (login.html). Script classique (pas de module)
   pour être inclus tel quel dans les deux pages.
------------------------------------------------------- */
(function () {
  function revealWord(el, word, opts) {
    if (!el) return;
    var stagger = (opts && opts.stagger) || 65;
    el.innerHTML = '';
    el.setAttribute('aria-label', word);
    for (var i = 0; i < word.length; i++) {
      var ch = word[i];
      var span = document.createElement('span');
      span.className = 'reveal-letter';
      span.textContent = ch === ' ' ? ' ' : ch;
      span.style.transitionDelay = (i * stagger) + 'ms';
      el.appendChild(span);
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        el.classList.add('reveal-active');
      });
    });
  }

  window.revealWord = revealWord;
})();
