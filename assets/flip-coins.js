(() => {
  const preview = document.querySelector('.portfolio-home .home-projects [data-project="FLIP SIDE"]');
  if (!preview) return;

  const row = preview.closest('.work-row');
  const projectLink = row.querySelector('.project-action');
  const trailerLink = row.querySelector('[data-flip-trailer]');
  if (!projectLink || !trailerLink) return;
  const korean = document.documentElement.lang === 'ko';
  const copy = korean ? {
    ready: '레버를 눌러 코인을 던지세요',
    rule: '한 줄 완성 → 금색은 프로젝트, 은색은 트레일러',
    move: '빈 칸을 누르면 코인이 뒤집혀 이동해요',
    goldFace: '금색 면',
    silverFace: '은색 면',
    empty: '빈 칸',
    goldWin: '금색 한 줄 · 프로젝트 여는 중',
    silverWin: '은색 한 줄 · 트레일러 여는 중'
  } : {
    ready: 'Press the lever to scatter the coins',
    rule: 'Gold line → Project · Silver line → Trailer',
    move: 'Choose an empty tile to move and flip',
    goldFace: 'gold face',
    silverFace: 'silver face',
    empty: 'empty',
    goldWin: 'Gold line · Opening project',
    silverWin: 'Silver line · Opening trailer'
  };
  const columns = 3;
  const rows = 3;
  const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  const lineChance = .20;
  const missLimit = 4;
  const winTime = 950;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const asset = name => new URL(name, document.currentScript.src).href;
  // Frame end times from the supplied lever animation.
  const leverFrameEnds = [150, 240, 330, 420, 850, 930, 1010, 1090, 1620];
  const leverPullTime = leverFrameEnds[3];

  const widget = document.createElement('div');
  widget.className = 'flip-coins-widget';
  const canvas = document.createElement('canvas');
  canvas.className = 'flip-coins-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const button = document.createElement('button');
  button.className = 'flip-coins-button';
  button.type = 'button';
  button.setAttribute('aria-label', korean ? 'FLIP SIDE 레버를 눌러 코인 던지기' : 'Press the FLIP SIDE lever to scatter the coins');
  const lever = document.createElement('img');
  lever.src = asset('flip-lever-frames.webp');
  lever.className = 'flip-coins-lever';
  lever.alt = '';
  lever.draggable = false;
  const cutout = document.createElement('span');
  cutout.className = 'flip-coins-lever-cutout';
  cutout.append(lever);
  button.append(cutout);
  const hint = document.createElement('p');
  hint.className = 'flip-coins-hint';
  hint.textContent = copy.ready;
  hint.id = 'flip-coins-hint';
  hint.setAttribute('aria-hidden', 'true');
  button.setAttribute('aria-description', copy.rule);
  const status = document.createElement('span');
  status.className = 'sr-only';
  status.setAttribute('role', 'status');
  const cells = Array.from({ length: rows * columns }, (_, cell) => {
    const control = document.createElement('button');
    control.className = 'flip-coins-cell';
    control.type = 'button';
    control.addEventListener('click', () => pickCell(cell));
    return control;
  });
  widget.append(canvas, button, hint, status, ...cells);
  widget.dataset.state = 'ready';
  row.append(widget);
  row.classList.add('flip-coins-row');

  let width = 0;
  let height = 0;
  let frame = 0;
  let settled = [
    { cell: 1, front: true, yaw: -.08 },
    { cell: 3, front: false, yaw: .07 },
    { cell: 8, front: true, yaw: .02 }
  ];
  let toss = null;
  let move = null;
  let win = null;
  let selected = null;
  let misses = 0;
  let leverHovered = false;
  let leverFrame = 0;

  const clamp = value => Math.max(0, Math.min(1, value));
  const mix = (a, b, amount) => a + (b - a) * amount;

  function project(column, lane) {
    const depth = lane / rows;
    return {
      x: width / 2 - 29 + (column / columns - .5) * mix(118, 123, depth),
      y: height - 44 - (rows - lane) * 34
    };
  }

  function polygon(points) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.closePath();
  }

  function drawField(now) {
    const pulse = win ? Math.sin(Math.PI * clamp((now - win.start) / winTime)) : 0;
    const light = win?.gold ? '207, 162, 72' : '141, 176, 202';
    const border = win?.gold ? '#a3824b' : '#637c90';
    const lineColor = win?.gold ? '185, 139, 56' : '90, 123, 148';
    for (let lane = 0; lane < rows; lane++) {
      for (let column = 0; column < columns; column++) {
        const cell = lane * columns + column;
        const matched = win?.line.includes(cell);
        polygon([
          project(column + .045, lane + .075), project(column + .955, lane + .075),
          project(column + .955, lane + .925), project(column + .045, lane + .925)
        ]);
        ctx.fillStyle = matched ? `rgba(${light}, ${.23 + .16 * pulse})` : 'rgba(128, 128, 128, .10)';
        ctx.fill();
        ctx.lineWidth = selected === cell || matched ? 1.5 : 1;
        ctx.strokeStyle = matched ? border : selected === cell ? '#a3824b' : 'rgba(112, 112, 112, .20)';
        ctx.stroke();
      }
    }
    if (win) {
      const start = cellPoint(win.line[0]);
      const end = cellPoint(win.line[2]);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgba(${lineColor}, ${.48 + .28 * pulse})`;
      ctx.stroke();
    }
  }

  function cellPoint(cell) {
    return project(cell % columns + .5, Math.floor(cell / columns) + .5);
  }

  function drawCoin(x, y, heightAboveField, yaw, angle, scale) {
    ctx.beginPath();
    ctx.ellipse(x, y + heightAboveField + 3, 16 * scale, 11 * scale, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(28, 24, 19, ' + (heightAboveField > 4 ? .07 : .14) + ')';
    ctx.fill();

    const facing = Math.cos(angle);
    const front = facing >= 0;
    const squash = Math.max(.10, Math.abs(facing) * scale);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(yaw);
    ctx.scale(1, squash);
    const radius = 16.4;
    const metal = front ? ['#f6d798', '#bc904e', '#513520'] : ['#e0e6e9', '#91a0a6', '#3e4650'];
    const rim = ctx.createLinearGradient(-radius, -radius, radius, radius);
    rim.addColorStop(0, metal[0]);
    rim.addColorStop(.45, metal[1]);
    rim.addColorStop(.82, metal[2]);
    rim.addColorStop(1, metal[1]);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle = rim;
    ctx.fill();
    ctx.strokeStyle = metal[2];
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    for (let notch = 0; notch < 24; notch++) {
      const angle = (notch / 24) * Math.PI * 2;
      const x = Math.cos(angle);
      const y = Math.sin(angle);
      ctx.moveTo(x * 13.2, y * 13.2);
      ctx.lineTo(x * 15.55, y * 15.55);
    }
    ctx.strokeStyle = metal[2];
    ctx.lineWidth = .75;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, radius - 3.1, 0, Math.PI * 2);
    const inset = ctx.createRadialGradient(-3, -4, 1, 0, 0, radius - 3.1);
    inset.addColorStop(0, front ? '#284f49' : '#4a5869');
    inset.addColorStop(1, front ? '#142e2a' : '#242d39');
    ctx.fillStyle = inset;
    ctx.fill();
    ctx.strokeStyle = metal[1];
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, radius - 5.55, 0, Math.PI * 2);
    ctx.strokeStyle = metal[1];
    ctx.lineWidth = .55;
    ctx.stroke();

    ctx.beginPath();
    if (front) {
      ctx.arc(0, 0, 5.6, 0, Math.PI * 2);
    } else {
      ctx.moveTo(0, -7);
      ctx.lineTo(6.6, 0);
      ctx.lineTo(0, 7);
      ctx.lineTo(-6.6, 0);
      ctx.closePath();
    }
    ctx.fillStyle = metal[0];
    ctx.fill();
    ctx.strokeStyle = metal[2];
    ctx.lineWidth = .65;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, radius - 1.45, Math.PI * .92, Math.PI * 1.65);
    ctx.strokeStyle = metal[0];
    ctx.lineWidth = .65;
    ctx.stroke();
    ctx.restore();
  }

  function faceName(front) {
    return front ? copy.goldFace : copy.silverFace;
  }

  function summary(coins) {
    return coins.map(({ cell, front }, index) => {
      const column = cell % columns + 1;
      const lane = Math.floor(cell / columns) + 1;
      if (korean) return `코인 ${index + 1}, ${lane}행 ${column}열, ${faceName(front)}`;
      return `Coin ${index + 1}, row ${lane}, column ${column}, ${faceName(front)}`;
    }).join('. ');
  }

  function winningLine(coins) {
    if (coins.some(coin => coin.front !== coins[0].front)) return null;
    return lines.find(line => line.every(cell => coins.some(coin => coin.cell === cell))) ?? null;
  }

  function updateCaption() {
    const ruleVisible = leverHovered || button.matches(':focus-visible');
    const message = win?.message ?? (selected !== null ? copy.move : ruleVisible ? copy.rule : copy.ready);
    if (hint.textContent !== message) hint.textContent = message;
  }

  function updateControls() {
    const ready = widget.dataset.state === 'ready';
    for (const [cell, control] of cells.entries()) {
      const coin = settled.find(item => item.cell === cell);
      const action = ready && (Boolean(coin) || selected !== null);
      const lane = Math.floor(cell / columns) + 1;
      const column = cell % columns + 1;
      const face = coin ? faceName(coin.front) : copy.empty;
      control.setAttribute('aria-label', korean ? `${lane}행 ${column}열 · ${face}` : `Row ${lane}, column ${column} · ${face}`);
      if (coin) control.setAttribute('aria-pressed', String(selected === cell));
      else control.removeAttribute('aria-pressed');
      control.tabIndex = action ? 0 : -1;
      control.toggleAttribute('data-actionable', action);
      control.toggleAttribute('data-occupied', Boolean(coin));
    }
    updateCaption();
  }

  function setState(state) {
    widget.dataset.state = state;
    updateControls();
  }

  function scoreBoard(line) {
    if (line) {
      const gold = settled[0].front;
      const message = gold ? copy.goldWin : copy.silverWin;
      const destination = gold ? projectLink : trailerLink;
      destination.dataset.flipWin = gold ? 'gold' : 'silver';
      win = { line, gold, message, destination, start: performance.now() };
      status.textContent = message;
      misses = 0;
      setState('won');
    } else {
      status.textContent = summary(settled);
      setState('ready');
    }
  }

  function finishToss(coins) {
    settled = coins;
    toss = null;
    const line = winningLine(settled);
    if (!line) misses++;
    scoreBoard(line);
  }

  function finishMove() {
    settled[move.index] = move.coin;
    move = null;
    scoreBoard(winningLine(settled));
  }

  function pickCell(cell) {
    if (toss || move || win) return;
    const coin = settled.find(item => item.cell === cell);
    if (coin) {
      selected = selected === cell ? null : cell;
      updateControls();
    } else if (selected !== null) {
      const index = settled.findIndex(item => item.cell === selected);
      const current = settled[index];
      move = { index, coin: { ...current, cell, front: !current.front }, start: performance.now() };
      selected = null;
      if (reducedMotion.matches) finishMove();
      else setState('moving');
    }
    requestDraw();
  }

  function showLever(elapsed) {
    const index = Math.max(0, leverFrameEnds.findIndex(end => elapsed < end));
    if (index === leverFrame) return;
    leverFrame = index;
    button.dataset.leverFrame = index;
    lever.style.setProperty('--lever-frame', index);
  }

  function draw(now) {
    frame = 0;
    if (!width || !height) return;
    if (toss && now >= toss.end) finishToss(toss.coins);
    if (move && now - move.start >= 300) finishMove();
    if (win && now - win.start >= winTime) {
      const { destination } = win;
      delete destination.dataset.flipWin;
      win = null;
      setState('ready');
      requestDraw();
      window.location.assign(destination.href);
      return;
    }

    ctx.clearRect(0, 0, width, height);
    drawField(now);
    const elapsed = toss ? Math.max(0, now - toss.start) : 0;
    showLever(elapsed);
    const flightTime = elapsed - leverPullTime;
    const coins = settled.map((current, index) => {
      const from = cellPoint(current.cell);
      const fromAngle = current.front ? 0 : Math.PI;
      if (move?.index === index) {
        const to = cellPoint(move.coin.cell);
        const elapsed = clamp((now - move.start) / 300);
        const progress = elapsed * elapsed * (3 - 2 * elapsed);
        const lift = 9 * Math.sin(Math.PI * progress);
        return {
          x: mix(from.x, to.x, progress),
          y: mix(from.y, to.y, progress) - lift,
          height: lift,
          yaw: current.yaw,
          angle: fromAngle + Math.PI * progress,
          scale: .86
        };
      }
      if (!toss || flightTime < 0) {
        return { ...from, height: 0, yaw: current.yaw, angle: fromAngle, scale: .86 };
      }
      const landing = toss.coins[index];
      const to = cellPoint(landing.cell);
      const time = Math.max(0, flightTime / 1000 - index * .055);
      const progress = clamp(time / landing.duration);
      const arcHeight = Math.min(landing.lift, (from.y + to.y) / 2 - 20);
      const arc = Math.max(0, arcHeight) * Math.sin(Math.PI * progress);
      const after = time - landing.duration;
      const bounce = after > 0 && after < .21 ? 7 * Math.sin(Math.PI * (after / .21)) * (1 - after / .21) : 0;
      const turn = Math.PI * 2 * landing.spins + (landing.front ? 0 : Math.PI);
      const spin = 1 - (1 - progress) ** 1.55;
      return {
        x: mix(from.x, to.x, progress),
        y: mix(from.y, to.y, progress) - arc - bounce,
        height: arc + bounce,
        yaw: mix(current.yaw, landing.yaw, spin),
        angle: mix(fromAngle, turn, spin),
        scale: .86 + .13 * Math.sin(Math.PI * progress)
      };
    });
    coins.sort((a, b) => a.y + a.height - b.y - b.height);
    for (const coin of coins) {
      drawCoin(coin.x, coin.y, coin.height, coin.yaw, coin.angle, coin.scale);
    }
    if (toss || move || win) requestDraw();
  }

  function requestDraw() {
    if (!frame) frame = requestAnimationFrame(draw);
  }

  function throwCoins() {
    if (toss || move || win) return;
    selected = null;
    const plannedLine = misses >= missLimit || Math.random() < lineChance;
    const slots = plannedLine
      ? [...lines[Math.floor(Math.random() * lines.length)]]
      : Array.from({ length: rows * columns }, (_, i) => i);
    const sharedFace = plannedLine && Math.random() < .5;
    const coins = Array.from({ length: 3 }, () => ({
      cell: slots.splice(Math.floor(Math.random() * slots.length), 1)[0],
      front: plannedLine ? sharedFace : Math.random() < .5,
      duration: .48 + Math.random() * .19,
      lift: 34 + Math.random() * 16,
      spins: 2 + Math.floor(Math.random() * 2),
      yaw: (Math.random() - .5) * .28
    }));
    status.textContent = '';
    if (reducedMotion.matches) {
      finishToss(coins);
    } else {
      const start = performance.now();
      const duration = Math.max(...coins.map((coin, index) => coin.duration + index * .055 + .21));
      const end = Math.max(leverFrameEnds.at(-1), leverPullTime + duration * 1000);
      toss = { start, end: start + end, coins };
      setState('tossing');
    }
    requestDraw();
  }

  function layout() {
    width = widget.clientWidth;
    height = widget.clientHeight;
    if (!width || !height) return;
    const scale = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    for (const [cell, control] of cells.entries()) {
      const lane = Math.floor(cell / columns);
      const column = cell % columns;
      const top = project(column + .045, lane + .075);
      const bottom = project(column + .955, lane + .925);
      control.style.left = top.x + 'px';
      control.style.top = top.y + 'px';
      control.style.width = (bottom.x - top.x) + 'px';
      control.style.height = (bottom.y - top.y) + 'px';
    }
    updateControls();
    requestDraw();
  }

  button.addEventListener('click', throwCoins);
  button.addEventListener('pointerenter', () => { leverHovered = true; updateCaption(); });
  button.addEventListener('pointerleave', () => { leverHovered = false; updateCaption(); });
  button.addEventListener('focus', updateCaption);
  button.addEventListener('blur', updateCaption);
  reducedMotion.addEventListener('change', () => {
    if (toss && reducedMotion.matches) finishToss(toss.coins);
    if (move && reducedMotion.matches) finishMove();
    requestDraw();
  });
  new ResizeObserver(layout).observe(widget);
  layout();
})();
