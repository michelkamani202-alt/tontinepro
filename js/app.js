// Point d'entrée : routeur par hash, actions, formulaires. Les données passent par store.js.
import * as L from './lib.js';
import { createStore } from './store.js';
import * as V from './views.js';
import { decryptBackup, encryptBackup } from './backup.js';

const API_BASE_URL = String(window.TONTINE_API_BASE_URL || '').replace(/\/+$/, '');

function apiFetch(path, options = {}) {
  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: API_BASE_URL ? 'include' : 'same-origin',
  });
}

function safeStorage() {
  try {
    const s = window.localStorage;
    const probe = '__tp_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null; // le store retombe sur une mémoire volatile
  }
}

const store = createStore(safeStorage());
let pendingLocalState = JSON.parse(JSON.stringify(store.get()));
let account = null;
let authReady = false;
let authMode = 'login';
let authError = '';
let authNotice = '';
let pendingVerificationEmail = '';
let registrationRequiresKey = false;
let emailVerificationRequired = true;
let serverRevision = 0;
let syncQueue = Promise.resolve();
const root = document.getElementById('app');
const toastHost = document.getElementById('toasts');
const installButton = document.createElement('button');
let deferredPrompt = null;

installButton.id = 'install-btn';
installButton.type = 'button';
installButton.className = 'btn btn-primary install-btn';
installButton.textContent = 'Installer';
installButton.hidden = true;
installButton.setAttribute('aria-label', 'Installer TontinePro');
installButton.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  if (choice.outcome === 'accepted') toast('Installation de TontinePro demandée.', 'ok');
  else toast('L’installation a été ignorée. Vous pourrez la relancer plus tard.', 'warn');
  deferredPrompt = null;
  installButton.hidden = true;
});
document.body.appendChild(installButton);

let draft = null;
let draftAddErrors = null;
let view = { errors: null, values: {} };
let historyFilter = 'all';
let lastPath = null;

// ---------- Utilitaires ----------

function toast(message, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  toastHost.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function persistWarning(ok) {
  if (!ok) {
    toast("Impossible d'enregistrer sur cet appareil (stockage plein ou bloqué). Les données restent visibles tant que la page est ouverte.", 'warn');
    return;
  }
  if (account && !account.local) {
    syncQueue = syncQueue.then(() => syncServerState()).catch((error) => {
      toast(error.message || 'La synchronisation serveur a échoué.', 'warn');
    });
  }
}

async function syncServerState() {
  const response = await apiFetch('/api/state', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ state: store.get(), revision: serverRevision }),
  });
  const result = await response.json();
  if (response.status === 409) {
    serverRevision = result.revision;
    throw new Error('Données modifiées sur un autre appareil. Vos changements restent sur cet appareil : exportez une sauvegarde avant de recharger.');
  }
  if (!response.ok) throw new Error(result.error || 'La synchronisation serveur a échoué.');
  serverRevision = result.revision;
}

function emptyLocalState() {
  return { version: 1, counter: 0, profile: { name: '', phone: '' }, activeGroupId: null, groups: [] };
}

async function loadAccountState(session) {
  account = session.user;
  serverRevision = session.revision;
  if (session.state) {
    if (!store.replaceState(session.state)) throw new Error('Les données reçues du serveur sont invalides.');
  } else if (pendingLocalState?.groups?.length) {
    if (window.confirm('Des groupes existent sur cet appareil. Voulez-vous les importer dans ce compte ?')) {
      if (!store.replaceState(pendingLocalState)) throw new Error('Impossible de conserver les données locales.');
      await syncServerState();
    } else {
      store.replaceState(emptyLocalState());
    }
  } else {
    store.replaceState(emptyLocalState());
  }
  pendingLocalState = null;
}

