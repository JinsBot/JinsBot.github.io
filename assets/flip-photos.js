(() => {
  const gallery = document.querySelector('.flip-exhibitions');
  const preview = document.querySelector('.flip-photo-preview');
  const dialog = document.querySelector('.flip-photo-dialog');
  if (!gallery || !dialog?.showModal) return;

  const previewImage = preview.querySelector('img');
  const fullImage = dialog.querySelector('img');
  const hover = matchMedia('(any-hover: hover) and (any-pointer: fine)');
  let currentLink;
  let opener;
  let hideTimer;

  function hidePreview() {
    clearTimeout(hideTimer);
    preview.hidden = true;
    currentLink = null;
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hidePreview, 120);
  }

  function showPreview(link) {
    clearTimeout(hideTimer);
    currentLink = link;
    const thumbnail = link.querySelector('img');
    const rect = link.getBoundingClientRect();
    const margin = 12;
    const viewportWidth = document.documentElement.clientWidth;
    const above = rect.top - margin;
    const below = innerHeight - rect.bottom - margin;
    // Keep a strip of thumbnails exposed even on a short laptop screen.
    const maxHeight = Math.min(600, innerHeight - 2 * margin,
      Math.max(above, below) + Math.min(rect.height / 3, 80));
    const ratio = Number(thumbnail.getAttribute('width')) / Number(thumbnail.getAttribute('height'));
    const width = Math.min(760, viewportWidth - 2 * margin, maxHeight * ratio);
    const height = width / ratio;
    const left = Math.max(margin, Math.min(rect.left + (rect.width - width) / 2, viewportWidth - width - margin));
    const top = above >= below
      ? Math.max(margin, rect.top - height - 4)
      : Math.min(innerHeight - height - margin, rect.bottom + 4);
    Object.assign(preview.style, {width: width + 'px', height: height + 'px', left: left + 'px', top: top + 'px'});
    previewImage.src = link.href;
    preview.hidden = false;
  }

  function openPhoto(link) {
    hidePreview();
    opener = link;
    fullImage.src = link.href;
    fullImage.alt = link.querySelector('img').alt;
    dialog.showModal();
  }

  gallery.querySelectorAll('.flip-event-photos a').forEach(link => {
    link.setAttribute('aria-haspopup', 'dialog');
    link.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse' && hover.matches && !dialog.open) showPreview(link);
    });
    link.addEventListener('pointerleave', scheduleHide);
    link.addEventListener('click', event => {
      if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      openPhoto(link);
    });
  });

  preview.addEventListener('pointerenter', () => clearTimeout(hideTimer));
  preview.addEventListener('pointerleave', scheduleHide);
  preview.addEventListener('click', () => { if (currentLink) openPhoto(currentLink); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hidePreview(); });
  window.addEventListener('scroll', hidePreview, {passive: true});
  window.addEventListener('resize', hidePreview);
  dialog.querySelector('button').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => opener?.focus({preventScroll: true}));
})();
