document.querySelectorAll('[data-copy]').forEach(button => {
 button.addEventListener('click', async () => {
  const code = document.getElementById(button.dataset.copy);
  const text = Array.from(code.querySelectorAll('.code-line')).map(line => line.textContent).join('\n');
  const status = button.parentElement.querySelector('[role=status]');
  try { await navigator.clipboard.writeText(text); status.textContent = 'Copied.'; }
  catch { const selection = window.getSelection(); const range = document.createRange(); range.selectNodeContents(code); selection.removeAllRanges(); selection.addRange(range); status.textContent = 'Code selected. Press Ctrl+C to copy.'; }
 });
});
document.querySelectorAll('video').forEach(video => video.addEventListener('play', () => document.querySelectorAll('video').forEach(other => { if (other !== video) other.pause(); })));
