// Vues : chaque fonction retourne du HTML sûr (voir html.js). Aucun accès au stockage ici.
import { html, raw } from './html.js';
import * as L from './lib.js';

const ICON_PATHS = {
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
  userplus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  wallet: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  in: '<path d="M7 17 17 7M7 7h10v10"/>',
  out: '<path d="M17 7 7 17M17 17V7H7"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  up: '<path d="M18 15l-6-6-6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
};

export function icon(name, size = 24, sw = 1.9) {
  return raw(
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[name] || ''}</svg>`
  );
}

export function logo(size = 30) {
  return raw(
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="21" cy="12" r="2.4" fill="#F2B33D"/><circle cx="16.5" cy="19.8" r="2.4" fill="#0E5A47"/><circle cx="7.5" cy="19.8" r="2.4" fill="#0E5A47"/><circle cx="3" cy="12" r="2.4" fill="#0E5A47"/><circle cx="7.5" cy="4.2" r="2.4" fill="#0E5A47"/><circle cx="16.5" cy="4.2" r="2.4" fill="#0E5A47"/></svg>`
  );
}

const chip = (kind, label, ic) => html`<span class="chip chip-${kind}">${ic ? icon(ic, 14, 2.4) : ''}${label}</span>`;

function tabbar(active, gid) {
  const h = gid
    ? { groups: '#/', calendar: `#/g/${gid}/calendrier`, pay: `#/g/${gid}/paiement`, hist: `#/g/${gid}/historique` }
    : { groups: '#/', calendar: '#/vide', pay: '#/vide', hist: '#/vide' };
  const items = [
    ['groups', 'users', 'Groupes'],
    ['calendar', 'calendar', 'Calendrier'],
    ['pay', 'wallet', 'Paiements'],
    ['hist', 'clock', 'Historique'],
  ];
  return html`<nav class="tabbar no-print" aria-label="Navigation principale">
    ${items.map(
      ([k, ic, label]) =>
        html`<a href="${h[k]}" class="${k === active ? 'is-active' : ''}" ${k === active ? raw('aria-current="page"') : ''}>${icon(ic)}<span>${label}</span></a>`
    )}
  </nav>`;
}

function topbar(title, sub, backHref, extra) {
  return html`<header class="topbar no-print">
    <a class="icon-btn" href="${backHref}" aria-label="Retour">${icon('back', 22, 2)}</a>
    <div class="grow">
      <h1>${title}</h1>
      ${sub ? html`<p class="sub">${sub}</p>` : ''}
    </div>
    ${extra || ''}
  </header>`;
}

export function errorBox(errors) {
  if (!errors || !errors.length) return '';
  return html`<div class="alert" role="alert" id="form-errors">
    <strong>${errors.length > 1 ? 'Corrigez ces points :' : 'À corriger :'}</strong>
    <ul>${errors.map((e) => html`<li>${e.message}</li>`)}</ul>
  </div>`;
}

export function loadingView() {
  return html`<main class="screen"><div class="brand">${logo(30)}<span>TontinePro</span></div><p role="status">Connexion au serveur…</p></main>`;
}

export function authView({ mode, error, notice, email, registrationRequiresKey = false }) {
  const registering = mode === 'register';
  if (mode === 'pending') {
    return html`<main class="screen auth-screen">
      <div class="brand">${logo(34)}<span>TontinePro</span></div>
      <section class="auth-content">
        <h1 class="h1">Confirmez votre adresse e-mail</h1>
        <p class="sub">Un lien de validation a été demandé pour ${email || 'votre adresse'}.</p>
        ${notice ? html`<div class="info" role="status">${notice}</div>` : ''}
        ${error ? html`<div class="alert" role="alert">${error}</div>` : ''}
        <form data-form="resend-verification" class="form-body">
          <div class="field">
            <label for="resend-email">Adresse e-mail</label>
            <input id="resend-email" name="email" type="email" value="${email || ''}" autocomplete="email" maxlength="254" required>
          </div>
          <button type="submit" class="btn btn-primary">Renvoyer le lien</button>
        </form>
        <button type="button" class="link-btn" data-action="auth-toggle">Retour à la connexion</button>
      </section>
    </main>`;
  }
  if (mode === 'forgot') {
    return html`<main class="screen auth-screen">
      <div class="brand">${logo(34)}<span>TontinePro</span></div>
      <section class="auth-content">
        <h1 class="h1">Mot de passe oublié</h1>
        <p class="sub">Nous vous enverrons un lien à usage unique si un compte validé correspond à cette adresse.</p>
        ${notice ? html`<div class="info" role="status">${notice}</div>` : ''}
        ${error ? html`<div class="alert" role="alert">${error}</div>` : ''}
        <form data-form="forgot-password" class="form-body">
          <div class="field">
            <label for="forgot-email">Adresse e-mail</label>
            <input id="forgot-email" name="email" type="email" autocomplete="email" maxlength="254" required>
          </div>
          <button type="submit" class="btn btn-primary">Envoyer le lien de récupération</button>
        </form>
        <button type="button" class="link-btn" data-action="auth-toggle">Retour à la connexion</button>
      </section>
    </main>`;
  }
  return html`<main class="screen auth-screen">
    <div class="brand">${logo(34)}<span>TontinePro</span></div>
    <section class="auth-content">
      <h1 class="h1">${registering ? 'Créer votre compte' : 'Connexion'}</h1>
      <p class="sub">Vos groupes et paiements seront associés à ce compte.</p>
      ${error ? html`<div class="alert" role="alert">${error}</div>` : ''}
      ${notice ? html`<div class="info" role="status">${notice}</div>` : ''}
      <form data-form="auth" class="form-body" autocomplete="on">
        ${registering && registrationRequiresKey
          ? html`<div class="field">
              <label for="auth-invitation">Code d’invitation</label>
              <input id="auth-invitation" name="registrationKey" type="password" autocomplete="off" required>
            </div>`
          : ''}
        <div class="field">
          <label for="auth-email">Adresse e-mail</label>
          <input id="auth-email" name="email" type="email" autocomplete="email" maxlength="254" required>
        </div>
        <div class="field">
          <label for="auth-password">Mot de passe</label>
          <input id="auth-password" name="password" type="password" autocomplete="${registering ? 'new-password' : 'current-password'}" minlength="12" maxlength="128" required>
          ${registering ? html`<span class="hint">12 caractères minimum.</span>` : ''}
        </div>
        <button type="submit" class="btn btn-primary">${registering ? 'Créer le compte' : 'Se connecter'}</button>
      </form>
      ${registering ? '' : html`<button type="button" class="link-btn" data-action="forgot-password">Mot de passe oublié ?</button>`}
      <button type="button" class="link-btn" data-action="auth-toggle">${registering ? 'J’ai déjà un compte' : 'Créer un compte'}</button>
    </section>
  </main>`;
}

