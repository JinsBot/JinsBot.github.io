(() => {
  const preview = document.querySelector('.portfolio-home .home-projects [data-project="Carrot Mart"]');
  if (!preview) return;

  const row = preview.closest('.work-row');
  const korean = document.documentElement.lang === 'ko';
  const copy = korean ? {
    ready: '로프 끝을 누르고 있다가 놓아 던지세요',
    aim: '길게 누르면 ‘프로젝트 보기’까지 닿아요',
    charging: '놓으면 로프가 날아가요',
    caught: '당근을 낚았어요',
    link: label => label + ' · 이동 중',
    short: '조금 더 길게 눌러 보세요',
    controls: '올가미 던지기. 스페이스바나 엔터를 길게 눌렀다 놓으면 더 멀리 던집니다. 버튼을 낚으면 해당 링크가 열립니다. Esc 키로 취소합니다.'
  } : {
    ready: 'Hold the rope end, then release',
    aim: 'Hold longer to reach ‘View project’',
    charging: 'Release to throw',
    caught: 'Carrot caught',
    link: label => 'Opening ' + label.toLowerCase(),
    short: 'Try holding a little longer',
    controls: 'Throw the lasso. Hold Space or Enter, then release to throw farther. Catching a button opens its link. Press Escape to cancel.'
  };

  const widget = document.createElement('div');
  widget.className = 'carrot-lasso-widget';
  const canvas = document.createElement('canvas');
  canvas.className = 'carrot-lasso-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const context = canvas.getContext('2d');
  if (!context) return;

  const handle = document.createElement('button');
  handle.className = 'carrot-lasso-focus';
  handle.type = 'button';
  handle.setAttribute('aria-label', copy.controls);
  const hint = document.createElement('p');
  hint.className = 'carrot-lasso-hint';
  hint.id = 'carrot-lasso-hint';
  hint.setAttribute('aria-hidden', 'true');
  const result = document.createElement('span');
  result.className = 'sr-only';
  result.setAttribute('role', 'status');
  widget.append(canvas, handle, hint, result);
  row.append(widget);
  row.classList.add('carrot-lasso-row');

  const media = matchMedia('(hover: hover) and (pointer: fine) and (min-width: 1180px) and (prefers-reduced-motion: no-preference)');
  const chargeSeconds = 1.52;
  const spinSeconds = .82;
  const slowSpeed = .78 * Math.PI * 2;
  const fastSpeed = 4.05 * Math.PI * 2;
  const restAngle = Math.PI * .21;
  const catchRadius = 23;
  const projectLinks = [...row.querySelectorAll('.work-links a')];
  let targets = [];
  let ropeHovered = false;
  let width = 0;
  let height = 0;
  let hold = null;
  let shot = null;
  let frame = 0;

  const clamp = value => Math.max(0, Math.min(1, value));
  const mix = (a, b, amount) => a + (b - a) * amount;
  const smooth = value => value * value * (3 - 2 * value);

  function geometry() {
    const ground = height - 38;
    const code = targets.at(-1);
    return {
      ground,
      grip: { x: width - 40, y: ground + 2 },
      origin: { x: width - 84, y: ground - 38 },
      target: code ? { x: code.x + code.width / 2 + 30, y: code.y + 2 } : { x: width - 382, y: ground - 12 }
    };
  }

  function distanceFor(power) {
    const { origin, target } = geometry();
    return mix(52, origin.x - (targets[0]?.x ?? target.x) + 2, power);
  }

  function chargePose(elapsed, origin) {
    const ramp = Math.min(elapsed, spinSeconds);
    const acceleration = (fastSpeed - slowSpeed) / spinSeconds;
    const angle = restAngle + slowSpeed * ramp + acceleration * ramp ** 2 / 2 + fastSpeed * (elapsed - ramp);
    const lift = smooth(clamp(elapsed * 6));
    return {
      x: origin.x + Math.sin(angle) * 23 * lift,
      y: origin.y + (Math.cos(angle) * 14 - 12) * lift,
      angle,
      tilt: -.26 + Math.sin(angle) * .64 * lift,
      radiusX: 28 + 5 * Math.sin(angle) * lift,
      radiusY: 15 + Math.cos(angle) * 9 * lift,
      flex: .16 * lift,
      wave: 17 * lift
    };
  }

  function setHint(message) {
    if (hint.textContent !== message) hint.textContent = message;
  }

  function drawRope(points, closed = false) {
    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) context.lineTo(point.x, point.y);
    if (closed) context.closePath();
    context.strokeStyle = '#785b3d';
    context.lineWidth = 5.6;
    context.stroke();
    context.strokeStyle = '#ae895e';
    context.lineWidth = 4.2;
    context.stroke();
    context.strokeStyle = '#c6a578';
    context.lineWidth = 1.6;
    context.stroke();
    let walked = 0;
    let strand = 1.5;
    context.lineWidth = .7;
    context.strokeStyle = '#795a3e88';
    context.beginPath();
    const segments = closed ? points.length : points.length - 1;
    for (let i = 0; i < segments; i++) {
      const first = points[i];
      const next = points[(i + 1) % points.length];
      const dx = next.x - first.x;
      const dy = next.y - first.y;
      const length = Math.hypot(dx, dy);
      if (!length) continue;
      const tx = dx / length;
      const ty = dy / length;
      while (strand <= walked + length) {
        const part = (strand - walked) / length;
        const x = first.x + dx * part;
        const y = first.y + dy * part;
        context.moveTo(x - tx * .9 + ty * 1.65, y - ty * .9 - tx * 1.65);
        context.lineTo(x + tx * .9 - ty * 1.65, y + ty * .9 + tx * 1.65);
        strand += 4.3;
      }
      walked += length;
    }
    context.stroke();
    context.restore();
  }

  function drawLoop(pose, grip, tension) {
    const cosTilt = Math.cos(pose.tilt);
    const sinTilt = Math.sin(pose.tilt);
    const ring = Array.from({ length: 48 }, (_, i) => {
      const turn = pose.angle + (i / 48) * Math.PI * 2;
      const bend = 1 + pose.flex * Math.sin(turn * 2 + pose.angle);
      const x = Math.cos(turn) * pose.radiusX * bend;
      const y = Math.sin(turn) * pose.radiusY * bend;
      return {
        x: pose.x + x * cosTilt - y * sinTilt,
        y: pose.y + x * sinTilt + y * cosTilt
      };
    });
    const knot = ring[0];
    const tail = Array.from({ length: 48 }, (_, i) => {
      const t = i / 47;
      const envelope = Math.sin(Math.PI * t);
      const slack = (1 - tension) * envelope;
      const wave = pose.wave * envelope * Math.sin(pose.angle - 7.5 * t);
      return {
        x: mix(grip.x, knot.x, t) + slack * 10 + wave * .22,
        y: mix(grip.y, knot.y, t) + slack * 14 + wave
      };
    });
    drawRope(tail);
    drawRope(ring, true);
    context.beginPath();
    context.ellipse(knot.x, knot.y, 4.6, 3.8, pose.angle, 0, Math.PI * 2);
    context.fillStyle = '#865e36';
    context.fill();
    context.beginPath();
    context.arc(knot.x - .6, knot.y - .6, 2.1, 0, Math.PI * 2);
    context.fillStyle = '#d3b182';
    context.fill();
  }

  function drawCarrot(x, y, tilt, opacity) {
    context.save();
    context.translate(x, y);
    context.rotate(tilt);
    context.globalAlpha = opacity;
    context.lineCap = 'round';
    context.lineWidth = 2.6;
    context.strokeStyle = '#6c824d';
    context.beginPath();
    context.moveTo(8, 0);
    context.quadraticCurveTo(13, -4, 18, -9);
    context.moveTo(8, 0);
    context.quadraticCurveTo(14, -2, 21, -3);
    context.moveTo(8, 0);
    context.quadraticCurveTo(14, 0, 18, 3);
    context.stroke();

    const skin = context.createLinearGradient(-4, -6, -3, 6);
    skin.addColorStop(0, '#f5ad57');
    skin.addColorStop(1, '#cc6b2b');
    context.fillStyle = skin;
    context.beginPath();
    context.moveTo(-16, .6);
    context.bezierCurveTo(-8, -2.8, -1, -6.7, 7, -5.7);
    context.bezierCurveTo(12, -5.2, 12, 4.1, 8, 5.4);
    context.bezierCurveTo(2, 7, -9, 3.8, -16, .6);
    context.fill();
    context.strokeStyle = '#aa602e';
    context.lineWidth = 1;
    context.stroke();
    context.beginPath();
    context.moveTo(2, -4.7);
    context.quadraticCurveTo(1, -2.8, 2, -1.3);
    context.moveTo(-4, 3.8);
    context.quadraticCurveTo(-5, 2.4, -4.5, 1.3);
    context.stroke();
    context.restore();
  }

  function shadow(x, y, radius, opacity) {
    context.beginPath();
    context.ellipse(x, y, radius, 3, 0, 0, Math.PI * 2);
    context.fillStyle = 'rgba(75, 55, 33, ' + opacity + ')';
    context.fill();
  }

  function draw(now) {
    frame = 0;
    if (!width || !height) return;
    const { ground, grip, origin, target } = geometry();
    const pose = chargePose(hold ? Math.max(0, (now - hold.time) / 1000) : 0, origin);
    const carrot = { ...target, tilt: -.49, opacity: 1 };
    const aiming = media.matches && !shot && (ropeHovered || handle.matches(':focus-visible') || Boolean(hold));
    row.toggleAttribute('data-lasso-aim', aiming);
    let tension = 0;
    let front = false;
    let message = aiming ? copy.aim : copy.ready;

    if (hold) {
      message = copy.charging;
    } else if (shot) {
      const elapsed = (now - shot.time) / 1000;
      const flight = clamp(elapsed / shot.duration);
      const landed = Math.max(0, elapsed - shot.duration);
      const { landing, link } = shot;
      const arc = Math.sin(flight * Math.PI);
      const forward = flight * (1.25 - .25 * flight);
      const opening = smooth(clamp((flight - .58) / .42));
      pose.x = mix(shot.pose.x, landing.x, forward);
      pose.y = mix(shot.pose.y, landing.y, flight) - shot.arcHeight * arc;
      pose.angle = shot.pose.angle + shot.spin * shot.duration * flight * (1 - .29 * flight);
      pose.tilt = mix(shot.pose.tilt, link ? -.06 : -.16, flight) - .49 * arc;
      pose.radiusX = mix(shot.pose.radiusX, 26, flight) + 10 * arc + opening * (link ? link.width / 2 - 18 : 0);
      pose.radiusY = mix(shot.pose.radiusY, 12, flight) + 7 * arc + opening * (link ? link.height / 2 - 1 : 0);
      pose.flex = mix(shot.pose.flex, 0, flight) + .18 * arc;
      pose.wave = mix(shot.pose.wave, 0, flight) + 21 * arc;
      tension = mix(.3, 1, flight);
      message = '';
      if (flight === 1 && result.textContent === '') {
        result.textContent = link ? copy.link(link.label) : shot.caught ? copy.caught : copy.short;
        link?.element.setAttribute('data-lasso-caught', '');
      }

      if (link && flight === 1) {
        const pull = smooth(clamp((landed - .12) / .66));
        const lift = 12 * Math.sin(Math.PI * pull);
        pose.x = mix(link.x, grip.x - link.width / 2 - 15, pull);
        pose.y = mix(link.y, grip.y - 6, pull) - lift;
        pose.wave = 5 * Math.sin(Math.PI * pull);
        const style = link.element.style;
        style.setProperty('--lasso-pull-x', (pose.x - link.x) + 'px');
        style.setProperty('--lasso-pull-y', (pose.y - link.y) + 'px');
        style.setProperty('--lasso-pull-angle', (lift * .24) + 'deg');
        message = copy.link(link.label);
        if (landed >= .90) {
          clearShot();
          link.element.click();
          return;
        }
      } else if (shot.caught && flight === 1) {
        const drag = smooth(clamp((landed - .10) / .52));
        const trail = smooth(clamp((landed - .16) / .52));
        const reset = smooth(clamp((landed - .92) / .24));
        const lift = Math.sin(Math.PI * trail) * 9;
        pose.x = mix(mix(landing.x, grip.x - 38, drag), origin.x, reset);
        pose.y = mix(landing.y - lift * .7, origin.y, reset);
        pose.radiusY = mix(pose.radiusY, 15, reset);
        pose.wave = 4 * Math.sin(Math.PI * drag);
        carrot.x = mix(target.x, grip.x - 39, trail);
        carrot.y = target.y - lift;
        carrot.tilt += Math.sin(Math.PI * trail) * .4;
        carrot.opacity = 1 - reset;
        tension = 1 - reset;
        front = true;
        message = copy.caught;
        if (landed >= 1.16) clearShot();
      } else if (flight === 1) {
        const back = smooth(clamp((landed - .08) / .48));
        const recoil = Math.sin(back * Math.PI);
        pose.x = mix(landing.x, origin.x, back);
        pose.y = mix(landing.y, origin.y, back) - 15 * recoil;
        pose.radiusX = mix(pose.radiusX, 28, back);
        pose.radiusY = mix(pose.radiusY, 15, back);
        pose.wave = 14 * recoil;
        pose.flex = .10 * recoil;
        tension = 1 - back;
        message = copy.short;
        if (landed >= .90) clearShot();
      }
    }

    setHint(media.matches ? message : '');
    context.clearRect(0, 0, width, height);
    shadow(carrot.x, carrot.y + 13, 14, .11 * carrot.opacity);
    shadow(pose.x, ground + 2, 23, .065);

    if (front) drawCarrot(carrot.x, carrot.y, carrot.tilt, carrot.opacity);
    drawLoop(pose, grip, tension);
    if (!front) drawCarrot(carrot.x, carrot.y, carrot.tilt, carrot.opacity);
    if (media.matches && !hold && !shot) {
      context.save();
      context.setLineDash([2, 2]);
      context.strokeStyle = '#a4886b';
      context.lineWidth = 1;
      context.beginPath();
      context.arc(grip.x, grip.y, 10, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
    if (hold || shot) requestDraw();
    if (widget.dataset.state !== (hold ? 'charging' : shot ? 'throwing' : 'ready')) {
      widget.dataset.state = hold ? 'charging' : shot ? 'throwing' : 'ready';
    }
  }

  function requestDraw() {
    if (!frame) frame = requestAnimationFrame(draw);
  }

  function clearShot() {
    const caught = shot?.link?.element;
    if (caught) {
      caught.removeAttribute('data-lasso-caught');
      for (const property of ['--lasso-pull-x', '--lasso-pull-y', '--lasso-pull-angle']) {
        caught.style.removeProperty(property);
      }
    }
    shot = null;
    requestDraw();
  }

  function cancel() {
    const pointer = hold?.pointer;
    hold = null;
    ropeHovered = false;
    row.removeAttribute('data-lasso-aim');
    clearShot();
    if (pointer !== undefined && handle.hasPointerCapture(pointer)) handle.releasePointerCapture(pointer);
    requestDraw();
  }

  function begin(input) {
    if (!media.matches || hold || shot) return false;
    hold = { ...input, time: performance.now() };
    result.textContent = '';
    requestDraw();
    return true;
  }

  function throwRope() {
    const now = performance.now();
    const elapsed = (now - hold.time) / 1000;
    const power = clamp(elapsed / chargeSeconds);
    const { origin, target, ground } = geometry();
    const distance = distanceFor(power);
    const x = origin.x - distance;
    const link = targets.find(entry => Math.abs(x - entry.x) <= entry.width / 2);
    const caught = !link && Math.abs(x - target.x) <= catchRadius;
    shot = {
      time: now,
      pose: chargePose(elapsed, origin),
      spin: mix(slowSpeed, fastSpeed, clamp(elapsed / spinSeconds)),
      distance,
      duration: mix(.33, .73, power),
      arcHeight: mix(36, 86, power),
      landing: link ?? (caught ? target : { x, y: ground - 8 }),
      caught,
      link
    };
    hold = null;
    requestDraw();
  }

  function layout() {
    if (width && height && (width !== widget.clientWidth || height !== widget.clientHeight)) cancel();
    width = widget.clientWidth;
    height = widget.clientHeight;
    handle.tabIndex = media.matches ? 0 : -1;
    handle.disabled = !media.matches;
    if (!width || !height) return;
    const scale = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    const stage = widget.getBoundingClientRect();
    targets = projectLinks.map(element => {
      const bounds = element.getBoundingClientRect();
      return {
        element,
        label: element.textContent.replace(/[→▶↗]/g, '').trim(),
        x: bounds.left - stage.left + bounds.width / 2,
        y: bounds.top - stage.top + bounds.height / 2,
        width: bounds.width,
        height: bounds.height
      };
    });
    const { grip } = geometry();
    handle.style.left = (grip.x - 17) + 'px';
    handle.style.top = (grip.y - 17) + 'px';
    requestDraw();
  }

  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.pointerType !== 'mouse' || !begin({ pointer: event.pointerId })) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointerup', event => {
    if (hold?.pointer === event.pointerId) throwRope();
  });
  for (const eventName of ['pointercancel', 'lostpointercapture']) {
    handle.addEventListener(eventName, event => {
      if (hold?.pointer === event.pointerId) cancel();
    });
  }
  handle.addEventListener('keydown', event => {
    if (event.code === 'Escape') { cancel(); return; }
    if (event.code !== 'Space' && event.code !== 'Enter') return;
    event.preventDefault();
    if (!event.repeat) begin({ key: event.code });
  });
  handle.addEventListener('keyup', event => {
    if (hold?.key !== event.code) return;
    event.preventDefault();
    throwRope();
  });
  row.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || hold || shot || !media.matches) return;
    const stage = widget.getBoundingClientRect();
    const { origin, grip } = geometry();
    const x = event.clientX - stage.left;
    const y = event.clientY - stage.top;
    const nearRope = x >= origin.x - 33 && x <= grip.x + 17 && y >= origin.y - 23 && y <= grip.y + 17;
    if (nearRope === ropeHovered) return;
    ropeHovered = nearRope;
    requestDraw();
  }, { passive: true });
  row.addEventListener('pointerleave', () => {
    if (!ropeHovered) return;
    ropeHovered = false;
    requestDraw();
  });
  handle.addEventListener('focus', requestDraw);
  handle.addEventListener('blur', () => {
    if (hold?.key) cancel();
    else requestDraw();
  });
  addEventListener('blur', cancel);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
  media.addEventListener('change', () => { cancel(); layout(); });
  new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) cancel(); }).observe(widget);
  const resize = new ResizeObserver(layout);
  resize.observe(widget);
  for (const element of projectLinks) resize.observe(element);
  layout();
})();