async function initialiseAccount() {
  try {
    const configResponse = await apiFetch('/api/config');
    if (!configResponse.ok) throw new Error('Impossible de charger la configuration du serveur.');
    const config = await configResponse.json();
    registrationRequiresKey = config.registrationRequiresKey === true;
    emailVerificationRequired = config.emailVerificationRequired !== false;
    const response = await apiFetch('/api/session');
    if (response.ok) await loadAccountState(await response.json());
    else if (response.status !== 401) throw new Error('Impossible de vérifier la session auprès du serveur.');
  } catch {
    // Mode autonome / local (PWA hors connexion ou GitHub Pages)
    const p = store.get().profile;
    account = { email: p?.name ? `${p.name} (Local)` : 'Organisateur (Local)', local: true };
  }
  authReady = true;
  lastPath = null;
  onRouteChange();
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function newDraft() {
  const p = store.get().profile;
  return {
    name: '',
    amount: '',
    frequency: 'monthly',
    startDate: L.todayISO(),
    orderMode: 'random',
    members: [{ name: p.name || '', phone: p.phone || '' }],
    newName: '',
    newPhone: '',
  };
}

function parseRoute() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return { path, parts, params: new URLSearchParams(query) };
}

// ---------- Rendu ----------

const TITLES = {
  loading: 'Connexion au serveur',
  auth: 'Connexion',
  verification: 'Validation de l’adresse e-mail',
  'reset-password': 'Réinitialisation du mot de passe',
  home: 'Vos groupes',
  new: 'Nouveau groupe',
  empty: 'Aucun groupe',
  group: 'Suivi du tour',
  calendar: 'Calendrier',
  pay: 'Enregistrer un paiement',
  receipt: 'Reçu',
  history: 'Historique',
  member: 'Ajouter un membre',
  missing: 'Introuvable',
};

function resolve(route) {
  const { parts, params } = route;
  const today = L.todayISO();
  const state = store.get();

  if (!authReady) return { name: 'loading', html: V.loadingView() };
  if (parts[0] === 'verification') return { name: 'verification', html: V.verifyEmailView({ token: params.get('token'), error: authError }) };
  if (parts[0] === 'reset-password') return { name: 'reset-password', html: V.resetPasswordView({ token: params.get('token'), error: authError }) };
  if (!account) return { name: 'auth', html: V.authView({ mode: authMode, error: authError, notice: authNotice, email: pendingVerificationEmail, registrationRequiresKey }) };

  if (parts.length === 0) return { name: 'home', html: V.homeView({ state, today, account }) };
  if (parts[0] === 'nouveau') {
    if (!draft) draft = newDraft();
    return { name: 'new', html: V.newGroupView({ draft, errors: view.errors, addErrors: draftAddErrors }) };
  }
  if (parts[0] === 'vide') return { name: 'empty', html: V.emptyView() };

  if (parts[0] === 'g' && parts[1]) {
    const g = store.getGroup(parts[1]);
    if (!g) return { name: 'missing', html: V.notFoundView() };
    if (store.get().activeGroupId !== g.id) {
      persistWarning(store.setActive(g.id));
    }
    const sub = parts[2];
    if (!sub) return { name: 'group', g, html: V.groupView({ g, today }) };
    if (sub === 'calendrier') return { name: 'calendar', g, html: V.calendarView({ g, today }) };
    if (sub === 'paiement') {
      return { name: 'pay', g, html: V.paymentView({ g, today, params, errors: view.errors, values: view.values }) };
    }
    if (sub === 'membre') return { name: 'member', g, html: V.addMemberView({ g, errors: view.errors, values: view.values }) };
    if (sub === 'historique') return { name: 'history', g, html: V.historyView({ g, filter: historyFilter, today }) };
    if (sub === 'recu' && parts[3]) {
      const p = g.payments.find((x) => x.id === parts[3]);
      if (!p) return { name: 'missing', html: V.notFoundView() };
      return { name: 'receipt', g, html: V.receiptView({ g, p }) };
    }
  }
  return { name: 'missing', html: V.notFoundView() };
}

