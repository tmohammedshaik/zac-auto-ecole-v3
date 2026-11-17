/* ZAC v3 refondue : film piloté au défilement (méthode v2), paddock glissé, entrée dans le box,
   tableau de bord (compteur, secteurs, mini-carte), inscription Netlify en 2 temps. */
(() => {
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const sm = (p, a, b) => { const t = clamp((p - a) / (b - a)); return t * t * (3 - 2 * t); };
const root = document.documentElement;
const fixe = root.classList.contains('static');
const tel = () => innerWidth <= 820;

/* ---- Écriture DOM seulement quand la valeur change ---- */
const cache = new WeakMap();
const put = (el, prop, val) => {
  let c = cache.get(el); if (!c) cache.set(el, c = {});
  if (c[prop] === val) return; c[prop] = val;
  if (prop.startsWith('--')) el.style.setProperty(prop, val); else el.style[prop] = val;
};
const tog = (el, cls, on) => { if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on); };

/* ---- Titres découpés en mots (lecteur d'écran : la phrase entière) ---- */
$$('.split').forEach(el => {
  const sr = document.createElement('span'); sr.className = 'sr'; sr.textContent = el.textContent.trim();
  const vis = document.createElement('span'); vis.setAttribute('aria-hidden', 'true');
  let i = 0;
  [...el.childNodes].forEach(n => {
    const em = n.nodeType === 1;
    n.textContent.split(/(\s+)/).forEach(w => {
      if (!w) return;
      if (/^\s+$/.test(w)) { vis.append(' '); return; }
      const s = document.createElement('span'); s.className = 'w'; s.textContent = w;
      s.style.setProperty('--i', i); s.style.setProperty('--th', (i * 0.09).toFixed(3));
      if (em) { const e = document.createElement('em'); e.append(s); vis.append(e); } else vis.append(s);
      i++;
    });
  });
  el.textContent = ''; el.append(sr, vis);
});

/* ================= LE FILM ================= */
const FILMS = $$('.film').map(sec => {
  const stage = $('.stage', sec);
  const plans = $$('.plan', stage).map(el => {
    const P = { el, a: +el.dataset.a, b: +el.dataset.b, name: el.dataset.plan, iris: el.classList.contains('iris') };
    const poster = el.dataset.poster || el.dataset.ken || el.dataset.fixe;
    if (el.dataset.seq) {
      // côtés flous sur ordinateur : un petit canevas qui suit la vidéo (lumière d'ambiance)
      P.fc = document.createElement('canvas'); P.fc.className = 'fond'; P.fc.width = 48; P.fc.height = 27; P.fctx = P.fc.getContext('2d'); el.prepend(P.fc);
      P.seq = { name: el.dataset.seq, n: 61, frames: [], started: false, want: 0, last: -1 };
      P.cv = document.createElement('canvas'); P.cv.className = 'm'; P.ctx = P.cv.getContext('2d'); el.append(P.cv);
      const pi = new Image(); pi.src = poster; pi.onload = () => { if (!P.seq.frames[0]) { P.seq.frames[0] = pi; drawSeq(P, P.seq.want, true); } };
    } else {
      const fond = new Image(); fond.className = 'fond'; fond.alt = ''; fond.src = poster; el.prepend(fond);
    }
    if (!el.dataset.seq && (el.dataset.ken || el.dataset.fixe)) {
      // ponytail: le choix 9:16 / 16:9 se fait au chargement ; un passage téléphone <-> ordinateur demande un rechargement
      const large = el.dataset.large && !tel();
      if (large) el.classList.add('large');
      const img = new Image(); img.className = 'm'; img.alt = ''; img.src = large ? el.dataset.large : poster; el.append(img); P.img = img;
    }
    return P;
  });
  const bands = $$('.band', stage).map(el => ({ el, a: +el.dataset.a, b: +el.dataset.b, hold: el.hasAttribute('data-hold'), op: -1, k: -1, vis: null }));
  const shows = $$('[data-show]', stage).map(el => ({ el, plan: el.dataset.show }));
  return { sec, stage, plans, bands, shows, voile: $('.voile', stage), t: 0, s: 0, near: false,
    feux: $$('.feux-film i', stage), etapes: $$('#etapesFilm li', stage) };
});

/* Hauteur des films : téléphone / ordinateur */
function hauteurs() {
  $$('[data-h]').forEach(s => {
    const [m, d] = s.dataset.h.split(',');
    s.style.height = fixe ? '' : (tel() ? m : d) + 'vh';
  });
}

/* Séquences d'images sur canevas : aucun « seek » vidéo (saccades iPhone) */
function ensure(P) {
  const S = P.seq; if (S.started) return; S.started = true;
  const order = []; for (const st of [8, 4, 2, 1]) for (let i = 0; i < S.n; i += st) if (!order.includes(i)) order.push(i);
  let next = 0, active = 0;
  const pump = () => {
    while (active < 6 && next < order.length) {
      const i = order[next++], img = new Image(); active++; img.decoding = 'async';
      img.onload = () => { active--; S.frames[i] = img; if (Math.abs(i - S.want) < 3) drawSeq(P, S.want, true); pump(); };
      img.onerror = () => { active--; pump(); };
      img.src = `assets/seq/${S.name}/f${String(i + 1).padStart(3, '0')}.webp`;
    }
  };
  pump();
}
function sizeCanvas() {
  const dpr = Math.min(devicePixelRatio || 1, 1.75);
  FILMS.forEach(F => F.plans.forEach(P => { if (!P.cv) return;
    const r = P.cv.getBoundingClientRect(); P.cv.width = Math.round(r.width * dpr); P.cv.height = Math.round(r.height * dpr); P.seq.last = -1; drawSeq(P, P.seq.want, true); }));
}
function drawSeq(P, i, force) {
  const S = P.seq; S.want = i;
  let f = S.frames[i], j = i;
  if (!f) for (let d = 1; d < S.n; d++) { if (S.frames[i - d]) { f = S.frames[j = i - d]; break; } if (S.frames[i + d]) { f = S.frames[j = i + d]; break; } }
  if (!f || !f.naturalWidth || (!force && j === S.last)) return;
  S.last = j;
  const W = P.cv.width, H = P.cv.height; if (!W) return;
  const s = Math.max(W / f.naturalWidth, H / f.naturalHeight), w = f.naturalWidth * s, h = f.naturalHeight * s;
  P.ctx.drawImage(f, (W - w) / 2, (H - h) / 2, w, h);
  if (!tel()) { const k = Math.max(48 / f.naturalWidth, 27 / f.naturalHeight); P.fctx.drawImage(f, (48 - f.naturalWidth * k) / 2, (27 - f.naturalHeight * k) / 2, f.naturalWidth * k, f.naturalHeight * k); }
}

const ALLUME = [.18, .32, .46, .6, .74], ETEINT = .9;

function render(F, p, now) {
  let courant = null;
  for (const P of F.plans) {
    const on = p >= P.a - .001 && p <= P.b;
    let op = 0;
    if (on) {
      if (P.iris) {
        const wx = sm(p, P.a, P.a + .1) * 130;
        put(P.el, 'clipPath', wx >= 130 ? 'none' : `polygon(0 0,${wx.toFixed(2)}% 0,${(wx - 22).toFixed(2)}% 100%,0 100%)`);
        op = 1;
      } else op = P.a <= 0 || P.el.classList.contains('decor') ? 1 : sm(p, P.a, P.a + .04);
      if (op > .5) courant = P;
    }
    put(P.el, 'opacity', op.toFixed(3));
    put(P.el, 'visibility', op > 0 ? 'visible' : 'hidden');
    const l = clamp((p - P.a) / (P.b - P.a));
    if (P.seq) { if (on) { ensure(P); drawSeq(P, Math.round(l * (P.seq.n - 1))); } }
    if (P.el.dataset.ken) put(P.img, 'transform', `scale(${(1.02 + l * .08).toFixed(4)})`);
  }
  // Les feux du logo : un par étape, au rythme du doigt ; extinction = départ
  const p3 = F.plans.find(P => P.name === 'P3');
  if (p3 && F.feux.length) {
    const l = clamp((p - p3.a) / (p3.b - p3.a));
    const n = l >= ETEINT ? 0 : ALLUME.filter(a => l >= a).length;
    F.feux.forEach((f, i) => tog(f, 'on', i < n));
    F.etapes.forEach((li, i) => tog(li, 'on', l >= ETEINT || i < n));
  }
  F.shows.forEach(S => put(S.el, 'opacity', courant && courant.name === S.plan ? '1' : '0'));
  if (F.sec.id === 'film1') acteA(p, now);
  if (F.voile) put(F.voile, 'opacity', (F.sec.id === 'film1' ? sm(p, .4, .46) : 1).toFixed(3));

  for (const B of F.bands) {
    const f = Math.min(.025, (B.b - B.a) / 3);
    const op = B.hold && p <= B.a + .001 ? 1 : B.b > 1 ? sm(p, B.a, B.a + f) : (B.hold ? 1 : sm(p, B.a, B.a + f)) * (1 - sm(p, B.b - f, B.b));
    const k = B.hold ? 1 : clamp((p - B.a) / Math.min(.04, (B.b - B.a) * .4));
    if (Math.abs(op - B.op) > .004 || (op === 0) !== (B.op === 0)) { B.op = op; B.el.style.opacity = op.toFixed(3); }
    if (Math.abs(k - B.k) > .008 || (k === 1 && B.k !== 1) || (k === 0 && B.k !== 0)) { B.k = k; B.el.style.setProperty('--k', k.toFixed(3)); }
    const v = op > .5; if (v !== B.vis) { B.vis = v; tog(B.el, 'vis', v); }
  }
}
const t0 = performance.now();

/* Acte A : page blanche, la monoplace arrive en 3D au chargement ; au défilement elle se pose à sa place exacte
   dans le décor du stand (S1, même voiture au pixel près), puis le stand s'ouvre en cercle autour d'elle. Aucun changement d'image. */
const A = { el: $('#acteA'), voiture: $('#voiture'), file: $('#voiture .file'), intro: $('#intro'), geant: $('#acteA .geant'), vitesse: $('#acteA .vitesse'), indice: $('#acteA .indice'), piste: $('#acteA .piste') };
// la voiture dans le décor (x, y, largeur, hauteur) : K5.jpg, téléphone et ordinateur
// Téléphone : la voiture se loge dans l'espace libre entre le titre et le texte, quelle que soit la hauteur visible
function placerVoiture() {
  const vo = A.voiture, pi = A.piste;
  if (!tel()) { vo.style.cssText = ''; pi.style.top = ''; pi.style.bottom = ''; return; }
  const h1 = $('h1', A.intro), cote = $('.intro-cote', A.intro);
  const haut = A.intro.offsetTop + h1.offsetTop + h1.offsetHeight + 10, bas = A.intro.offsetTop + cote.offsetTop - 14;
  const w = Math.min(innerWidth * .94, Math.max(70, bas - haut) * 3.72), h = w / 3.72;
  Object.assign(vo.style, { width: w + 'px', marginLeft: -w / 2 + 'px', bottom: 'auto', top: (haut + (bas - haut - h) / 2) + 'px' });
  Object.assign(pi.style, { bottom: 'auto', top: (haut + (bas - haut + h) / 2 - 6) + 'px' });
}
placerVoiture(); document.fonts && document.fonts.ready.then(placerVoiture);
const DEC = { box: [42, 606, 640, 172], W: 720, H: 1290 }; // la voiture dans K5 (première image de P5), roues alignées
function cibleVoiture(img) {
  const r = img.getBoundingClientRect(), s = Math.max(r.width / DEC.W, r.height / DEC.H);
  const ox = r.left + (r.width - DEC.W * s) / 2, oy = r.top + (r.height - DEC.H * s) / 2, [x, y, w, h] = DEC.box;
  return { x: ox + x * s, y: oy + y * s, w: w * s, h: h * s };
}
function acteA(p, now) {
  const D = FILMS[0].plans.find(P => P.name === 'S');
  const load = 1 - Math.pow(1 - clamp((now - t0 - 200) / 1500), 4);
  const pose = sm(p, .07, .16), q = sm(p, .16, .38), ken = sm(p, .38, 1);
  // décor : léger recul de caméra pendant l'ouverture, puis lente avancée
  const z = 1 + (1 - q) * .14 + ken * .05;
  const vo = A.voiture, base = vo.offsetWidth ? { x: vo.offsetLeft + A.el.getBoundingClientRect().left, y: vo.offsetTop + A.el.getBoundingClientRect().top, w: vo.offsetWidth } : null;
  let dx = 0, dy = 0, k = 1;
  if (D && D.img && D.img.naturalWidth && base) {
    const c = cibleVoiture(D.img);
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2, ir = D.img.getBoundingClientRect();
    if (!D.orig) { D.orig = 1; D.img.style.setProperty('--ox', `${((cx - ir.left) / ir.width * 100).toFixed(2)}%`); D.img.style.setProperty('--oy', `${((cy - ir.top) / ir.height * 100).toFixed(2)}%`); }
    put(D.img, 'transform', `scale(${z.toFixed(4)})`);
    const c2 = cibleVoiture(D.img);
    dx = (c2.x - base.x) * pose; dy = (c2.y - base.y) * pose; k = 1 + (c2.w / base.w - 1) * pose;
    put(D.el, 'clipPath', q >= 1 ? 'none' : `circle(${(q * 150).toFixed(2)}vmax at ${cx.toFixed(0)}px ${cy.toFixed(0)}px)`);
  }
  const rot = (1 - load) * -34 + Math.sin(pose * Math.PI) * -10;
  const zz = (1 - load) * -320;
  put(vo, 'transform', `translate3d(${dx.toFixed(1)}px,${dy.toFixed(1)}px,0) scale(${k.toFixed(4)}) translate3d(${((1 - load) * 115).toFixed(2)}vw,0,${zz.toFixed(1)}px) rotateY(${rot.toFixed(2)}deg)`);
  put(vo, 'opacity', (1 - sm(p, .3, .42)).toFixed(3));
  put(A.file, 'opacity', Math.max(1 - load, Math.sin(pose * Math.PI) * .18).toFixed(3));
  tog(document.body, 'page-blanche', p < .2);
  put(A.vitesse, 'opacity', Math.max((1 - load) * .9, pose > 0 && pose < 1 ? 1 : 0).toFixed(3));
  put(A.geant, 'transform', `translate3d(${((1 - load) * 20 - pose * 30).toFixed(2)}vw,0,0)`);
  put(A.geant, 'opacity', (1 - pose).toFixed(3));
  put(A.piste, 'opacity', (1 - pose).toFixed(3));
  const ia = 1 - sm(p, .02, .08);
  put(A.intro, 'opacity', ia.toFixed(3));
  put(A.intro, 'transform', `translate3d(0,${((1 - ia) * -60).toFixed(1)}px,0)`);
  put(A.indice, 'opacity', (1 - sm(p, 0, .03)).toFixed(3));
  put(A.el, 'visibility', p > .43 ? 'hidden' : 'visible');
}
const filmP = F => { const r = F.sec.getBoundingClientRect(); return clamp(-r.top / Math.max(1, r.height - innerHeight)); };
FILMS.forEach(F => new IntersectionObserver(e => { F.near = e[0].isIntersecting; if (F.near) wake(); }, { rootMargin: '100% 0px' }).observe(F.sec));

/* ================= LE PADDOCK ================= */
const ECURIES = [
  { n: 'Boîte manuelle', id: 'boite-manuelle', c: '#e3121b', img: 'B1', entree: 'E1', interieur: 'B1-in', sub: 'La plus complète : tu sauras conduire toutes les voitures.', f: [
    ['Boîte manuelle', ['20 heures minimum (le minimum légal, ton évaluation dit ton vrai besoin)', 'Code en salle et en ligne', 'Leçons de 50 min tôt le matin, en journée, le soir ou le samedi', 'Ton moniteur avec toi à l\'examen', 'Démarches ANTS faites par l\'école']]] },
  { n: 'Automatique', id: 'boite-automatique', c: '#1f6fe0', img: 'B2', interieur: 'B2-in', sub: 'Sans embrayage, 13 heures minimum au lieu de 20.', f: [
    ['Boîte automatique', ['13 heures minimum', 'Code, examen et démarches ANTS comme en manuelle', 'Passerelle possible plus tard']],
    ['Passerelle automatique vers manuelle', ['Après 3 mois de permis automatique', '7 heures, sans nouvel examen']]] },
  { n: 'Accompagnée', id: 'conduite-accompagnee', c: '#f2c200', img: 'B3', interieur: 'B3-in', sub: 'Dès 15 ans, avec un proche à côté, pour arriver à l\'examen avec de la route.', f: [
    ['Conduite accompagnée (AAC)', ['Dès 15 ans', 'Code et 20 heures', 'Rendez-vous préalable de 2 heures', '2 rendez-vous pédagogiques', 'Au moins 3 000 km sur au moins un an', 'Période probatoire plus courte']],
    ['Conduite supervisée', ['Après la formation initiale', 'Rendez-vous préalable', 'De l\'expérience avec un proche avant l\'examen']]] },
  { n: 'Accéléré', id: 'permis-accelere', c: '#d8d8d8', img: 'B4', interieur: 'B4-in', sub: 'Code et conduite rapprochés, sans brûler les étapes.', f: [
    ['Permis accéléré', ['Leçons rapprochées', 'Date d\'examen recherchée dès ton inscription']],
    ['Stage de code accéléré', ['Séances rapprochées en salle et en ligne', 'Examen du code : 30 € (tarif de l\'État, payé à l\'organisme)']]] },
  { n: 'Code seul', id: 'code-seul', c: '#19a35b', img: 'B5', interieur: 'B5-in', sub: 'En salle et sur ton téléphone, on t\'aide à réserver l\'examen.', f: [
    ['Code seul', ['En salle et en ligne', 'Aide pour réserver l\'examen', 'Conduite ensuite ici ou ailleurs']]] },
  { n: 'Scooter AM', id: 'scooter-am', c: '#ff7a00', img: 'B6', entree: 'E6', interieur: 'B6-in', sub: 'Dès 14 ans, 8 heures minimum.', f: [
    ['Permis AM (scooter)', ['Dès 14 ans', '8 heures minimum', 'ASSR 1 ou 2, ou ASR']]] },
  { n: 'Après le permis', id: 'apres-le-permis', c: '#7b3fe4', img: 'B7', interieur: 'B7-in', sub: 'Reprendre le volant, à ton rythme.', f: [
    ['Remise à niveau et perfectionnement', ['Point sur ton niveau', 'Leçons de 50 min à 60 €']],
    ['Conduite pour seniors', ['Nouveaux panneaux, ronds-points, voie rapide', 'Leçons calmes au moment choisi']],
    ['Formation post-permis', ['6 à 12 mois après le permis, 7 heures en groupe', 'Raccourcit la période probatoire seulement si l\'école est certifiée (certification en cours)']]] },
  { n: 'Pas sûr ?', id: 'conseil', c: '#8a8a8a', img: 'B8', interieur: 'B8-in', conseil: true, sub: 'On te conseille. Laisse ton numéro, on te rappelle dans l\'heure.' }
];
const pad = $('#paddock'), track = $('#track'), pills = $('#pills');
const boxes = ECURIES.map((e, i) => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'box'; b.style.setProperty('--c', e.c);
  b.innerHTML = `<span class="vitre"><img src="assets/box/${e.img}.jpg" alt="" loading="lazy" width="720" height="1280"></span>
    <span class="panneau">${e.n}</span>
    <span class="sub"><span class="num lbl">${i < 7 ? 'Box ' + (i + 1) + '/7' : 'Box ?'}</span><span>${e.sub}</span><b class="entrer">${e.conseil ? 'Être conseillé' : 'Entrer dans le box'} →</b></span>`;
  b.addEventListener('click', () => e.conseil ? conseil(e) : entrer(e, b));
  track.append(b);
  const p = document.createElement('button');
  p.type = 'button'; p.style.setProperty('--c', e.c);
  p.innerHTML = `<i></i>${e.n}`;
  p.addEventListener('click', () => allerAuBox(i));
  pills.append(p);
  return b;
});
let padMax = 0;
function mesurePaddock() { padMax = Math.max(0, track.scrollWidth - track.parentElement.clientWidth); }
const padP = () => { const r = pad.getBoundingClientRect(); return clamp(-r.top / Math.max(1, r.height - innerHeight)); };
let padIdx = -1;
function renderPaddock(p) {
  put(track, 'transform', `translate3d(${(-p * padMax).toFixed(1)}px,0,0)`);
  const idx = Math.round(p * (boxes.length - 1));
  if (idx !== padIdx) {
    padIdx = idx;
    boxes.forEach((b, i) => tog(b, 'actif', i === idx));
    [...pills.children].forEach((x, i) => x.setAttribute('aria-current', i === idx));
    const c = pills.children[idx]; // jamais scrollIntoView : il ferait défiler la page entière
    pills.scrollTo({ left: c.offsetLeft - (pills.clientWidth - c.offsetWidth) / 2, behavior: 'smooth' });
  }
}
function allerAuBox(i) {
  if (fixe) { boxes[i].scrollIntoView({ inline: 'center', block: 'nearest' }); return; }
  const top = pad.offsetTop + (i / (boxes.length - 1)) * (pad.offsetHeight - innerHeight);
  scrollTo({ top, behavior: 'smooth' });
}
// Calage doux : à l'arrêt du doigt, le box le plus proche se centre
let calTimer;
function calage() {
  clearTimeout(calTimer);
  calTimer = setTimeout(() => {
    const r = pad.getBoundingClientRect();
    const p = padP();
    if (r.top > 0 || r.bottom < innerHeight || p < .02 || p > .98) return; // jamais à l'entrée ni à la sortie du paddock
    const i = Math.round(p * (boxes.length - 1));
    const top = pad.offsetTop + (i / (boxes.length - 1)) * (pad.offsetHeight - innerHeight);
    if (Math.abs(top - scrollY) > 6) scrollTo({ top, behavior: 'smooth' });
  }, 260);
}

