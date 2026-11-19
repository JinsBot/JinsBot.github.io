document.querySelectorAll('[data-copy]').forEach(button => {
 const korean = document.documentElement.lang === 'ko';
 button.addEventListener('click', async () => {
  const code = document.getElementById(button.dataset.copy);
  const text = Array.from(code.querySelectorAll('.code-line')).map(line => line.textContent).join('\n');
  const status = button.parentElement.querySelector('[role=status]');
  try { await navigator.clipboard.writeText(text); status.textContent = korean ? '코드를 복사했습니다.' : 'Copied.'; }
  catch { const selection = window.getSelection(); const range = document.createRange(); range.selectNodeContents(code); selection.removeAllRanges(); selection.addRange(range); status.textContent = korean ? '코드를 선택했습니다. 복사 명령을 사용하세요.' : 'Code selected. Press Ctrl+C to copy.'; }
 });
});
document.querySelectorAll('video').forEach(video => video.addEventListener('play', () => document.querySelectorAll('video').forEach(other => { if (other !== video) other.pause(); })));