function render({ fresh = false } = {}) {
  const route = parseRoute();
  const out = resolve(route);
  const scroller = root.querySelector('.screen');
  const keep = !fresh && scroller ? scroller.scrollTop : 0;

  root.innerHTML = String(out.html);
  document.title = `${TITLES[out.name] || 'TontinePro'} — TontinePro`;

  const screen = root.querySelector('.screen');
  if (fresh) {
    const h1 = root.querySelector('h1');
    if (h1) {
      h1.setAttribute('tabindex', '-1');
      h1.focus({ preventScroll: true });
    }
  } else if (screen) {
    screen.scrollTop = keep;
  }
  const alert = root.querySelector('#form-errors');
  if (alert && !fresh) alert.scrollIntoView({ block: 'center' });
}

function onRouteChange() {
  const { path } = parseRoute();
  if (path !== lastPath) {
    view = { errors: null, values: {} };
    draftAddErrors = null;
    if (path !== '/nouveau') draft = null;
    lastPath = path;
    render({ fresh: true });
  } else {
    render();
  }
}

// ---------- Brouillon de groupe ----------

function setDraftField(key, value) {
  if (!draft) return false;
  switch (key) {
    case 'name':
    case 'amount':
    case 'frequency':
    case 'startDate':
    case 'newName':
    case 'newPhone':
      draft[key] = value;
      return false;
    case 'orderMode': {
      const changed = draft.orderMode !== value;
      draft.orderMode = value;
      return changed;
    }
    case 'm0name':
      draft.members[0].name = value;
      return false;
    case 'm0phone':
      draft.members[0].phone = value;
      return false;
    default:
      return false;
  }
}

function addDraftMember() {
  const r = L.validateMemberFields({ name: draft.newName, phone: draft.newPhone }, draft.members, 'Ce membre');
  if (draft.members.length >= 50) {
    r.errors.push({ field: 'members', message: 'Un groupe peut compter 50 membres au maximum.' });
  }
  if (r.errors.length) {
    draftAddErrors = r.errors;
    render();
    return;
  }
  draft.members.push({ name: r.name, phone: r.phone });
  draft.newName = '';
  draft.newPhone = '';
  draftAddErrors = null;
  render();
  const input = document.getElementById('f-newname');
  if (input) input.focus();
}

function moveDraft(index, delta) {
  const j = index + delta;
  if (index < 0 || j < 0 || index >= draft.members.length || j >= draft.members.length) return;
  [draft.members[index], draft.members[j]] = [draft.members[j], draft.members[index]];
  render();
}

// ---------- Actions ----------

