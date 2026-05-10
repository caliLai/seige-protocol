/* ═══════════════════════════════════════════════
   TITLE SHIMMER — builds per-letter spans with
   staggered animation delays for the wave effect
   ═══════════════════════════════════════════════ */

(function () {
  var words = [
    { el: document.getElementById('titleLine1'), text: 'SIEGE' },
    { el: document.getElementById('titleLine2'), text: 'PROTOCOL' },
  ];

  words.forEach(function (w, wi) {
    w.el.innerHTML = '';
    for (var i = 0; i < w.text.length; i++) {
      var span = document.createElement('span');
      span.className = 'shimmer-letter';
      span.textContent = w.text[i];
      var totalIndex = (wi === 0 ? 0 : words[0].text.length) + i;
      span.style.animationDelay = (totalIndex * 0.12) + 's';
      w.el.appendChild(span);
    }
  });
})();
