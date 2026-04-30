/* LEAD portal — interaction layer
   - Constellation background
   - Sandbox: drag blue node to green node → reveals waitlist focus
   - Waitlist submission to /api/waitlist
*/

const CFG = {
  api: window.LEAD_API || 'https://api.cwleaders.com'
};

document.getElementById('yr').textContent = new Date().getFullYear();

// ---------- Constellation -------------------------------------------------
(() => {
  const cv = document.getElementById('constellation');
  if (!cv) return;
  // Skip entirely on small screens (perf + battery on phones)
  // and respect prefers-reduced-motion.
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || innerWidth < 760) return;
  const ctx = cv.getContext('2d');
  let pts = [], W=0, H=0, mouseX=-9999, mouseY=-9999;
  const dpr = Math.min(devicePixelRatio || 1, 2); // cap DPR for high-density iPhones

  function resize() {
    W = cv.width  = innerWidth  * dpr;
    H = cv.height = innerHeight * dpr;
    cv.style.width  = innerWidth + 'px';
    cv.style.height = innerHeight + 'px';
    const count = innerWidth < 1100 ? 40 : 70;
    pts = Array.from({length: count}, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random()-0.5) * 0.3 * dpr,
      vy: (Math.random()-0.5) * 0.3 * dpr,
      r: (Math.random() * 1.4 + 0.4) * dpr
    }));
  }
  resize();
  addEventListener('resize', resize);
  addEventListener('mousemove', e => {
    mouseX = e.clientX * dpr;
    mouseY = e.clientY * dpr;
  });

  function tick() {
    ctx.clearRect(0,0,W,H);
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x<0||p.x>W) p.vx *= -1;
      if (p.y<0||p.y>H) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(192,132,252,0.45)';
      ctx.fill();
    }
    // links
    for (let i=0;i<pts.length;i++) {
      for (let j=i+1;j<pts.length;j++) {
        const dx=pts[i].x-pts[j].x, dy=pts[i].y-pts[j].y, d=Math.hypot(dx,dy);
        if (d < 130*dpr) {
          ctx.strokeStyle = `rgba(79,140,255,${0.16*(1-d/(130*dpr))})`;
          ctx.lineWidth = dpr * 0.6;
          ctx.beginPath(); ctx.moveTo(pts[i].x,pts[i].y); ctx.lineTo(pts[j].x,pts[j].y); ctx.stroke();
        }
      }
      // mouse pull
      const mdx = pts[i].x - mouseX, mdy = pts[i].y - mouseY, md = Math.hypot(mdx,mdy);
      if (md < 180*dpr) {
        ctx.strokeStyle = `rgba(251,191,36,${0.18*(1-md/(180*dpr))})`;
        ctx.lineWidth = dpr * 0.8;
        ctx.beginPath(); ctx.moveTo(pts[i].x,pts[i].y); ctx.lineTo(mouseX,mouseY); ctx.stroke();
      }
    }
    requestAnimationFrame(tick);
  }
  tick();
})();

// ---------- Sandbox -------------------------------------------------------
(() => {
  const svg = document.getElementById('sandbox-svg');
  const blue = document.getElementById('node-blue');
  const green = document.getElementById('node-green');
  const thread = document.getElementById('thread');
  const sandbox = svg.parentElement;
  const hint = document.getElementById('sandbox-hint');

  let drag = null;
  let blueXY = {x: 80, y: 140};
  const greenXY = {x: 340, y: 200};

  function svgPoint(evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }
  function curve(a, b) {
    const cx1 = a.x + (b.x - a.x) * 0.4;
    const cx2 = a.x + (b.x - a.x) * 0.6;
    return `M${a.x},${a.y} C${cx1},${a.y} ${cx2},${b.y} ${b.x},${b.y}`;
  }
  function update() {
    blue.setAttribute('transform', `translate(${blueXY.x},${blueXY.y})`);
    thread.setAttribute('d', curve(blueXY, greenXY));
    const dist = Math.hypot(blueXY.x - greenXY.x, blueXY.y - greenXY.y);
    if (dist < 36) solve();
  }
  function solve() {
    if (sandbox.classList.contains('solved')) return;
    sandbox.classList.add('solved');
    thread.setAttribute('stroke', 'var(--c-theory)');
    thread.setAttribute('stroke-dasharray', '0');
    hint.textContent = '✓ You just did visual learning. Get early access below.';
    setTimeout(() => {
      document.querySelector('#waitlist input').focus({preventScroll: true});
    }, 600);
  }

  blue.addEventListener('pointerdown', e => {
    drag = svgPoint(e);
    blue.setPointerCapture(e.pointerId);
  });
  blue.addEventListener('pointermove', e => {
    if (!drag) return;
    const p = svgPoint(e);
    blueXY = {x: Math.max(20, Math.min(400, p.x)), y: Math.max(20, Math.min(260, p.y))};
    update();
  });
  blue.addEventListener('pointerup', () => { drag = null; });

  thread.setAttribute('d', curve(blueXY, greenXY));
})();

// ---------- Account button ------------------------------------------------
(() => {
  const link = document.getElementById('account-link');
  function refresh() {
    const u = LEAD.Auth.user;
    if (u) {
      link.outerHTML = `<a href="/unlock" class="lead-account-btn"><span class="avi">${u.email[0].toUpperCase()}</span><span>${u.email.split('@')[0]}</span></a>`;
    }
  }
  if (link) {
    link.onclick = e => { e.preventDefault(); LEAD.openAuth({ onSuccess: refresh }); };
  }
  refresh();
  document.addEventListener('lead-auth-change', refresh);
})();

// ---------- Buy buttons ---------------------------------------------------
document.querySelectorAll('button[data-buy]').forEach(btn => {
  btn.addEventListener('click', () => {
    const tier = btn.getAttribute('data-buy');
    LEAD.checkout(tier);
  });
});

// ---------- Waitlist ------------------------------------------------------
(() => {
  const form = document.getElementById('waitlist');
  const note = document.getElementById('formnote');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = form.querySelector('button');
    const input = form.querySelector('input');
    const email = input.value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      note.textContent = 'That email looks off — give it another shot.';
      note.className = 'formnote error';
      return;
    }
    btn.disabled = true;
    note.textContent = 'Reserving your spot…';
    note.className = 'formnote';
    try {
      const r = await fetch(`${CFG.api}/waitlist`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          email,
          source: 'lead.cwleaders.com',
          referrer: document.referrer || null,
          utm: Object.fromEntries(new URLSearchParams(location.search))
        })
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      note.textContent = '✓ You\'re on the list. Watch your inbox.';
      note.className = 'formnote success';
      input.value = '';
    } catch (err) {
      note.textContent = 'Couldn\'t reach the server. Try again in a moment.';
      note.className = 'formnote error';
    } finally {
      btn.disabled = false;
    }
  });
})();