export function verifyEmailView({ token, error }) {
  return html`<main class="screen auth-screen">
    <div class="brand">${logo(34)}<span>TontinePro</span></div>
    <section class="auth-content">
      <h1 class="h1">Validation de l’adresse e-mail</h1>
      ${error ? html`<div class="alert" role="alert">${error}</div>` : ''}
      ${token
        ? html`<p class="sub">Confirmez cette adresse pour activer votre compte.</p>
            <form data-form="verify-email"><input type="hidden" name="token" value="${token}"><button type="submit" class="btn btn-primary">Confirmer mon adresse e-mail</button></form>`
        : html`<p class="muted">Le lien est incomplet. Demandez un nouveau lien de validation.</p>`}
      <a class="link-btn" href="#/">Retour à la connexion</a>
    </section>
  </main>`;
}

export function resetPasswordView({ token, error }) {
  return html`<main class="screen auth-screen">
    <div class="brand">${logo(34)}<span>TontinePro</span></div>
    <section class="auth-content">
      <h1 class="h1">Choisir un nouveau mot de passe</h1>
      ${error ? html`<div class="alert" role="alert">${error}</div>` : ''}
      ${token
        ? html`<form data-form="reset-password" class="form-body">
            <input type="hidden" name="token" value="${token}">
            <div class="field">
              <label for="reset-password">Nouveau mot de passe</label>
              <input id="reset-password" name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required>
              <span class="hint">12 caractères minimum.</span>
            </div>
            <div class="field">
              <label for="reset-confirm">Confirmer le mot de passe</label>
              <input id="reset-confirm" name="confirmation" type="password" autocomplete="new-password" minlength="12" maxlength="128" required>
            </div>
            <button type="submit" class="btn btn-primary">Enregistrer le nouveau mot de passe</button>
          </form>`
        : html`<p class="muted">Le lien de récupération est incomplet ou expiré. Demandez-en un nouveau.</p>`}
      <a class="link-btn" href="#/">Retour à la connexion</a>
    </section>
  </main>`;
}

const checked = (c) => (c ? raw('checked') : '');
const selected = (c) => (c ? raw('selected') : '');

function snapshot(g, today) {
  const t = L.currentTour(g);
  if (t === null) return { complete: true, t: null };
  return { complete: false, t, ...L.tourSummary(g, t, today), ben: L.beneficiary(g, t), date: L.tourDate(g, t) };
}

function groupChip(g, today) {
  const s = snapshot(g, today);
  if (s.complete) return chip('ok', 'Cycle terminé', 'check');
  if (s.lateCount > 0) return chip('late', `${s.lateCount} retard${s.lateCount > 1 ? 's' : ''}`, 'clock');
  if (s.paidCount === s.total) return chip('ok', 'À jour', 'check');
  const n = s.total - s.paidCount;
  return chip('wait', `${n} en attente`);
}

// ---------- Accueil ----------

