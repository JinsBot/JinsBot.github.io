(() => {
  const header = document.querySelector('.portfolio-header');
  if (header) {
    const updateHeaderHeight = () => {
      document.documentElement.style.setProperty('--site-header-height', `${Math.ceil(header.getBoundingClientRect().height)}px`);
    };
    updateHeaderHeight();
    new ResizeObserver(updateHeaderHeight).observe(header);
  }

  function openAnchorDetails() {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    if (!id) return;
    const target = document.getElementById(id);
    if (!target) return;
    let opened = false;
    for (let node = target; node; node = node.parentElement) {
      if (node.tagName === 'DETAILS' && !node.open) { node.open = true; opened = true; }
    }
    if (target.tagName === 'SECTION' && target.children[0]?.tagName === 'DETAILS' && !target.children[0].open) {
      target.children[0].open = true;
      opened = true;
    }
    if (opened) requestAnimationFrame(() => target.scrollIntoView({block: 'start', behavior: 'instant'}));
  }
  addEventListener('hashchange', openAnchorDetails);
  openAnchorDetails();

  document.querySelectorAll('[data-copy-email]').forEach(button => {
    button.hidden = false;
    const label = button.querySelector('.copy-label');
    const contact = button.closest('.contact-strip');
    const status = contact.querySelector('[data-copy-status]');
    const fallbackAddress = contact.querySelector('[data-copy-fallback]');
    contact.querySelector('[data-email-fallback]').hidden = true;
    let reset;
    button.addEventListener('click', async () => {
      clearTimeout(reset);
      try {
        await navigator.clipboard.writeText(button.dataset.copyEmail);
        label.textContent = 'Copied';
        status.textContent = 'Email address copied.';
        fallbackAddress.hidden = true;
        reset = setTimeout(() => { label.textContent = 'Email'; status.textContent = ''; }, 2400);
      } catch {
        fallbackAddress.hidden = false;
        const range = document.createRange();
        range.selectNodeContents(fallbackAddress);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        status.textContent = 'Email address selected. Use your device’s copy command.';
      }
    });
  });

  document.querySelectorAll('[data-preview]').forEach(preview => {
    const link = preview.querySelector('.work-thumbnail');
    const primary = preview.querySelector('.preview-primary');
    const secondary = preview.querySelector('.preview-secondary');
    const toggle = preview.querySelector('.preview-toggle');
    const count = toggle.querySelector('[data-preview-count]');
    let selected = false;
    let hover = false;
    let focus = false;
    let showing = false;
    function render() {
      showing = selected || hover || focus;
      preview.dataset.showSecondary = String(showing);
      primary.setAttribute('aria-hidden', String(showing));
      secondary.setAttribute('aria-hidden', String(!showing));
      toggle.setAttribute('aria-pressed', String(showing));
      toggle.setAttribute('aria-label', `Show ${showing ? 'main image' : preview.dataset.secondaryLabel} for ${preview.dataset.project}`);
      count.textContent = showing ? '2 / 2' : '1 / 2';
    }
    toggle.hidden = false;
    link.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') { hover = true; render(); } });
    link.addEventListener('pointerleave', () => { hover = false; render(); });
    link.addEventListener('focus', () => { if (link.matches(':focus-visible')) { focus = true; render(); } });
    link.addEventListener('blur', () => { focus = false; render(); });
    toggle.addEventListener('click', () => { selected = !showing; hover = focus = false; render(); });
    preview.addEventListener('keydown', event => {
      if (event.key === 'Escape') { selected = hover = focus = false; render(); }
    });
    render();
  });

  if (document.body.classList.contains('portfolio-home')) {
    const links = [...header.querySelectorAll('nav a')];
    const entries = links.map(link => ({link, section: document.querySelector(new URL(link.href).hash)}));
    const entryForHash = () => entries.find(entry => new URL(entry.link.href).hash === location.hash) || null;
    // Keep explicit navigation selected, even when the page ends before its
    // section can reach the top. Resume position tracking on manual scrolling.
    let navigationTarget = entryForHash();
    let queued = false;
    function updateCurrentSection() {
      queued = false;
      const boundary = header.getBoundingClientRect().height + 70;
      let active = navigationTarget;
      if (!active) {
        for (const entry of entries) if (entry.section.getBoundingClientRect().top <= boundary) active = entry;
        if (scrollY > 100 && innerHeight + scrollY >= document.documentElement.scrollHeight - 5) active = entries.at(-1);
      }
      for (const entry of entries) {
        if (entry === active) entry.link.setAttribute('aria-current', 'location');
        else entry.link.removeAttribute('aria-current');
      }
    }
    for (const entry of entries) {
      entry.link.addEventListener('click', event => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        navigationTarget = entry;
        updateCurrentSection();
      });
    }
    addEventListener('hashchange', () => {
      navigationTarget = entryForHash();
      updateCurrentSection();
    });
    function resumePositionTracking() {
      navigationTarget = null;
      updateCurrentSection();
    }
    addEventListener('wheel', resumePositionTracking, {passive: true});
    addEventListener('touchmove', resumePositionTracking, {passive: true});
    addEventListener('pointerdown', event => {
      if (event.clientX >= document.documentElement.clientWidth) resumePositionTracking();
    });
    addEventListener('keydown', event => {
      if (!['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) return;
      if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (event.key === ' ' && event.target.closest('a, button, [role="button"]')) return;
      resumePositionTracking();
    });
    addEventListener('scroll', () => {
      if (!queued) { queued = true; requestAnimationFrame(updateCurrentSection); }
    }, {passive: true});
    addEventListener('resize', updateCurrentSection);
    updateCurrentSection();
  }
})();