/* ================= ENTRÉE DANS LE BOX, BUREAU DES INGÉNIEURS ================= */
const ent = $('#entree'), eBox = $('#eBox'), eIn = $('#eIn'), rideau = $('#rideau'), cadre = $('#cadre'), dlg = $('#bureau');
let boxOrigine = null, anims = [];
/* Entrée filmée (vraie vidéo, image par image) : la caméra entre dans le box jusqu'au mur des ingénieurs */
const films = {};
function chargeFilm(nom) {
  if (films[nom]) return films[nom];
  const F = films[nom] = { frames: [], n: 61 };
  for (let i = 0; i < F.n; i++) { const im = new Image(); im.decoding = 'async'; im.src = `assets/seq/${nom}/f${String(i + 1).padStart(3, '0')}.webp`; F.frames[i] = im; }
  return F;
}
new IntersectionObserver(es => { if (es[0].isIntersecting) ECURIES.forEach(e => e.entree && chargeFilm(e.entree)); }, { rootMargin: '100% 0px' }).observe(pad);
const eFilm = document.createElement('canvas'); eFilm.className = 'e-film'; ent.append(eFilm);
let filmStop = null;
function filmEntree(e, apres = () => ouvrirBureau(e)) {
  const F = chargeFilm(e.entree), ctx = eFilm.getContext('2d'), dpr = Math.min(devicePixelRatio || 1, 1.75);
  eFilm.width = innerWidth * dpr; eFilm.height = innerHeight * dpr;
  ent.classList.add('filme'); ent.hidden = false;
  const D = 2800, debut = performance.now();
  let fini = false;
  const finir = () => { if (fini) return; fini = true; filmStop = null; apres(); };
  filmStop = finir;
  const peindre = now => {
    if (fini) return;
    const t = clamp((now - debut) / D), k = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    let i = Math.round(k * (F.n - 1)), f = F.frames[i];
    while (i > 0 && !(f.complete && f.naturalWidth)) f = F.frames[--i];
    if (f.complete && f.naturalWidth) {
      const W = eFilm.width, H = eFilm.height, tl = tel();
      const s = tl ? Math.max(W / f.naturalWidth, H / f.naturalHeight) : H / f.naturalHeight;
      const w = f.naturalWidth * s, h = f.naturalHeight * s;
      if (tl) ctx.drawImage(f, (W - w) / 2, (H - h) / 2, w, h);
      else { // ordinateur : en attendant la version 16:9, le même film flouté remplit les côtés
        const c = Math.max(W / f.naturalWidth, H / f.naturalHeight);
        ctx.filter = 'blur(40px) brightness(.45)'; ctx.drawImage(f, (W - f.naturalWidth * c) / 2, (H - f.naturalHeight * c) / 2, f.naturalWidth * c, f.naturalHeight * c);
        ctx.filter = 'none'; ctx.drawImage(f, (W - w) / 2, (H - h) / 2, w, h);
      }
    }
    if (t < 1) requestAnimationFrame(peindre); else finir();
  };
  requestAnimationFrame(peindre);
}
function entrer(e, b) {
  boxOrigine = b;
  remplirBureau(e);
  const calme = fixe || matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (calme) return ouvrirBureau(e);
  if (e.entree) return filmEntree(e);
  const r = $('img', b).getBoundingClientRect();
  eBox.src = eIn.src = `assets/box/${e.img}.jpg`;
  Object.assign(eBox.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  Object.assign(cadre.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  ent.style.setProperty('--c', e.c);
  ent.hidden = false;
  const full = { left: '0px', top: '0px', width: innerWidth + 'px', height: innerHeight + 'px' };
  anims = [
    rideau.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-101%)' }], { duration: 520, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' }),
    cadre.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1, delay: 560, fill: 'forwards' }),
    eBox.animate([{ left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', transform: 'scale(1)' },
      { offset: .55, ...full, transform: 'scale(1)' }, { ...full, transform: 'scale(1.45)' }],
      { duration: 1000, delay: 260, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' }),
    ent.animate([{ background: 'rgba(11,11,13,0)' }, { background: 'rgba(11,11,13,.7)' }], { duration: 400, fill: 'forwards' }),
    eIn.animate([{ opacity: 0, transform: 'scale(2.1)' }, { opacity: 1, transform: 'scale(1.75)' }], { duration: 380, delay: 1000, easing: 'ease-out', fill: 'forwards' })
  ];
  anims.at(-1).finished.then(() => ouvrirBureau(e)).catch(() => {});
}
ent.addEventListener('click', () => { if (filmStop) filmStop(); anims.forEach(a => a.finish()); }); // l'entrée se saute d'un toucher
function remplirBureau(e) {
  dlg.style.setProperty('--c', e.c);
  $('#bureau-img').src = `assets/box/${e.interieur || e.img}.jpg`;
  $('#bureau-img').classList.toggle('reel', !!e.interieur);
  $('.provisoire-in').hidden = !!e.interieur;
  $('#bureau-kicker').textContent = 'Bureau des ingénieurs · ton écurie';
  $('#bureau-titre').textContent = e.n;
  $('#bureau-sub').textContent = e.sub;
  $('#bureau-contenu').innerHTML = e.f.map(([t, l], i) =>
    `<details class="formule"><summary>${t}</summary><ul>${l.map(x => `<li>${x}</li>`).join('')}</ul></details>`).join('');
  $('#bureau-go').onclick = () => { choisir(e.f[0][0]); fermerBureau(); };
}
function ouvrirBureau(e) {
  if (!dlg.open) dlg.showModal();
  if (location.hash !== '#' + e.id) history.pushState({ box: e.id }, '', '#' + e.id);
  requestAnimationFrame(() => { ent.hidden = true; ent.classList.remove('filme'); anims.forEach(a => a.cancel()); anims = []; });
}
function fermerBureau() { if (dlg.open) dlg.close(); }
dlg.addEventListener('close', () => {
  if (history.state && history.state.box) history.back();
  if (boxOrigine) boxOrigine.focus({ preventScroll: true });
});
$('.close', dlg).addEventListener('click', fermerBureau);
dlg.addEventListener('click', ev => { if (ev.target === dlg) fermerBureau(); });
addEventListener('popstate', () => { if (dlg.open) dlg.close(); });
// Adresse propre : #boite-manuelle ouvre directement le bureau
const direct = ECURIES.find(e => '#' + e.id === location.hash && !e.conseil);
if (direct) { history.replaceState(null, '', location.pathname); remplirBureau(direct); setTimeout(() => ouvrirBureau(direct), 300); }

function conseil(e) {
  const suite = () => { ent.hidden = true; ent.classList.remove('filme'); choisir('Je ne sais pas encore'); $('#inscription').scrollIntoView({ behavior: 'smooth' }); };
  if (e && e.entree && !fixe && !matchMedia('(prefers-reduced-motion: reduce)').matches) filmEntree(e, suite); else suite();
}
function choisir(f) {
  $('#f1-formation').value = f;
  const c = $('#f1-chosen');
  c.textContent = f === 'Je ne sais pas encore' ? 'On te conseille la bonne formation au téléphone.' : 'Formation choisie : ' + f;
  c.hidden = false;
  $('#miniFeux').children[1].classList.add('on');
}

/* ================= TABLEAU DE BORD ================= */
const dash = $('#dash'), kEl = $('#kmh'), gEl = $('#rapport'), regime = $$('#regime i'), limite = $('#limite'), leve = $('#leve');
const sEls = ['s1', 's2', 's3'].map(id => $('#' + id)), chrono = $('#chrono');
let dernierY = scrollY, dernierT = performance.now(), kmh = 0, kmhAff = -1;
function compteur(now) {
  const dy = Math.abs(scrollY - dernierY), dt = Math.max(16, now - dernierT);
  dernierY = scrollY; dernierT = now;
  const cible = Math.min(200, dy / dt * 55);
  kmh += (cible - kmh) * (cible > kmh ? .2 : .06);
  const v = Math.round(kmh);
  if (v !== kmhAff) {
    kmhAff = v; kEl.textContent = v;
    gEl.textContent = v < 3 ? 'N' : Math.min(8, 1 + Math.floor(v / 25));
    const tr = v < 3 ? 0 : ((v % 25) / 25) * regime.length;
    regime.forEach((r, i) => tog(r, 'on', i < tr));
    tog(limite, 'on', v > 80); tog(leve, 'on', v > 80); tog(dash, 'trop', v > 80);
  }
  return kmh > .5;
}
// Secteurs : S1 film d'ouverture, S2 paddock, S3 tout le reste
function secteurs() {
  const y = scrollY + innerHeight * .5;
  const lim = [$('#film1'), pad, $('#film2')].map(s => s.offsetTop);
  const s = y < lim[1] ? 0 : y < lim[2] ? 1 : 2;
  sEls.forEach((el, i) => { tog(el, 'fait', i < s); tog(el, 'en', i === s); });
}

/* Mini-carte (v2) */
const trace = $('#trace'), vive = $('#vive'), point = $('#point'), reperesG = $('#reperes'), virageTxt = $('#virage'), carte = $('#carte');
const L = trace.getTotalLength();
vive.style.strokeDasharray = L; vive.style.strokeDashoffset = L;
let reperes = [];
function placeReperes() {
  const max = Math.max(1, root.scrollHeight - innerHeight);
  reperesG.textContent = '';
  reperes = $$('[data-virage]').map(el => {
    const f = clamp((el.getBoundingClientRect().top + scrollY) / max), pt = trace.getPointAtLength(f * L * .985);
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('class', 'rep'); c.setAttribute('r', 3.6); c.setAttribute('cx', pt.x); c.setAttribute('cy', pt.y);
    reperesG.append(c);
    return { f, c, txt: el.dataset.virage };
  });
}
let lastVirage = '';
function renderPage(f) {
  const pt = trace.getPointAtLength(f * L * .985);
  put(point, 'transform', `translate(${pt.x.toFixed(1)}px,${pt.y.toFixed(1)}px)`);
  put(vive, 'strokeDashoffset', (L * (1 - f * .985)).toFixed(1));
  let txt = reperes.length ? reperes[0].txt : '';
  reperes.forEach(r => { const on = f + .002 >= r.f; tog(r.c, 'passe', on); if (on) txt = r.txt; });
  if (f >= .995) txt = 'Tour terminé · ta place est libre';
  if (txt !== lastVirage) { lastVirage = txt; virageTxt.textContent = txt; }
  const t = f * 92.4; chrono.textContent = Math.floor(t / 60) + ':' + (t % 60).toFixed(1).padStart(4, '0');
}

/* ================= LA BOUCLE UNIQUE, AMORTIE ================= */
const pageP = () => clamp(scrollY / Math.max(1, root.scrollHeight - innerHeight));
let tP = 0, sP = 0, tPad = 0, sPad = 0, raf = null, last = 0;
function tick(now) {
  const dt = Math.min(100, now - (last || now)); last = now;
  const a = 1 - Math.pow(1 - .14, dt / 16.667);
  let bouge = false;
  for (const F of FILMS) {
    F.s += (F.t - F.s) * a;
    if (Math.abs(F.t - F.s) < .0002) F.s = F.t; else bouge = true;
    if (F.near) render(F, F.s, now);
  }
  sPad += (tPad - sPad) * a; if (Math.abs(tPad - sPad) < .0002) sPad = tPad; else bouge = true;
  renderPaddock(sPad);
  sP += (tP - sP) * a; if (Math.abs(tP - sP) < .0002) sP = tP; else bouge = true;
  renderPage(sP);
  if (compteur(now)) bouge = true;
  if (bouge || now - t0 < 1700) raf = requestAnimationFrame(tick); else { raf = null; last = 0; }
}
const wake = () => { if (raf === null) raf = requestAnimationFrame(tick); };
function onScroll() {
  FILMS.forEach(F => F.t = filmP(F));
  tPad = padP(); tP = pageP();
  secteurs();
  tog(carte, 'mini', tel());
  if (!fixe) calage();
  wake();
}
// Le tableau de bord se range pendant l'inscription (il couvrait les champs)
// Le tableau de bord ne vit que pendant les films et le paddock : il se range ensuite (il couvrait les formulaires)
const filmsVus = new Set();
const ioDash = new IntersectionObserver(es => {
  es.forEach(e => e.isIntersecting ? filmsVus.add(e.target) : filmsVus.delete(e.target));
  const range = filmsVus.size === 0 || filmsVus.has($('#inscription')) || filmsVus.has($('#paddock'));
  tog(dash, 'range', range); tog(carte, 'range', range);
  tog($('.barre'), 'range', filmsVus.has($('#inscription'))); // la barre du bas cachait le formulaire
}, { rootMargin: '0px 0px -60% 0px' });
['film1', 'paddock', 'film2', 'inscription'].forEach(id => ioDash.observe($('#' + id)));

if (fixe) {
  FILMS.forEach(F => { F.near = true; F.s = F.t = F.sec.id === 'film1' ? 0 : 1; render(F, F.s, 1e9); });
  root.classList.add('pret');
} else {
  hauteurs(); requestAnimationFrame(sizeCanvas);
}
addEventListener('scroll', onScroll, { passive: true });
let rz;
addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { FILMS[0].plans.forEach(P => P.orig = 0); placerVoiture(); hauteurs(); sizeCanvas(); mesurePaddock(); placeReperes(); onScroll(); }, 120); });
addEventListener('load', () => { mesurePaddock(); placeReperes(); onScroll(); });
if (document.fonts) document.fonts.ready.then(() => { mesurePaddock(); placeReperes(); onScroll(); });
mesurePaddock(); onScroll();
document.addEventListener('visibilitychange', () => document.body.classList.toggle('pause', document.hidden));