const actions = {
  'auth-toggle': () => {
    authMode = authMode === 'login' ? 'register' : 'login';
    authError = '';
    authNotice = '';
    render({ fresh: true });
  },
  'forgot-password': () => {
    authMode = 'forgot';
    authError = '';
    authNotice = '';
    render({ fresh: true });
  },
  logout: async () => {
    if (account?.local) {
      if (window.confirm('Voulez-vous réinitialiser les données locales de cet appareil ? Pensez à exporter une sauvegarde chiffrée avant.')) {
        store.replaceState(emptyLocalState());
        go('#/');
      }
      return;
    }
    try {
      await apiFetch('/api/logout', { method: 'POST' });
    } catch {
      // La copie locale sera effacée même si le serveur est hors ligne.
    }
    account = null;
    serverRevision = 0;
    store.replaceState(emptyLocalState());
    authMode = 'login';
    authError = '';
    go('#/');
  },
  'backup-export': async () => {
    const passphrase = window.prompt('Choisissez une phrase secrète d’au moins 12 caractères pour chiffrer la sauvegarde.');
    if (passphrase === null) return;
    const confirmation = window.prompt('Saisissez à nouveau la phrase secrète pour confirmer.');
    if (passphrase !== confirmation) {
      toast('Les deux phrases secrètes ne correspondent pas.', 'warn');
      return;
    }
    try {
      const content = await encryptBackup(store.get(), passphrase);
      const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `tontinepro-sauvegarde-${L.todayISO()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast('Sauvegarde chiffrée téléchargée. Conservez votre phrase secrète.');
    } catch (error) {
      toast(error.message || 'Impossible de créer la sauvegarde.', 'warn');
    }
  },
  'backup-import': () => document.getElementById('backup-file')?.click(),
  'draft-add': () => draft && addDraftMember(),
  'draft-remove': (el) => {
    const i = Number(el.dataset.index);
    if (draft && i > 0 && i < draft.members.length) {
      draft.members.splice(i, 1);
      render();
    }
  },
  'draft-up': (el) => draft && moveDraft(Number(el.dataset.index), -1),
  'draft-down': (el) => draft && moveDraft(Number(el.dataset.index), 1),
  filter: (el) => {
    historyFilter = ['all', 'payment', 'payout'].includes(el.dataset.filter) ? el.dataset.filter : 'all';
    render();
  },
  'delete-group': (el) => {
    const group = store.getGroup(el.dataset.id);
    if (!group || !window.confirm(`Supprimer définitivement le groupe « ${group.name} » et tous ses paiements, remises et reçus ?`)) return;
    if (!store.removeGroup(group.id)) {
      toast('La suppression du groupe n’a pas pu être enregistrée.', 'warn');
      return;
    }
    persistWarning(true);
    toast(`Groupe « ${group.name} » supprimé.`);
    draft = null;
    go('#/');
  },
  'delete-member': (el) => {
    const group = currentGroup();
    if (!group) return;
    const member = L.memberById(group, el.dataset.id);
    if (!member || !window.confirm(`Retirer ${member.name} du groupe « ${group.name} » ?`)) return;
    const result = store.removeMember(group.id, member.id);
    if (result.errors) {
      toast(result.errors[0].message, 'warn');
      return;
    }
    persistWarning(true);
    toast(`${member.name} a été retiré du groupe.`);
    render();
  },
  print: () => {
    const g = currentGroup();
    const previous = document.title;
    if (g) document.title = `TontinePro - ${g.name}`;
    window.print();
    document.title = previous;
  },
  payout: () => {
    const g = currentGroup();
    if (!g) return;
    const c = L.canPayout(g);
    if (!c.ok) {
      toast(c.reason, 'warn');
      return;
    }
    const ben = L.beneficiary(g, c.tour);
    if (!window.confirm(`Enregistrer la remise de ${L.formatFCFA(c.amount)} à ${ben.name} (tour ${c.tour}) ?`)) return;
    const r = L.addPayout(g);
    if (r.errors) {
      toast(r.errors[0].message, 'warn');
      return;
    }
    persistWarning(store.save());
    toast(`Remise enregistrée pour ${ben.name}.`);
    render();
  },
  'payout-partial': () => {
    const g = currentGroup();
    if (!g) return;
    const c = L.canPayout(g, L.todayISO(), { allowUnpaid: true });
    if (!c.ok) {
      toast(c.reason, 'warn');
      return;
    }
    const ben = L.beneficiary(g, c.tour);
    const debtors = c.unpaidMembers.map((member) => `${member.name} : ${L.formatFCFA(member.amount)}`).join(', ');
    const confirmation = `Remettre ${L.formatFCFA(c.amount)} à ${ben.name} pour le tour ${c.tour} ? Les impayés (${debtors}) seront reportés aux prochaines cotisations.`;
    if (!window.confirm(confirmation)) return;
    const result = L.addPayout(g, { allowUnpaid: true });
    if (result.errors) {
      toast(result.errors[0].message, 'warn');
      return;
    }
    persistWarning(store.save());
    toast(`Remise partielle enregistrée. ${L.formatFCFA(result.payout.shortfall)} d’impayés reportés.`);
    render();
  },
  'confirm-payout': (el) => {
    const g = currentGroup();
    if (!g) return;
    const p = L.confirmPayout(g, el.dataset.id);
    if (!p) return;
    persistWarning(store.save());
    toast('Réception confirmée par le bénéficiaire.');
    render();
  },
};

function currentGroup() {
  const { parts } = parseRoute();
  return parts[0] === 'g' ? store.getGroup(parts[1]) : null;
}

// ---------- Formulaires ----------

const forms = {
  auth: async (form) => {
    const fd = new FormData(form);
    const endpoint = authMode === 'register' ? '/api/register' : '/api/login';
    try {
      const response = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: String(fd.get('email') || ''),
          password: String(fd.get('password') || ''),
          registrationKey: String(fd.get('registrationKey') || ''),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Connexion impossible.');
      if (result.verificationRequired) {
        pendingVerificationEmail = result.email || String(fd.get('email') || '');
        authMode = 'pending';
        authError = '';
        authNotice = result.emailSent
          ? 'Consultez votre boîte de réception et confirmez votre adresse avant de vous connecter.'
          : 'Le compte est créé, mais l’e-mail n’a pas pu être envoyé. Vous pouvez demander un nouveau lien.';
        render({ fresh: true });
        return;
      }
      const sessionResponse = await apiFetch('/api/session');
      if (!sessionResponse.ok) throw new Error('La session n’a pas pu être ouverte.');
      await loadAccountState(await sessionResponse.json());
      authReady = true;
      authError = '';
      authNotice = '';
      lastPath = null;
      go('#/');
    } catch (error) {
      authError = error.message || 'Connexion impossible. Vérifiez le serveur et réessayez.';
      render({ fresh: true });
    }
  },
  'verify-email': async (form) => {
    const fd = new FormData(form);
    try {
      const response = await apiFetch('/api/verify-email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: String(fd.get('token') || '') }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Lien de validation invalide ou expiré.');
      const sessionResponse = await apiFetch('/api/session');
      if (!sessionResponse.ok) throw new Error('La validation a réussi, mais la session n’a pas pu être ouverte.');
      await loadAccountState(await sessionResponse.json());
      authReady = true;
      authError = '';
      go('#/');
    } catch (error) {
      authError = error.message || 'Impossible de valider cette adresse e-mail.';
      render({ fresh: true });
    }
  },
  'resend-verification': async (form) => {
    const email = String(new FormData(form).get('email') || '');
    try {
      const response = await apiFetch('/api/resend-verification', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Impossible de renvoyer le lien.');
      authNotice = result.message;
      authError = '';
      pendingVerificationEmail = email;
      render({ fresh: true });
    } catch (error) {
      authError = error.message || 'Impossible de renvoyer le lien.';
      render({ fresh: true });
    }
  },
  'forgot-password': async (form) => {
    const email = String(new FormData(form).get('email') || '');
    try {
      const response = await apiFetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Impossible de traiter la demande.');
      authNotice = result.message;
      authError = '';
      render({ fresh: true });
    } catch (error) {
      authError = error.message || 'Impossible de traiter la demande.';
      render({ fresh: true });
    }
  },
  'reset-password': async (form) => {
    const fd = new FormData(form);
    const password = String(fd.get('password') || '');
    if (password !== String(fd.get('confirmation') || '')) {
      authError = 'Les deux mots de passe ne correspondent pas.';
      render({ fresh: true });
      return;
    }
    try {
      const response = await apiFetch('/api/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: String(fd.get('token') || ''), password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Lien de récupération invalide ou expiré.');
      authMode = 'login';
      authNotice = result.message;
      authError = '';
      go('#/');
    } catch (error) {
      authError = error.message || 'Impossible de réinitialiser le mot de passe.';
      render({ fresh: true });
    }
  },
  'new-group': () => {
    const r = L.createGroup(draft);
    if (r.errors) {
      view.errors = r.errors;
      render();
      return;
    }
    const org = r.group.members[0];
    store.setProfile(org.name, org.phone);
    persistWarning(store.addGroup(r.group));
    toast(`Groupe « ${r.group.name} » créé.`);
    draft = null;
    view = { errors: null, values: {} };
    go(`#/g/${r.group.id}`);
  },

  member: (form) => {
    const g = currentGroup();
    if (!g) return;
    const fd = new FormData(form);
    const values = { name: String(fd.get('name') || ''), phone: String(fd.get('phone') || '') };
    const r = L.addMember(g, values);
    if (r.errors) {
      view = { errors: r.errors, values };
      render();
      return;
    }
    persistWarning(store.save());
    toast(`${r.member.name} a été ajouté(e) au groupe.`);
    view = { errors: null, values: {} };
    go(`#/g/${g.id}`);
  },

  payment: (form) => {
    const g = currentGroup();
    if (!g) return;
    const fd = new FormData(form);
    const input = {
      memberId: String(fd.get('memberId') || ''),
      amount: String(fd.get('amount') || ''),
      method: String(fd.get('method') || ''),
      ref: String(fd.get('ref') || ''),
      channel: String(fd.get('channel') || 'whatsapp'),
    };
    const r = L.addPayment(g, input, { nextReceiptNo: () => store.nextReceiptNo() });
    if (r.errors) {
      view = { errors: r.errors, values: input };
      render();
      return;
    }
    persistWarning(store.save());
    toast(r.duplicate ? 'Absence déjà prise en compte. Utilisez la remise partielle en haut du suivi pour avancer.' : r.payment.amount === 0 ? 'Absence de cotisation enregistrée.' : 'Paiement enregistré.');
    view = { errors: null, values: {} };
    go(`#/g/${g.id}/recu/${r.payment.id}`);
  },
};

// ---------- Écouteurs globaux ----------

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || !root.contains(el)) return;
  const fn = actions[el.dataset.action];
  if (fn) {
    e.preventDefault();
    fn(el);
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const fn = forms[form.dataset.form];
  if (fn) fn(form);
});