export function homeView({ state, today, account }) {
  const groups = state.groups;
  const active = groups.find((g) => g.id === state.activeGroupId) || groups[0];
  const avatar = state.profile.name ? L.initials(state.profile.name) : 'TP';

  let hero = '';
  if (active) {
    const s = snapshot(active, today);
    hero = s.complete
      ? html`<section class="hero" aria-label="${active.name}">
          <div class="hero-label">${active.name}</div>
          <div class="hero-title">Cycle terminé</div>
          <div class="hero-note">Toutes les remises ont été faites. Ajoutez un membre pour ouvrir un nouveau tour.</div>
        </section>`
      : html`<section class="hero" aria-label="Prochain tour">
          <div class="hero-label">${active.name} · tour ${s.t} · remise le ${L.formatDate(s.date)}</div>
          <div>
            <div class="hero-sub">${s.ben.name} reçoit</div>
            <div class="hero-amount">${L.formatFCFA(s.expected)}</div>
          </div>
          <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${s.expected}" aria-valuenow="${s.collected}" aria-label="Montant collecté">
            <div style="width:${Math.min(100, Math.round((s.collected / s.expected) * 100))}%"></div>
          </div>
          <div class="hero-note">${s.paidCount} cotisation${s.paidCount > 1 ? 's' : ''} sur ${s.total} reçue${s.paidCount > 1 ? 's' : ''}${s.lateCount ? ` · ${s.lateCount} en retard` : ''}</div>
        </section>`;
  }

  const body = groups.length
    ? html`${hero}
        <ul class="list" aria-label="Vos groupes">
          ${groups.map(
            (g) => html`<li>
              <a class="card row link" href="#/g/${g.id}">
                <div class="avatar sq">${L.initials(g.name)}</div>
                <div class="grow">
                  <span class="name">${g.name}</span>
                  <span class="meta">${g.members.length} membres · ${L.formatFCFA(g.amount)} / ${L.FREQUENCIES[g.frequency].unit}</span>
                </div>
                ${groupChip(g, today)}
              </a>
            </li>`
          )}
        </ul>`
    : html`<section class="empty">
        ${logo(64)}
        <h2>Aucun groupe pour l'instant</h2>
        <p>Créez votre première tontine ou njangi, ajoutez les membres et suivez chaque cotisation sans papier ni disputes.</p>
      </section>`;

  return html`<main class="screen">
      <div class="row between">
        <div class="brand">${logo(30)}<span>TontinePro</span></div>
        <div class="row gap">
          <button type="button" class="icon-btn" data-action="backup-export" title="Créer une sauvegarde chiffrée" aria-label="Créer une sauvegarde chiffrée">${icon('download', 20, 2)}</button>
          <button type="button" class="icon-btn" data-action="backup-import" title="Restaurer une sauvegarde" aria-label="Restaurer une sauvegarde">${icon('upload', 20, 2)}</button>
          <div class="avatar round" aria-hidden="true">${avatar}</div>
        </div>
      </div>
      <input id="backup-file" type="file" accept="application/json,.json" hidden>
      <h1 class="h1">Vos groupes</h1>
      ${body}
      <a class="btn btn-primary push" href="#/nouveau">${icon('plus', 22, 2.2)}${groups.length ? 'Créer un groupe' : 'Créer mon premier groupe'}</a>
      <div class="row between account-row"><span class="meta">${account.email}</span><button type="button" class="link-btn" data-action="logout">${account.local ? 'Réinitialiser' : 'Déconnexion'}</button></div>
    </main>
    ${tabbar('groups', active && active.id)}`;
}

export function emptyView() {
  return html`<main class="screen">
      <h1 class="h1">Aucun groupe</h1>
      <section class="empty">
        ${logo(64)}
        <p>Créez d'abord un groupe pour accéder au calendrier, aux paiements et à l'historique.</p>
      </section>
      <a class="btn btn-primary push" href="#/nouveau">${icon('plus', 22, 2.2)}Créer un groupe</a>
    </main>
    ${tabbar('groups', null)}`;
}

export function notFoundView() {
  return html`<main class="screen">
      <h1 class="h1">Page introuvable</h1>
      <p class="muted">Ce groupe ou ce reçu n'existe pas (ou plus) sur cet appareil.</p>
      <a class="btn btn-primary" href="#/">Retour à l'accueil</a>
    </main>
    ${tabbar('groups', null)}`;
}

// ---------- Nouveau groupe ----------