/* Bouton « Couper les animations » (O10) */
const cb = $('#calme');
cb.textContent = fixe ? 'Remettre les animations' : 'Couper les animations';
cb.addEventListener('click', () => { try { localStorage.setItem('zac-calme', fixe ? '0' : '1'); } catch (e) {} location.reload(); });

/* ================= SECTIONS ================= */
$$('[data-i]').forEach(el => el.style.setProperty('--d', el.dataset.i));
const io = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return;
  e.target.classList.add('in'); io.unobserve(e.target);
  setTimeout(() => e.target.classList.add('fini'), 1800);
}), { threshold: .12 });
$$('[data-in]').forEach(s => io.observe(s));

/* Maintiens pour allumer les feux (v2, avec clavier) */
const portique = $('#portique'), tenir = $('#tenir'), feux = $$('.feux i', portique), tour = $$('.tour li');
let hold = 0, holding = false, hraf = null, hlast = 0, go = false;
function drawHold() {
  const n = go ? 5 : Math.min(5, Math.floor(hold * 5 + .001));
  feux.forEach((f, i) => tog(f, 'on', i < n)); tour.forEach((e, i) => tog(e, 'on', i < n));
  tenir.style.setProperty('--h', hold.toFixed(3));
}
function holdTick(now) {
  const dt = Math.min(64, now - (hlast || now)); hlast = now;
  hold = holding ? Math.min(1, hold + dt / 1700) : Math.max(0, hold - dt / 900);
  drawHold();
  if (hold >= 1 && !go) { finir(); hraf = null; return; }
  if (holding || hold > 0) hraf = requestAnimationFrame(holdTick); else { hraf = null; hlast = 0; }
}
function finir() { go = true; hold = 1; drawHold(); setTimeout(() => portique.classList.add('go'), fixe ? 0 : 450); }
const start = e => { if (go) return; if (e) e.preventDefault(); holding = true; if (!hraf) hraf = requestAnimationFrame(holdTick); };
const stop = () => { holding = false; };
tenir.addEventListener('pointerdown', e => { tenir.setPointerCapture?.(e.pointerId); start(e); });
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => tenir.addEventListener(t, stop));
tenir.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) start(e); });
tenir.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') stop(); });
tenir.addEventListener('contextmenu', e => e.preventDefault());
if (fixe) finir();

