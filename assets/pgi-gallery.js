(() => {
  const links = [...document.querySelectorAll('[data-design-image]')];
  if (!links.length || typeof HTMLDialogElement === 'undefined' || !HTMLDialogElement.prototype.showModal) return;
  const korean = document.documentElement.lang === 'ko';

  const dialog = document.createElement('dialog');
  dialog.className = 'design-viewer';
  dialog.setAttribute('aria-labelledby', 'design-viewer-title');
  dialog.setAttribute('aria-describedby', 'design-viewer-caption');
  dialog.innerHTML = `
    <div class="design-viewer-top">
      <h2 id="design-viewer-title"></h2>
      <button type="button" data-close aria-label="${korean ? '확대한 이미지 닫기' : 'Close enlarged image'}" autofocus>${korean ? '닫기' : 'Close'} ×</button>
    </div>
    <img class="design-viewer-image" alt="">
    <p class="design-viewer-caption" id="design-viewer-caption"></p>
    <div class="design-viewer-bottom">
      <div class="design-pagination">
        <button type="button" data-prev aria-label="${korean ? '이전 이미지' : 'Previous image'}">← ${korean ? '이전' : 'Previous'}</button>
        <span class="design-count" aria-live="polite" aria-atomic="true"></span>
        <button type="button" data-next aria-label="${korean ? '다음 이미지' : 'Next image'}">${korean ? '다음' : 'Next'} →</button>
      </div>
      <a class="design-original" target="_blank" rel="noopener">${korean ? '원본 보기' : 'Full size'} ↗</a>
    </div>`;
  document.body.append(dialog);
  const title = dialog.querySelector('h2');
  const image = dialog.querySelector('img');
  const caption = dialog.querySelector('.design-viewer-caption');
  const count = dialog.querySelector('.design-count');
  const original = dialog.querySelector('.design-original');
  let index = 0;
  let opener;
  let previousOverflow;

  function show(next) {
    index = (next + links.length) % links.length;
    const link = links[index];
    title.textContent = link.dataset.title;
    image.src = link.href;
    image.alt = link.querySelector('img').alt;
    caption.textContent = link.dataset.caption;
    count.textContent = `${index + 1} / ${links.length}`;
    original.href = link.href;
    original.setAttribute('aria-label', korean ? `${link.dataset.title} 원본 보기` : `Open full-size image: ${link.dataset.title}`);
  }

  links.forEach((link, position) => {
    link.setAttribute('aria-haspopup', 'dialog');
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      opener = link;
      show(position);
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      dialog.showModal();
    });
  });
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-prev]').addEventListener('click', () => show(index - 1));
  dialog.querySelector('[data-next]').addEventListener('click', () => show(index + 1));
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Tab') {
      const controls = [...dialog.querySelectorAll('button, a[href]')];
      const destination = event.shiftKey && document.activeElement === controls[0]
        ? controls.at(-1)
        : !event.shiftKey && document.activeElement === controls.at(-1) ? controls[0] : null;
      if (destination) { event.preventDefault(); destination.focus(); }
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      show(index + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  let backdropDown = false;
  const outside = event => {
    const rect = dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  };
  dialog.addEventListener('pointerdown', event => { backdropDown = event.target === dialog && outside(event); });
  dialog.addEventListener('click', event => {
    if (backdropDown && event.target === dialog && outside(event)) dialog.close();
    backdropDown = false;
  });
  dialog.addEventListener('close', () => {
    document.body.style.overflow = previousOverflow;
    opener?.focus({preventScroll: true});
  });
})();