function onFieldChange(e) {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;

  if (t.id === 'p-amount') {
    const noContribution = L.parseContributionAmount(t.value) === 0;
    const methodField = document.getElementById('method-field');
    const method = document.querySelector('[data-pay="method"]:checked');
    const refField = document.getElementById('ref-field');
    if (methodField) methodField.hidden = noContribution;
    if (refField) refField.hidden = noContribution || method?.value === 'Espèces';
    return;
  }

  if (t.dataset.bind) {
    if (setDraftField(t.dataset.bind, t.value)) render();
    return;
  }
  if (t.dataset.pay === 'member' && t instanceof HTMLSelectElement) {
    const opt = t.options[t.selectedIndex];
    const amount = document.getElementById('p-amount');
    if (opt && amount) amount.value = opt.dataset.remaining || '';
    return;
  }
  if (t.dataset.pay === 'method') {
    const refField = document.getElementById('ref-field');
    if (refField) refField.hidden = t.value === 'Espèces';
  }
}
document.addEventListener('input', onFieldChange);
document.addEventListener('change', onFieldChange);
document.addEventListener('change', async (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.id !== 'backup-file' || !input.files?.length) return;
  const file = input.files[0];
  input.value = '';
  if (file.size > 20 * 1024 * 1024) {
    toast('Le fichier de sauvegarde est trop volumineux.', 'warn');
    return;
  }
  const passphrase = window.prompt('Entrez la phrase secrète de cette sauvegarde.');
  if (passphrase === null) return;
  try {
    const state = await decryptBackup(await file.text(), passphrase);
    if (!store.replaceState(state)) throw new Error('Données de sauvegarde invalides ou stockage indisponible.');
    persistWarning(true);
    toast('Sauvegarde restaurée.');
    go('#/');
  } catch (error) {
    toast(error.message || 'Impossible de restaurer la sauvegarde.', 'warn');
  }
});

// Entrée dans les champs « nouveau membre » : ajoute le membre au lieu de valider le formulaire.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;
  if (t.dataset.bind === 'newName' || t.dataset.bind === 'newPhone') {
    e.preventDefault();
    if (draft) addDraftMember();
  }
});

window.addEventListener('hashchange', onRouteChange);

// ---------- Démarrage ----------

initialiseAccount();

if (window.matchMedia('(display-mode: standalone)').matches) installButton.hidden = true;

if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !new URLSearchParams(location.search).has('nosw')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  installButton.hidden = false;
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  installButton.hidden = true;
  toast('TontinePro a été installée sur cet appareil.', 'ok');
});

window.__tontinepro = { store }; // utile pour le débogage et les tests