/* FAQ radio : une seule réponse ouverte à la fois, puis toutes les questions */
$$('#faq details').forEach(d => d.addEventListener('toggle', () => { if (d.open) $$('#faq details').forEach(o => o !== d && (o.open = false)); }));
$('#faq-btn').addEventListener('click', ev => { $('#faq-more').hidden = false; ev.currentTarget.remove(); });

/* Dossier : la liste cochée reste sur le téléphone */
const coches = $$('#coche input');
try { const m = JSON.parse(localStorage.getItem('zac-dossier') || '[]'); coches.forEach((c, i) => c.checked = !!m[i]); } catch (e) {}
coches.forEach(c => c.addEventListener('change', () => { try { localStorage.setItem('zac-dossier', JSON.stringify(coches.map(x => x.checked))); } catch (e) {} }));

/* Inscription (D49) : prénom + téléphone suffisent ; parent si mineur */
$('#mineur').addEventListener('change', ev => { $('#parent').hidden = !ev.target.checked; });
const encode = f => new URLSearchParams(new FormData(f)).toString();
const DEMO = location.hostname.endsWith('github.io'); // aperçu client : rien ne part, et on le dit
async function envoyer(f) {
  if (DEMO) return;
  const r = await fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: encode(f) });
  if (!r.ok) throw new Error(r.status);
}
$('#f1').addEventListener('submit', async ev => {
  ev.preventDefault();
  const f = ev.currentTarget, bt = $('button', f);
  bt.disabled = true; bt.textContent = 'Envoi…';
  try {
    await envoyer(f);
    $('#merci-prenom').textContent = f.prenom.value.trim();
    $('#f2-tel').value = f.telephone.value;
    if (f.formation.value) $('#f2-formation').value = f.formation.value;
    f.hidden = true; $('#merci').hidden = false;
    if (DEMO) $('#merci').insertAdjacentHTML('beforeend', '<p class="lbl">Aperçu de démonstration : sur le vrai site, cette demande arrivera directement à l’école.</p>');
    $$('#miniFeux i').forEach(i => i.classList.add('on'));
  } catch {
    bt.disabled = false; bt.textContent = 'Être rappelé';
    alert('L\'envoi n\'a pas marché. Appelle-nous au 07 67 56 11 21, on répond tout de suite.');
  }
});
$('#f2').addEventListener('submit', async ev => {
  ev.preventDefault();
  const f = ev.currentTarget;
  try { await envoyer(f); } catch { $('#f2-ok').textContent = 'L’envoi n’a pas marché. Donne ces infos au téléphone : 07 67 56 11 21.'; }
  f.hidden = true; $('#f2-ok').hidden = false;
  $('#dossier').scrollIntoView({ behavior: 'smooth' });
});
})();
