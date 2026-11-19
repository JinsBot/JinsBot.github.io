(() => {
  const preview = document.querySelector('.portfolio-home .home-projects [data-project="PGI Feedback System"]');
  if (!preview) return;
  if (!window.createPGIJengaWorld) return;
  const model=window.createPGIJengaWorld();
  const row = preview.closest('.work-row');
  const links = [...row.querySelectorAll('.work-links a')];
  const korean = document.documentElement.lang === 'ko';
  const rule = korean
    ? '블록을 밀어 ‘프로젝트 보기’를 맞히면 이동해요'
    : 'Push a block onto ‘View project’ to open it';
  const widget=document.createElement('div');
  widget.className='pgi-jenga-widget';
  const canvas = document.createElement('canvas');
  canvas.className = 'pgi-hover-scene';
  canvas.setAttribute('aria-hidden', 'true');
  const hint = document.createElement('p');
  hint.className = 'pgi-jenga-hint';
  hint.textContent = rule;
  widget.setAttribute('aria-hidden','true');
  widget.append(canvas, hint);row.append(widget);
  row.classList.add('pgi-hover-row');
  const ctx = canvas.getContext('2d');
  if (!ctx) { widget.remove(); return; }

  // Interactive rigid bodies, with contact/friction/gravity handled by cannon-es.
  // The decorative scene is not a measured model of the research prototype.
  let W=0,H=0;
  const camera={scale:21.4,x:0,y:0};
  const azimuth = .63, elevation = .40;
  const ca = Math.cos(azimuth), sa = Math.sin(azimuth);
  const ce = Math.cos(elevation), se = Math.sin(elevation);
  const right = [ca, 0, -sa], up = [-sa*se, ce, -ca*se];
  const eye = [sa*ce, se, ca*ce];
  const light = [-.42, .82, .38];
  const dot = (a,b) => a.reduce((s,v,i) => s+v*b[i], 0);
  const add = (a,b) => a.map((v,i) => v+b[i]);
  const sub = (a,b) => a.map((v,i) => v-b[i]);
  const mul = (a,s) => a.map(v => v*s);
  const unit = a => mul(a,1/Math.hypot(...a));
  const mix = (a,b,t) => a.map((v,i) => v+(b[i]-v)*t);
  const project = p => [camera.x+dot(p,right)*camera.scale,camera.y-dot(p,up)*camera.scale];
  const rotate=(p,q)=>{
    const u=[q.x,q.y,q.z],uv=[u[1]*p[2]-u[2]*p[1],u[2]*p[0]-u[0]*p[2],u[0]*p[1]-u[1]*p[0]];
    const uuv=[u[1]*uv[2]-u[2]*uv[1],u[2]*uv[0]-u[0]*uv[2],u[0]*uv[1]-u[1]*uv[0]];
    return p.map((v,i)=>v+2*(q.w*uv[i]+uuv[i]));
  };
  const path = points => {
    ctx.beginPath();
    points.forEach((p,i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p));
    ctx.closePath();
  };

  // Chamfered cuboids: inset face planes, bevel strips and corner facets.
  // All shading and grain are rendered in the same projected coordinates.
  function bevelBox(size) {
    const b=.028, h=size.map(v=>v/2), inner=h.map(v=>v-b), result=[];
    for(let axis=0;axis<3;axis++) for(const sign of [-1,1]) {
      const a=(axis+1)%3,c=(axis+2)%3;
      const pts=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>{
        const p=[0,0,0];p[axis]=h[axis]*sign;p[a]=inner[a]*u;p[c]=inner[c]*v;return p;
      });
      const n=[0,0,0];n[axis]=sign;
      result.push({pts,n,grain:true,axis,a,c});
    }
    for(let a=0;a<3;a++)for(let c=a+1;c<3;c++)for(const sa of [-1,1])for(const sc of [-1,1]) {
      const free=3-a-c;
      const point=(onA,end)=>{
        const p=[0,0,0];p[a]=(onA?h[a]:inner[a])*sa;p[c]=(onA?inner[c]:h[c])*sc;p[free]=inner[free]*end;return p;
      };
      const n=[0,0,0];n[a]=sa/Math.SQRT2;n[c]=sc/Math.SQRT2;
      result.push({pts:[point(true,-1),point(false,-1),point(false,1),point(true,1)],n,grain:false});
    }
    for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){
      const s=[x,y,z];result.push({pts:[0,1,2].map(a=>s.map((v,i)=>v*(i===a?h[i]:inner[i]))),n:unit(s),grain:false});
    }
    return result;
  }
  const blockSize=model.size;
  const shape=bevelBox(blockSize);
  const blocks=model.blocks;
  const halfAxes = blockSize.map((length, axis) => [0, 1, 2].map(i => i === axis ? length / 2 : 0));
  const blockRadius = Math.hypot(...blockSize) * camera.scale / 2;

  function overlapPoint(first, second) {
    let overlap = first;
    const cross = (a, b, p) => (b[0]-a[0])*(p[1]-a[1]) - (b[1]-a[1])*(p[0]-a[0]);
    const winding = Math.sign(cross(second[0], second[1], second[2]));
    if (!winding) return null;
    for (const [i, edgeStart] of second.entries()) {
      const edgeEnd = second[(i + 1) % second.length];
      const clipped = [];
      let prev = overlap.at(-1);
      let prevDistance = winding * cross(edgeStart, edgeEnd, prev);
      for (const point of overlap) {
        const distance = winding * cross(edgeStart, edgeEnd, point);
        if ((prevDistance >= 0) !== (distance >= 0)) {
          clipped.push(mix(prev, point, prevDistance / (prevDistance - distance)));
        }
        if (distance >= 0) clipped.push(point);
        prev = point;
        prevDistance = distance;
      }
      if (clipped.length < 3) return null;
      overlap = clipped;
    }
    const area = overlap.reduce((sum, point, i) =>
      i < 2 ? sum : sum + cross(overlap[0], overlap[i - 1], point), 0);
    if (Math.abs(area) < .12) return null;
    return mul(overlap.reduce(add, [0, 0]), 1 / overlap.length);
  }

  function orderFaces(faces) {
    // Compare depths inside the overlap. A face's midpoint can be well outside it.
    faces.sort((a, b) => a.depth - b.depth);
    const behind = faces.map(() => []);
    const byLeft = faces.map((face, index) => ({ index, ...face.bounds })).sort((a, b) => a.left - b.left);
    for (const [i, a] of byLeft.entries()) {
      const first = faces[a.index];
      for (let j = i + 1; j < byLeft.length && byLeft[j].left < a.right; j++) {
        const b = byLeft[j];
        const second = faces[b.index];
        if (a.bottom <= b.top || b.bottom <= a.top || first.block === second.block) continue;
        const point = overlapPoint(first.screen, second.screen);
        if (!point) continue;
        const firstDepth = dot(pointOnFace(point, first), eye);
        const secondDepth = dot(pointOnFace(point, second), eye);
        if (firstDepth <= secondDepth) behind[b.index].push(a.index);
        else behind[a.index].push(b.index);
      }
    }
    const ordered = [];
    const visited = new Set();
    function append(i) {
      if (visited.has(i)) return;
      visited.add(i);
      for (const back of behind[i]) append(back);
      ordered.push(faces[i]);
    }
    faces.forEach((_, i) => append(i));
    return ordered;
  }

  function grain(face, strength) {
    if(!face.grain)return;
    const p=face.world;
    // The longest tangent follows the block's wood grain, including end grain.
    let a=p[0],b=p[1],c=p[3];
    if(Math.hypot(...sub(b,a)) < Math.hypot(...sub(c,a))) [b,c]=[c,b];
    const d=add(b,sub(c,a));
    ctx.save();path(face.screen);ctx.clip();
    ctx.lineWidth=.26;
    for(let i=0;i<9;i++){
      const v=(i+.5)/9, phase=face.seed*.71+i*1.7;
      ctx.beginPath();
      for(let j=0;j<=14;j++){
        const u=j/14, wave=.009*Math.sin(u*8+phase)+.004*Math.sin(u*23+phase);
        const point=project(mix(mix(a,b,u),mix(c,d,u),v+wave));
        if(j===0)ctx.moveTo(...point);else ctx.lineTo(...point);
      }
      ctx.strokeStyle=`rgba(84,51,23,${strength*(i%3===0?.21:.10)})`;ctx.stroke();
    }
    ctx.restore();
  }

  let visibleFaces=[];
  function render() {
    // Include the page's right gutter without moving the tower or the content.
    W=Math.max(row.clientWidth,Math.floor(document.documentElement.clientWidth-row.getBoundingClientRect().left));
    H=canvas.clientHeight;
    if(widget.style.width!==`${W}px`)widget.style.width=`${W}px`;
    // Anchor the original-size tower to the row, never to the moving blocks.
    const towerX = row.clientWidth - 90;
    if (camera.x !== towerX) {
      camera.x = towerX;
      widget.style.setProperty('--pgi-tower-x', `${towerX}px`);
    }
    camera.y=row.clientHeight-52;
    const ratio=Math.min(devicePixelRatio||1,3);
    if(canvas.width!==Math.round(W*ratio)||canvas.height!==Math.round(H*ratio)){
      canvas.width=Math.round(W*ratio);canvas.height=Math.round(H*ratio);
    }
    ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,W,H);
    const faces=[];
    for(const block of blocks){
      const q=block.body.quaternion,position=block.body.position;
      const center=[position.x,position.y,position.z];
      for(const face of shape){
        const normal=rotate(face.n,q);
        if(dot(normal,eye)<.001)continue;
        const world=face.pts.map(p=>add(rotate(p,q),center));
        const middle=mul(world.reduce((sum,p)=>add(sum,p),[0,0,0]),1/world.length);
        const brightness=.74+.3*Math.max(0,dot(normal,light));
        const variation=Math.sin(block.seed*1.31)*5;
        const base=[192+variation,151+variation,101+variation];
        const rgb=base.map(v=>Math.round(v*brightness));
        faces.push({...face,world,normal,depth:dot(middle,eye),rgb,seed:block.seed,block});
      }
    }
    for (const face of faces) {
      face.screen = face.world.map(project);
      const xs = face.screen.map(point => point[0]);
      const ys = face.screen.map(point => point[1]);
      face.bounds = { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
    }
    // Individual contact shadows follow the blocks when they leave the tower.
    for(const {body} of blocks){
      const point=project([body.position.x,0,body.position.z]);
      ctx.save();ctx.translate(...point);ctx.scale(1,.32);
      const radius=camera.scale*1.55,shadow=ctx.createRadialGradient(0,0,0,0,0,radius);
      const alpha=.13/(1+body.position.y*.9);
      shadow.addColorStop(0,`rgba(55,43,28,${alpha})`);shadow.addColorStop(1,'rgba(55,43,28,0)');
      ctx.fillStyle=shadow;ctx.fillRect(-radius,-radius,radius*2,radius*2);ctx.restore();
    }
    visibleFaces = orderFaces(faces);
    for(const face of visibleFaces){
      const grad=ctx.createLinearGradient(0,face.bounds.top,0,face.bounds.bottom+.01);
      grad.addColorStop(0,`rgb(${face.rgb.map(v=>Math.min(255,v+5)).join(',')})`);
      grad.addColorStop(1,`rgb(${face.rgb.map(v=>v-3).join(',')})`);
      path(face.screen);ctx.fillStyle=grad;ctx.fill();
      // Fine facet outline seals antialias seams without cartoon edge strokes.
      ctx.lineWidth=.23;ctx.strokeStyle=`rgb(${face.rgb.join(',')})`;ctx.stroke();
      grain(face,1);
    }
  }

  const allow=matchMedia('(hover: hover) and (pointer: fine) and (min-width: 1180px) and (prefers-reduced-motion: no-preference)');
  const maxBlockSpeed = 13;
  const maxPushImpulse = 8.5;
  const maxSpin = 9;
  const minPointerSpeed = 120;
  const directionChangeDelay = 75;
  let frame=0,lastFrame=0,previousPointer=null,inView=true,accumulator=0;
  let lastPush = null;
  let touchingLinks = new Set();
  let pendingLink = null;
  let linkTimer = 0;

  function clearLinkHit() {
    clearTimeout(linkTimer);
    if (!pendingLink) return;
    delete pendingLink.dataset.jengaHit;
    pendingLink = null;
    hint.textContent = rule;
  }

  function openHitLink(link) {
    pendingLink = link;
    link.dataset.jengaHit = '';
    const label = link.textContent.replace(/[→▶↗]/g, '').trim();
    hint.textContent = korean ? `${label} · 이동 중` : `${label} · Opening…`;
    linkTimer = setTimeout(() => {
      clearLinkHit();
      window.location.assign(link.href);
    }, 650);
  }

  function linkTargets() {
    const stage = canvas.getBoundingClientRect();
    return links.map(link => {
      const rect = link.getBoundingClientRect();
      return {
        link,
        x: rect.left - stage.left + rect.width / 2,
        y: rect.top - stage.top + rect.height / 2,
        halfWidth: rect.width / 2,
        halfHeight: rect.height / 2
      };
    });
  }

  function trackLinkContacts(targets) {
    const contacts = new Set();
    for (const { body } of blocks) {
      const [x, y] = project([body.position.x, body.position.y, body.position.z]);
      const nearby = targets.filter(target =>
        Math.abs(x - target.x) <= target.halfWidth + blockRadius &&
        Math.abs(y - target.y) <= target.halfHeight + blockRadius);
      if (!nearby.length) continue;

      const edges = halfAxes.map(axis => {
        const rotated = rotate(axis, body.quaternion);
        return [dot(rotated, right) * camera.scale, -dot(rotated, up) * camera.scale];
      });
      // A projected cuboid and a link overlap only if neither has a separating edge.
      const normals = [[1, 0], [0, 1], ...edges.map(([u, v]) => [-v, u])];
      for (const target of nearby) {
        const overlaps = normals.every(([u, v]) => {
          const blockExtent = edges.reduce((extent, [a, b]) => extent + Math.abs(u * a + v * b), 0);
          const linkExtent = target.halfWidth * Math.abs(u) + target.halfHeight * Math.abs(v);
          return Math.abs(u * (x - target.x) + v * (y - target.y)) <= blockExtent + linkExtent;
        });
        if (overlaps) contacts.add(target.link);
      }
    }
    const first = [...contacts].find(link => !touchingLinks.has(link));
    touchingLinks = contacts;
    if (first && !pendingLink) openHitLink(first);
  }

  function pause() {
    cancelAnimationFrame(frame);
    frame = 0;
    previousPointer = null;
    lastPush = null;
    accumulator = 0;
    clearLinkHit();
  }
  function resume(){if(allow.matches&&inView&&!document.hidden&&!model.sleeping())wake()}
  function pointOnFace(point,face){
    const origin=add(mul(right,(point[0]-camera.x)/camera.scale),mul(up,(camera.y-point[1])/camera.scale));
    const distance=dot(sub(face.world[0],origin),face.normal)/dot(eye,face.normal);
    return add(origin,mul(eye,distance));
  }
  function animate(now){
    accumulator+=Math.min((now-lastFrame)/1000,.05);lastFrame=now;
    const targets = linkTargets();
    while (accumulator >= model.timestep) {
      model.step();
      trackLinkContacts(targets);
      accumulator -= model.timestep;
    }
    render();
    if(model.sleeping()){frame=0;accumulator=0;return}
    frame=requestAnimationFrame(animate);
  }
  function wake(){if(!frame){lastFrame=performance.now();frame=requestAnimationFrame(animate)}}
  function insidePolygon(point,points){
    let inside=false;
    for(let i=0,j=points.length-1;i<points.length;j=i++){
      const a=points[i],b=points[j];
      if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
    }
    return inside;
  }
  function faceAt(point){
    for(let i=visibleFaces.length-1;i>=0;i--){
      const face=visibleFaces[i];
      if(insidePolygon(point,face.screen))return face;
    }
    return null;
  }
  function clipSegment(a,b){
    let lo=0,hi=1;
    for(let axis=0;axis<2;axis++){
      const delta=b[axis]-a[axis],limit=axis===0?W:H;
      if(Math.abs(delta)<.0001){if(a[axis]<0||a[axis]>limit)return null;continue}
      let near=-a[axis]/delta,far=(limit-a[axis])/delta;
      if(near>far)[near,far]=[far,near];
      lo=Math.max(lo,near);hi=Math.min(hi,far);
      if(lo>hi)return null;
    }
    return [lo,hi];
  }
  function sample(event){
    if(event.pointerType!=='mouse'||!allow.matches||!inView||document.hidden||pendingLink){previousPointer=null;return}
    const current={x:event.clientX,y:event.clientY,time:event.timeStamp};
    const previous=previousPointer;previousPointer=current;
    if(!previous)return;
    const elapsed=(current.time-previous.time)/1000;
    // Ignore an initial cursor jump or a stale event after switching windows.
    if(elapsed<=0||elapsed>.12)return;
    const rect=canvas.getBoundingClientRect();
    const a=[(previous.x-rect.left)*W/rect.width,(previous.y-rect.top)*H/rect.height];
    const b=[(current.x-rect.left)*W/rect.width,(current.y-rect.top)*H/rect.height];
    const dx=b[0]-a[0],dy=b[1]-a[1],distance=Math.hypot(dx,dy);
    if(distance<.1)return;
    const speed = Math.min(2200, distance / elapsed);
    if (speed <= minPointerSpeed) return;
    const targetSpeed = maxBlockSpeed * (1 - Math.exp(-(speed - minPointerSpeed) / 175));
    const clipped=clipSegment(a,b);if(!clipped)return;
    const [lo,hi]=clipped,contactDistance=distance*(hi-lo);
    // Swept sampling catches quick strokes that cross a block between events.
    const steps=Math.max(1,Math.ceil(contactDistance/1.5)),hits=new Map();
    for(let i=0;i<steps;i++){
      const t=lo+(hi-lo)*(i+.5)/steps;
      const point=[a[0]+dx*t,a[1]+dy*t],face=faceAt(point);
      if(face){
        const hit=hits.get(face.block)||{length:0,point:pointOnFace(point,face)};
        hit.length+=contactDistance/steps;hits.set(face.block,hit);
      }
    }
    // Only the main contact receives a push, even when one fast event crosses several blocks.
    let contact;
    for (const entry of hits) {
      if (!contact || entry[1].length > contact[1].length) contact = entry;
    }
    if (!contact) return;
    const [block, hit] = contact;
    const { position, velocity, angularVelocity } = block.body;
    const direction = unit([ca*dx+sa*dy/se, 0, -sa*dx+ca*dy/se]);
    // A continuous shove can follow neighboring blocks. Rapid reversals get a short pause.
    const reversing = lastPush && dot(lastPush.direction, direction) < .2;
    if (reversing && current.time - lastPush.time < directionChangeDelay) return;
    const forwardSpeed = dot(direction, [velocity.x, velocity.y, velocity.z]);
    const speedGap = targetSpeed - Math.max(0, forwardSpeed);
    const strength = Math.min(maxPushImpulse, speedGap) * Math.min(1, hit.length / 5);
    if (strength <= 0) return;

    const point = mix([position.x, position.y, position.z], hit.point, .7);
    model.push(block, mul(direction, strength), point);
    if (velocity.length() > maxBlockSpeed) velocity.scale(maxBlockSpeed / velocity.length(), velocity);
    if (angularVelocity.length() > maxSpin) angularVelocity.scale(maxSpin / angularVelocity.length(), angularVelocity);
    lastPush = { direction, time: current.time };
    wake();
  }
  addEventListener('pointermove',event=>{
    const samples=event.getCoalescedEvents?.();
    if(samples?.length) samples.forEach(sample);else sample(event);
  },{passive:true});
  // Scrolling must never be interpreted as a cursor collision.
  addEventListener('scroll',()=>{previousPointer=null},{passive:true});
  addEventListener('blur',pause);
  addEventListener('focus',resume);
  allow.addEventListener('change',()=>{pause();resume()});
  new IntersectionObserver(entries=>{
    inView=entries[0].isIntersecting;
    if(!inView)pause();else resume();
  }).observe(canvas);
  new ResizeObserver(()=>{previousPointer=null;render()}).observe(row);
  // The gutter changes even when the content has reached its maximum width.
  addEventListener('resize',()=>{previousPointer=null;render()});
  addEventListener('pagehide',pause);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();else resume()});
  render();
})();