export function newGroupView({ draft, errors, addErrors }) {
  const manual = draft.orderMode === 'manual';
  const others = draft.members.slice(1);
  return html`<form data-form="new-group" class="form-page" novalidate autocomplete="off">
    <main class="screen">
      ${topbar('Nouveau groupe', '', '#/')}
      ${errorBox(errors)}

      <div class="field">
        <label for="f-name">Nom du groupe</label>
        <input id="f-name" type="text" data-bind="name" value="${draft.name}" maxlength="60" placeholder="Ex. : Njangi Les Cadets" required>
      </div>

      <div class="grid2">
        <div class="field">
          <label for="f-amount">Cotisation (FCFA)</label>
          <input id="f-amount" type="text" inputmode="numeric" data-bind="amount" value="${draft.amount}" placeholder="25 000" required>
        </div>
        <div class="field">
          <label for="f-freq">Fréquence</label>
          <select id="f-freq" data-bind="frequency">
            ${Object.entries(L.FREQUENCIES).map(([k, f]) => html`<option value="${k}" ${selected(k === draft.frequency)}>${f.label}</option>`)}
          </select>
        </div>
      </div>

      <div class="field">
        <label for="f-start">Date du premier tour</label>
        <input id="f-start" type="date" data-bind="startDate" value="${draft.startDate}" required>
        <span class="hint">Les cotisations de chaque tour sont dues à la date de remise.</span>
      </div>

      <fieldset class="field">
        <legend>Ordre des bénéficiaires</legend>
        <div class="seg">
          <input type="radio" name="orderMode" id="om-random" value="random" data-bind="orderMode" ${checked(!manual)}><label for="om-random">Tirage au sort</label>
          <input type="radio" name="orderMode" id="om-manual" value="manual" data-bind="orderMode" ${checked(manual)}><label for="om-manual">Choix manuel</label>
        </div>
        <span class="hint">${manual ? "L'ordre de la liste ci-dessous sera l'ordre des tours." : "L'ordre sera tiré au sort à la création du groupe."}</span>
      </fieldset>

      <section class="block" aria-labelledby="h-me">
        <h2 id="h-me">Vous (organisateur)</h2>
        <div class="grid2">
          <div class="field">
            <label for="f-m0name">Votre nom</label>
            <input id="f-m0name" type="text" data-bind="m0name" value="${draft.members[0].name}" maxlength="60" autocomplete="name" required>
          </div>
          <div class="field">
            <label for="f-m0phone">Votre téléphone</label>
            <input id="f-m0phone" type="tel" data-bind="m0phone" value="${draft.members[0].phone}" placeholder="677 00 00 00" autocomplete="tel" required>
          </div>
        </div>
      </section>

      <section class="block" aria-labelledby="h-members">
        <div class="row between">
          <h2 id="h-members">Membres (${draft.members.length})</h2>
          <span class="hint">2 minimum</span>
        </div>
        ${others.length
          ? html`<ul class="list">
              ${others.map(
                (m, i) => html`<li class="card row member-row">
                  <div class="avatar round">${L.initials(m.name)}</div>
                  <div class="grow"><span class="name">${m.name}</span><span class="meta">${L.formatPhone(L.normalizePhone(m.phone) || m.phone)}</span></div>
                  <button type="button" class="icon-btn plain" data-action="draft-remove" data-index="${i + 1}" aria-label="Retirer ${m.name}">${icon('trash', 20, 2)}</button>
                </li>`
              )}
            </ul>`
          : html`<p class="muted small">Aucun autre membre pour l'instant.</p>`}

        <div class="add-row" role="group" aria-label="Ajouter un membre">
          <div class="field">
            <label for="f-newname">Nom du membre</label>
            <input id="f-newname" type="text" data-bind="newName" value="${draft.newName}" maxlength="60" placeholder="Ex. : Estelle Nkodo">
          </div>
          <div class="field">
            <label for="f-newphone">Téléphone</label>
            <input id="f-newphone" type="tel" data-bind="newPhone" value="${draft.newPhone}" placeholder="699 00 00 00">
          </div>
          ${addErrors && addErrors.length ? html`<div class="alert" role="alert"><ul>${addErrors.map((e) => html`<li>${e.message}</li>`)}</ul></div>` : ''}
          <button type="button" class="btn btn-dashed" data-action="draft-add">${icon('plus', 20, 2.2)}Ajouter ce membre</button>
        </div>
      </section>

      ${manual
        ? html`<section class="block" aria-labelledby="h-order">
            <h2 id="h-order">Ordre des tours</h2>
            <ol class="list order-list">
              ${draft.members.map(
                (m, i) => html`<li class="card row member-row">
                  <span class="rank" aria-hidden="true">${i + 1}</span>
                  <div class="grow"><span class="name">${m.name || 'Sans nom'}</span></div>
                  <button type="button" class="icon-btn plain" data-action="draft-up" data-index="${i}" aria-label="Monter ${m.name}" ${i === 0 ? raw('disabled') : ''}>${icon('up', 20, 2.2)}</button>
                  <button type="button" class="icon-btn plain" data-action="draft-down" data-index="${i}" aria-label="Descendre ${m.name}" ${i === draft.members.length - 1 ? raw('disabled') : ''}>${icon('down', 20, 2.2)}</button>
                </li>`
              )}
            </ol>
          </section>`
        : ''}
    </main>
    <div class="bottom-bar">
      <p class="hint center">Vous ajouterez les paiements vous-même ; TontinePro ne touche jamais à l'argent.</p>
      <button type="submit" class="btn btn-primary">Créer le groupe</button>
    </div>
  </form>`;
}

// ---------- Détail du groupe ----------

function statusLine(g, t, m, st) {
  if (st.state === 'paid') {
    const p = L.lastPayment(g, t, m.id);
    return html`<span class="status status-paid">${icon('check', 14, 2.6)}Payé${p ? html` · ${L.formatDate(p.date.slice(0, 10))} · ${p.method}` : ''}</span>`;
  }
  const partial = st.paid > 0 ? html` · reste ${L.formatFCFA(st.remaining)}` : '';
  const arrears = st.arrears > 0 ? html` · dont ${L.formatFCFA(st.arrears)} d’arriéré reporté` : '';
  if (st.state === 'late') {
    return html`<span class="status status-late">${icon('clock', 14, 2.4)}En retard · ${st.daysLate} jour${st.daysLate > 1 ? 's' : ''}${partial}${arrears}</span>`;
  }
  return html`<span class="status status-wait">En attente · échéance le ${L.formatDate(st.due)}${partial}${arrears}</span>`;
}

export function groupView({ g, today }) {
  const t = L.currentTour(g);
  const unconfirmed = g.payouts.filter((p) => !p.confirmed);
  const addBtn = html`<a class="icon-btn" href="#/g/${g.id}/membre" aria-label="Ajouter un membre">${icon('userplus', 22, 2)}</a>`;
  const deleteBtn = html`<button type="button" class="icon-btn danger-icon" data-action="delete-group" data-id="${g.id}" aria-label="Supprimer le groupe" title="Supprimer le groupe">${icon('trash', 20, 2)}</button>`;
  const memberRemovalLocked = g.members.length <= 2 || g.payments.length > 0 || g.payouts.length > 0;
  const memberRemovalReason = g.members.length <= 2
    ? 'Un groupe doit conserver au moins deux membres.'
    : 'Le retrait est verrouillé après le début des paiements pour préserver les reçus et l’historique.';

  let content;
  if (t === null) {
    content = html`<section class="hero">
        <div class="hero-label">Cycle terminé</div>
        <div class="hero-title">Toutes les remises ont été faites</div>
        <div class="hero-note">${L.formatFCFA(L.totals(g).paidOut)} remis au total.</div>
      </section>
      <p class="muted">Ajoutez un membre pour ouvrir un nouveau tour.</p>
      <a class="btn btn-primary" href="#/g/${g.id}/membre">${icon('userplus', 20, 2)}Ajouter un membre</a>`;
  } else {
    const s = L.tourSummary(g, t, today);
    const ben = L.beneficiary(g, t);
    const rank = { late: 0, pending: 1, paid: 2 };
    const rows = L.participants(g, t)
      .map((m) => ({ m, st: L.memberStatus(g, t, m.id, today) }))
      .sort((a, b) => rank[a.st.state] - rank[b.st.state] || b.st.daysLate - a.st.daysLate || a.m.name.localeCompare(b.m.name, 'fr'));
    const payout = L.canPayout(g, today);
    const partialPayout = L.canPayout(g, today, { allowUnpaid: true });
    const payoutPanel = html`<div class="card payout" id="payout-panel">
      ${payout.ok
        ? html`<p><strong>Tout le monde a cotisé.</strong> Vous pouvez remettre ${L.formatFCFA(payout.amount)} à ${ben.name}, en main propre ou par Mobile Money, puis enregistrer la remise.</p>
            <button type="button" class="btn btn-primary" data-action="payout">Enregistrer la remise à ${L.firstName(ben.name)}</button>`
        : partialPayout.ok
          ? html`<p><strong>Remise partielle possible.</strong> ${L.formatFCFA(partialPayout.amount)} ont été collectés. Les ${L.formatFCFA(partialPayout.shortfall)} impayés seront reportés aux prochaines cotisations.</p>
              <p class="hint">Impayés : ${partialPayout.unpaidMembers.map((member) => `${member.name} (${L.formatFCFA(member.amount)})`).join(', ')}</p>
              <button type="button" class="btn btn-primary" data-action="payout-partial">Remettre ${L.formatFCFA(partialPayout.amount)} et reporter les impayés</button>`
          : html`<p class="muted">${partialPayout.reason || payout.reason}</p>`}
    </div>`;
    content = html`<section class="hero" aria-label="Bénéficiaire du tour">
        <div class="row">
          <div class="avatar gold big">${L.initials(ben.name)}</div>
          <div>
            <div class="hero-label">Bénéficiaire du tour</div>
            <div class="hero-title">${ben.name}</div>
          </div>
        </div>
        <div>
          <span class="hero-amount">${L.formatNumber(s.collected)}</span>
          <span class="hero-sub"> sur ${L.formatFCFA(s.expected)} collectés</span>
        </div>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${s.expected}" aria-valuenow="${s.collected}" aria-label="Montant collecté">
          <div style="width:${Math.min(100, Math.round((s.collected / s.expected) * 100))}%"></div>
        </div>
      </section>

      ${payoutPanel}

      ${unconfirmed.map((p) => {
        const b = L.memberById(g, p.memberId);
        return html`<div class="card notice">
          <div><strong>Remise du tour ${p.tour} à ${b ? b.name : '?'}</strong><span class="meta">${L.formatFCFA(p.amount)}${p.shortfall ? ` · ${L.formatFCFA(p.shortfall)} d’impayés reportés` : ''} · en attente de confirmation de réception</span></div>
          <button type="button" class="btn btn-outline btn-sm" data-action="confirm-payout" data-id="${p.id}">Réception confirmée</button>
        </div>`;
      })}

      <div class="row between">
        <h2 class="h2">Cotisations du tour</h2>
        <a class="link-btn" href="#/g/${g.id}/paiement">${icon('plus', 18, 2.2)}Enregistrer un paiement</a>
      </div>

      <ul class="list" aria-label="Cotisations du tour ${t}">
        ${rows.map(({ m, st }) => {
          const isBen = m.id === ben.id;
          const absenceRecorded = g.payments.some((payment) => payment.tour === t && payment.memberId === m.id && payment.amount === 0);
          return html`<li class="card member">
            <div class="row">
              <div class="avatar round av-${st.state}">${L.initials(m.name)}</div>
              <div class="grow">
                <span class="name">${m.name}${isBen ? html` <span class="badge">Bénéficiaire</span>` : ''}</span>
                ${statusLine(g, t, m, st)}
              </div>
              <span class="amt amt-${st.state}">${L.formatNumber(st.state === 'paid' ? st.paid : st.remaining)}</span>
            </div>
            ${st.state !== 'paid' || L.organizer(g).id !== m.id
              ? html`<div class="row-actions">
                  ${st.state !== 'paid'
                    ? html`<a class="btn btn-outline btn-sm" href="${L.waLink(m.phone, L.reminderMessage(g, m, t, today))}" target="_blank" rel="noopener">Relancer</a>
                        <a class="btn btn-primary btn-sm" href="#/g/${g.id}/paiement?m=${m.id}">${absenceRecorded ? 'Régler' : 'Encaisser'}</a>`
                    : ''}
                  ${L.organizer(g).id !== m.id
                    ? html`<button type="button" class="btn btn-danger btn-sm" data-action="delete-member" data-id="${m.id}" aria-label="Supprimer ${m.name}" title="${memberRemovalLocked ? memberRemovalReason : `Supprimer ${m.name}`}" ${memberRemovalLocked ? raw('disabled') : ''}>${icon('trash', 18, 2)}Supprimer</button>`
                    : ''}
                </div>`
              : ''}
          </li>`;
        })}
      </ul>
      ${g.members.some((m) => L.organizer(g).id !== m.id) && memberRemovalLocked
        ? html`<p class="hint">Suppression désactivée : conservez au moins deux membres et l’historique des paiements déjà enregistrés.</p>`
        : ''}
    `;
  }

  return html`<main class="screen">
      ${topbar(g.name, t === null ? 'Cycle terminé' : `Tour ${t} sur ${g.order.length} · remise le ${L.formatDate(L.tourDate(g, t))}`, '#/', html`${addBtn}${deleteBtn}`)}
      ${content}
    </main>
    ${tabbar('groups', g.id)}`;
}

// ---------- Ajout d'un membre ----------

export function addMemberView({ g, errors, values }) {
  const t = L.currentTour(g);
  const joined = t ?? g.order.length + 1;
  return html`<form data-form="member" class="form-page" novalidate autocomplete="off">
    <main class="screen">
      ${topbar('Ajouter un membre', g.name, `#/g/${g.id}`)}
      ${errorBox(errors)}
      <div class="field">
        <label for="m-name">Nom du membre</label>
        <input id="m-name" name="name" type="text" value="${values.name || ''}" maxlength="60" required>
      </div>
      <div class="field">
        <label for="m-phone">Téléphone</label>
        <input id="m-phone" name="phone" type="tel" value="${values.phone || ''}" placeholder="699 00 00 00" required>
        <span class="hint">Il servira à envoyer les reçus et les rappels.</span>
      </div>
      <div class="info">
        ${icon('shield', 20, 2)}
        <span>Le nouveau membre cotisera à partir du tour ${joined} et recevra au tour ${g.order.length + 1}. Les tours déjà remis ne sont pas modifiés.</span>
      </div>
      <p class="muted small">Membres actuels : ${g.members.length}</p>
    </main>
    <div class="bottom-bar">
      <button type="submit" class="btn btn-primary">Ajouter le membre</button>
    </div>
  </form>`;
}

// ---------- Calendrier ----------

export function calendarView({ g, today }) {
  const cur = L.currentTour(g);
  const last = L.tourDate(g, g.order.length);
  const rows = g.order.map((id, i) => {
    const t = i + 1;
    const m = L.memberById(g, id);
    const payout = L.payoutFor(g, t);
    const { day, month } = L.dayAndMonth(L.tourDate(g, t));
    const kind = payout ? 'done' : t === cur ? 'now' : 'next';
    const pot = payout ? payout.amount : g.amount * L.participants(g, t).length;
    return html`<li class="card cal cal-${kind}" ${t === cur ? raw('aria-current="step"') : ''}>
      <div class="datebox"><span class="d">${day}</span><span class="mo">${month}</span></div>
      <div class="grow"><span class="name">${m.name}</span><span class="meta">Tour ${t} · ${L.formatFCFA(pot)}</span></div>
      ${payout ? chip('ok', 'Remis', 'check') : t === cur ? html`<span class="chip chip-now">En cours</span>` : chip('wait', 'À venir')}
    </li>`;
  });
  return html`<main class="screen">
      <div>
        <h1 class="h1">Calendrier</h1>
        <p class="sub">${g.name} · fin du cycle le ${L.formatDate(last)}</p>
      </div>
      <ol class="list">${rows}</ol>
    </main>
    ${tabbar('calendar', g.id)}`;
}

// ---------- Paiement ----------

export function paymentView({ g, today, params, errors, values }) {
  const t = L.currentTour(g);
  let body;
  if (t === null) {
    body = html`<p class="muted">Le cycle est terminé : il n'y a plus de cotisation à encaisser.</p>`;
  } else {
    const rank = { late: 0, pending: 1, paid: 2 };
    const unpaid = L.participants(g, t)
      .map((m) => ({ m, st: L.memberStatus(g, t, m.id, today) }))
      .filter((x) => x.st.remaining > 0)
      .sort((a, b) => rank[a.st.state] - rank[b.st.state] || a.m.name.localeCompare(b.m.name, 'fr'));
    if (!unpaid.length) {
      body = html`<div class="card notice"><div><strong>Tout le monde a cotisé pour le tour ${t}.</strong><span class="meta">Vous pouvez maintenant enregistrer la remise.</span></div></div>
        <a class="btn btn-primary" href="#/g/${g.id}">Aller au suivi du tour</a>`;
    } else {
      const wanted = values.memberId || params.get('m');
      const sel = unpaid.find((x) => x.m.id === wanted) || unpaid[0];
      const method = values.method && L.METHODS.includes(values.method) ? values.method : 'MTN MoMo';
      const channel = values.channel === 'sms' ? 'sms' : 'whatsapp';
      const amount = values.amount !== undefined ? values.amount : String(sel.st.remaining);
      const noContribution = L.parseContributionAmount(amount) === 0;
      const cash = method === 'Espèces';
      body = html`<form data-form="payment" novalidate autocomplete="off" class="form-page">
        <div class="form-body">
          ${errorBox(errors)}
          <div class="field">
            <label for="p-member">Membre</label>
            <select id="p-member" name="memberId" data-pay="member">
              ${unpaid.map(
                ({ m, st }) =>
                  html`<option value="${m.id}" data-remaining="${st.remaining}" ${selected(m.id === sel.m.id)}>${m.name} · ${L.formatNumber(st.remaining)}${st.state === 'late' ? ' · retard' : ''}</option>`
              )}
            </select>
            <span class="hint">Tour ${t} · cotisation de ${L.formatFCFA(g.amount)}${L.arrearsAmount(g, t, sel.m.id) ? ` · arriérés reportés : ${L.formatFCFA(L.arrearsAmount(g, t, sel.m.id))}` : ''}</span>
          </div>
          <div class="field">
            <label for="p-amount">Montant reçu (FCFA)</label>
            <input id="p-amount" name="amount" type="text" inputmode="numeric" class="big-input" value="${amount}" required>
            <span class="hint">Saisir 0 enregistre une cotisation non reçue ; le membre restera en attente.</span>
          </div>
          <fieldset class="field" id="method-field" ${noContribution ? raw('hidden') : ''}>
            <legend>Moyen de paiement</legend>
            <div class="seg seg3">
              ${L.METHODS.map(
                (mt, i) => html`<input type="radio" name="method" id="pm-${i}" value="${mt}" data-pay="method" ${checked(mt === method)}><label for="pm-${i}">${mt}</label>`
              )}
            </div>
          </fieldset>
          <div class="field" id="ref-field" ${cash || noContribution ? raw('hidden') : ''}>
            <label for="p-ref">Référence de la transaction</label>
            <input id="p-ref" name="ref" type="text" value="${values.ref || ''}" placeholder="Code reçu par SMS après le transfert" maxlength="40" autocapitalize="characters">
            <div class="info">
              ${icon('shield', 20, 2)}
              <span>Effectuez d'abord le transfert dans MTN MoMo ou Orange Money. TontinePro ne déclenche ni ne vérifie le transfert : il enregistre seulement le paiement et sa référence.</span>
            </div>
          </div>
          <fieldset class="field">
            <legend>Envoyer le reçu par</legend>
            <div class="seg">
              <input type="radio" name="channel" id="ch-wa" value="whatsapp" ${checked(channel === 'whatsapp')}><label for="ch-wa">WhatsApp</label>
              <input type="radio" name="channel" id="ch-sms" value="sms" ${checked(channel === 'sms')}><label for="ch-sms">SMS</label>
            </div>
            <span class="hint">Le message s'ouvre prêt à envoyer ; vous appuyez sur « Envoyer ».</span>
          </fieldset>
        </div>
        <button type="submit" class="btn btn-primary push">Valider et préparer le reçu</button>
      </form>`;
    }
  }
  return html`<main class="screen">
      ${topbar('Enregistrer un paiement', g.name, `#/g/${g.id}`)}
      ${body}
    </main>
    ${tabbar('pay', g.id)}`;
}

// ---------- Reçu ----------

export function receiptView({ g, p }) {
  const m = L.memberById(g, p.memberId);
  const ben = L.beneficiary(g, p.tour);
  const msg = L.receiptMessage(g, p);
  const noContribution = p.amount === 0;
  const waMain = p.channel !== 'sms';
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const smsHref = L.smsLink(m ? m.phone : '', msg, isIOS ? 'ios' : 'android');
  const row = (k, v) => html`<div class="kv"><span>${k}</span><strong>${v}</strong></div>`;
  const arrearsAllocation = (p.allocations || []).filter((allocation) => allocation.tour < p.tour);
  return html`<main class="screen">
    <header class="topbar no-print">
      <a class="icon-btn" href="#/g/${g.id}" aria-label="Fermer">${icon('close', 20, 2.2)}</a>
      <h1>${noContribution ? 'Non-cotisation enregistrée' : 'Paiement enregistré'}</h1>
    </header>
    <article class="receipt" aria-label="Reçu ${p.receiptNo}">
      <div class="receipt-head">
        <div class="row between">
          <div class="brand small">${logo(22)}<span>TontinePro</span></div>
          <span class="meta strong">Reçu n° ${p.receiptNo}</span>
        </div>
        <div>
          <span class="meta">${noContribution ? 'Aucune cotisation reçue' : 'Cotisation reçue'}</span>
          <div class="receipt-amount">${L.formatFCFA(p.amount)}</div>
        </div>
      </div>
      <div class="tear" aria-hidden="true"></div>
      <div class="receipt-body">
        ${row('Groupe', g.name)}
        ${row('Membre', m ? m.name : '?')}
        ${row('Tour', `${p.tour}${ben ? ` · bénéficiaire ${ben.name}` : ''}`)}
        ${arrearsAllocation.length ? row('Arriérés réglés', arrearsAllocation.map((allocation) => `tour ${allocation.tour} : ${L.formatFCFA(allocation.amount)}`).join(', ')) : ''}
        ${row('Date', L.formatDateTime(p.date))}
        ${row('Moyen', p.method)}
        ${p.ref ? row('Référence', p.ref) : ''}
        ${row('Enregistré par', `${p.recordedBy}, organisateur`)}
      </div>
      <div class="receipt-foot">${noContribution ? 'Ce document enregistre une absence de cotisation ; il ne constitue pas un reçu de paiement.' : 'Ce reçu est consultable par tous les membres du groupe.'}</div>
    </article>

    <section class="no-print" aria-label="Message à envoyer">
      <span class="meta strong">Message prêt à envoyer (${waMain ? 'WhatsApp' : 'SMS'})</span>
      <div class="bubble">${msg}</div>
    </section>

    <div class="stack no-print push">
      <a class="btn ${waMain ? 'btn-primary' : 'btn-outline'}" href="${L.waLink(m ? m.phone : '', msg)}" target="_blank" rel="noopener">${icon('message', 20, 2)}Envoyer sur WhatsApp</a>
      <div class="grid2">
        <a class="btn ${waMain ? 'btn-outline' : 'btn-primary'}" href="${smsHref}">${icon('message', 20, 2)}Envoyer par SMS</a>
        <button type="button" class="btn btn-outline" data-action="print">${icon('download', 20, 2)}Reçu en PDF</button>
      </div>
      <a class="btn btn-ghost" href="#/g/${g.id}">Retour au suivi du tour</a>
    </div>
  </main>`;
}

// ---------- Historique ----------

function entryTitle(g, e) {
  const m = L.memberById(g, e.data.memberId);
  return m ? m.name : '?';
}

export function historyView({ g, filter, today }) {
  const all = L.historyEntries(g);
  const list = all.filter((e) => filter === 'all' || e.kind === filter);
  const groups = [];
  for (const e of list) {
    const day = e.date.slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(e);
    else groups.push({ day, items: [e] });
  }
  const filters = [
    ['all', 'Tout'],
    ['payment', 'Cotisations'],
    ['payout', 'Remises'],
  ];
  const tot = L.totals(g);
  const chrono = all.slice().reverse();

  return html`<main class="screen">
      <div class="row between top-align no-print">
        <div>
          <h1 class="h1">Historique</h1>
          <p class="sub">${g.name}</p>
        </div>
        <button type="button" class="btn btn-primary btn-sm" data-action="print">${icon('download', 18, 2)}Exporter en PDF</button>
      </div>

      <div class="seg seg3 no-print" role="group" aria-label="Filtrer l'historique">
        ${filters.map(
          ([k, label]) => html`<button type="button" class="seg-btn ${k === filter ? 'is-on' : ''}" data-action="filter" data-filter="${k}" aria-pressed="${k === filter}">${label}</button>`
        )}
      </div>

      <div class="screen-only stack">
        ${groups.length
          ? groups.map(
              (grp) => html`<section aria-label="${L.formatDate(grp.day)}">
                <h2 class="day">${L.formatDate(grp.day)}</h2>
                <ul class="list">
                  ${grp.items.map((e) => {
                    if (e.kind === 'payment') {
                      const p = e.data;
                      return html`<li><a class="card row entry" href="#/g/${g.id}/recu/${p.id}">
                        <span class="ico ico-in">${icon('in', 20, 2.2)}</span>
                        <span class="grow"><span class="name">${entryTitle(g, e)}</span><span class="meta">Tour ${p.tour} · ${p.method}${p.ref ? ` · ${p.ref}` : ''}</span></span>
                        <span class="amt amt-paid">+${L.formatNumber(p.amount)}</span>
                      </a></li>`;
                    }
                    const p = e.data;
                    return html`<li class="card row entry entry-out">
                      <span class="ico ico-out">${icon('out', 20, 2.2)}</span>
                      <span class="grow">
                        <span class="name">Remise à ${entryTitle(g, e)}</span>
                        <span class="meta">Tour ${p.tour} · ${p.partial ? 'remise partielle' : 'cagnotte complète'}</span>
                        ${p.unpaidMembers && p.unpaidMembers.length
                          ? html`<span class="meta">Impayés reportés : ${p.unpaidMembers.map((member) => `${member.name} (${L.formatFCFA(member.amount)})`).join(', ')}</span>`
                          : ''}
                        ${p.confirmed
                          ? html`<span class="status status-paid">${icon('check', 13, 2.8)}Réception confirmée par le bénéficiaire</span>`
                          : html`<span class="status status-wait">En attente de confirmation</span>
                              <button type="button" class="btn btn-outline btn-sm" data-action="confirm-payout" data-id="${p.id}">Marquer comme confirmée</button>`}
                      </span>
                      <span class="amt">${L.formatNumber(p.amount)}</span>
                    </li>`;
                  })}
                </ul>
              </section>`
            )
          : html`<p class="muted">Aucune opération ${filter === 'all' ? 'enregistrée' : 'dans cette catégorie'} pour l'instant.</p>`}
      </div>

      <section class="print-only" aria-label="Relevé imprimable">
        <h2>Relevé · ${g.name}</h2>
        <p>Cotisation : ${L.formatFCFA(g.amount)} · ${L.FREQUENCIES[g.frequency].label.toLowerCase()} · ${g.members.length} membres · édité le ${L.formatDate(today)} par ${L.organizer(g).name}</p>
        <table>
          <thead><tr><th>Date</th><th>Opération</th><th>Membre</th><th>Tour</th><th>Moyen / Référence</th><th>Reçu / Statut</th><th>Montant (FCFA)</th></tr></thead>
          <tbody>
            ${chrono.map((e) => {
              const d = e.data;
              return e.kind === 'payment'
                ? html`<tr><td>${L.formatDateTime(d.date)}</td><td>Cotisation</td><td>${entryTitle(g, e)}</td><td>${d.tour}</td><td>${d.method}${d.ref ? ` · ${d.ref}` : ''}</td><td>${d.receiptNo}</td><td class="num">+${L.formatNumber(d.amount)}</td></tr>`
                : html`<tr><td>${L.formatDateTime(d.date)}</td><td>Remise</td><td>${entryTitle(g, e)}</td><td>${d.tour}</td><td>—</td><td>${d.confirmed ? `Confirmée le ${L.formatDateTime(d.confirmedAt)}` : 'Non confirmée'}</td><td class="num">−${L.formatNumber(d.amount)}</td></tr>`;
            })}
          </tbody>
          <tfoot>
            <tr><td colspan="6">Total des cotisations enregistrées</td><td class="num">${L.formatNumber(tot.collected)}</td></tr>
            <tr><td colspan="6">Total des remises effectuées</td><td class="num">${L.formatNumber(tot.paidOut)}</td></tr>
          </tfoot>
        </table>
      </section>

      <div class="row gap no-print push">
        ${icon('eye', 18, 2)}
        <span class="small muted">Chaque opération est datée et numérotée ; les reçus sont consultables par tous les membres.</span>
      </div>
      <a class="btn btn-outline no-print" href="https://wa.me/?text=${encodeURIComponent(L.summaryMessage(g, today))}" target="_blank" rel="noopener">${icon('share', 20, 2)}Partager le résumé sur WhatsApp</a>
    </main>
    ${tabbar('hist', g.id)}`;
}
