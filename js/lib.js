// Logique métier de TontinePro : fonctions pures, sans accès au DOM.
// Les dates "jour" sont des chaînes ISO locales "AAAA-MM-JJ" (pas de fuseau),
// les dates "horodatées" des chaînes "AAAA-MM-JJTHH:MM".

export const NBSP = ' ';

export const FREQUENCIES = Object.freeze({
  weekly: { label: 'Chaque semaine', unit: 'semaine' },
  biweekly: { label: 'Tous les 15 jours', unit: '15 jours' },
  monthly: { label: 'Chaque mois', unit: 'mois' },
});

export const METHODS = Object.freeze(['MTN MoMo', 'Orange Money', 'Espèces']);
export const ORDER_MODES = Object.freeze(['random', 'manual']);

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MAX_MEMBERS = 50;

const pad = (n, w = 2) => String(n).padStart(w, '0');

// ---------- Identifiants ----------

let seq = 0;
export function uid() {
  seq = (seq + 1) % 1679616;
  const r = Math.floor(Math.random() * 2176782336).toString(36).padStart(6, '0');
  return 'i' + Date.now().toString(36) + r + seq.toString(36);
}

export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Nombres et montants ----------

export function formatNumber(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

export function formatFCFA(n) {
  return `${formatNumber(n)}${NBSP}FCFA`;
}

// Entier strictement positif, espaces tolérés. Retourne NaN sinon.
export function parseAmount(input) {
  const s = String(input ?? '').replace(/[\s  ]/g, '');
  if (!/^\d+$/.test(s)) return NaN;
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : NaN;
}

export function parseContributionAmount(input) {
  const s = String(input ?? '').replace(/[\s  ]/g, '');
  if (!/^\d+$/.test(s)) return NaN;
  const n = Number(s);
  return Number.isSafeInteger(n) && n >= 0 ? n : NaN;
}

// ---------- Dates ----------

export function parseISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? ''));
  if (!m) return null;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

export function toISO(dt) {
  return `${pad(dt.getFullYear(), 4)}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export function todayISO(now = new Date()) {
  return toISO(now);
}

export function toDateTime(now = new Date()) {
  return `${toISO(now)}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function addPeriod(iso, frequency, k) {
  const dt = parseISO(iso);
  if (!dt) throw new Error('Date invalide : ' + iso);
  if (frequency === 'weekly') {
    dt.setDate(dt.getDate() + 7 * k);
    return toISO(dt);
  }
  if (frequency === 'biweekly') {
    dt.setDate(dt.getDate() + 14 * k);
    return toISO(dt);
  }
  if (frequency === 'monthly') {
    const day = dt.getDate();
    const t = new Date(dt.getFullYear(), dt.getMonth() + k, 1);
    const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    t.setDate(Math.min(day, last));
    return toISO(t);
  }
  throw new Error('Fréquence inconnue : ' + frequency);
}

// Nombre de jours entre deux dates ISO (b - a).
export function daysBetween(a, b) {
  const da = parseISO(a);
  const db = parseISO(b);
  if (!da || !db) return 0;
  return Math.round((db - da) / 86400000);
}

export function formatDate(iso) {
  const d = parseISO(iso);
  if (!d) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function dayAndMonth(iso) {
  const d = parseISO(iso);
  if (!d) return { day: '', month: '' };
  return { day: String(d.getDate()), month: MONTHS[d.getMonth()] };
}

export function formatDateNumeric(iso) {
  const d = parseISO(iso);
  if (!d) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatDateTime(s) {
  const [d, t] = String(s ?? '').split('T');
  const date = formatDate(d);
  return t ? `${date} à ${t}` : date;
}

// ---------- Personnes ----------

export function cleanName(s) {
  return String(s ?? '').trim().replace(/\s+/g, ' ');
}

export function firstName(name) {
  return cleanName(name).split(' ')[0] || '';
}

export function initials(name) {
  const parts = cleanName(name).split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  const first = Array.from(parts[0])[0] || '';
  const last = parts.length > 1 ? Array.from(parts[parts.length - 1])[0] || '' : '';
  return (first + last).toUpperCase() || '?';
}

// Retourne le numéro au format international (+237…) ou null s'il est invalide.
export function normalizePhone(input) {
  let s = String(input ?? '').trim().replace(/[\s.\-()]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (/^6\d{8}$/.test(s)) s = '+237' + s;
  else if (/^237\d{9}$/.test(s)) s = '+' + s;
  return /^\+\d{8,15}$/.test(s) ? s : null;
}

export function formatPhone(p) {
  if (/^\+237\d{9}$/.test(p)) {
    const d = p.slice(4);
    return `+237 ${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
  }
  return p;
}

// Vérifie un membre (nom + téléphone) contre la liste de ceux déjà présents.
export function validateMemberFields(m, existing, label = 'Le membre') {
  const errors = [];
  const name = cleanName(m.name);
  const phone = normalizePhone(m.phone);
  if (name.length < 2 || name.length > 60) {
    errors.push({ field: 'name', message: `${label} : le nom doit contenir entre 2 et 60 caractères.` });
  } else if (existing.some((e) => cleanName(e.name).toLowerCase() === name.toLowerCase())) {
    errors.push({ field: 'name', message: `${label} : un membre porte déjà le nom « ${name} ».` });
  }
  if (!phone) {
    errors.push({ field: 'phone', message: `${label} : numéro invalide (exemple : 677 00 00 00 ou +237 677 00 00 00).` });
  } else if (existing.some((e) => normalizePhone(e.phone) === phone)) {
    errors.push({ field: 'phone', message: `${label} : ce numéro est déjà utilisé par un autre membre.` });
  }
  return { errors, name, phone };
}

// ---------- Groupes ----------

export function validateGroupDraft(d) {
  const errors = [];
  const name = cleanName(d.name);
  if (name.length < 2 || name.length > 60) {
    errors.push({ field: 'name', message: 'Le nom du groupe doit contenir entre 2 et 60 caractères.' });
  }
  if (Number.isNaN(parseAmount(d.amount))) {
    errors.push({ field: 'amount', message: 'La cotisation doit être un nombre entier de FCFA supérieur à 0.' });
  }
  if (!FREQUENCIES[d.frequency]) {
    errors.push({ field: 'frequency', message: 'Choisissez une fréquence.' });
  }
  if (!parseISO(d.startDate)) {
    errors.push({ field: 'startDate', message: 'Indiquez une date valide pour le premier tour.' });
  }
  if (!ORDER_MODES.includes(d.orderMode)) {
    errors.push({ field: 'orderMode', message: "Choisissez l'ordre des bénéficiaires." });
  }
  const members = Array.isArray(d.members) ? d.members : [];
  if (members.length < 2) {
    errors.push({ field: 'members', message: 'Ajoutez au moins un autre membre (2 membres minimum).' });
  }
  if (members.length > MAX_MEMBERS) {
    errors.push({ field: 'members', message: `Un groupe peut compter ${MAX_MEMBERS} membres au maximum.` });
  }
  const seen = [];
  members.forEach((m, i) => {
    const label = i === 0 ? 'Vous' : `Membre ${i + 1}`;
    const r = validateMemberFields(m, seen, label);
    errors.push(...r.errors);
    seen.push({ name: m.name, phone: m.phone });
  });
  return errors;
}

export function createGroup(draft, { rng = Math.random, now = new Date(), makeId = uid } = {}) {
  const errors = validateGroupDraft(draft);
  if (errors.length) return { errors };
  const members = draft.members.map((m, i) => ({
    id: makeId(),
    name: cleanName(m.name),
    phone: normalizePhone(m.phone),
    role: i === 0 ? 'organizer' : 'member',
    joinedTour: 1,
  }));
  const ids = members.map((m) => m.id);
  const group = {
    id: makeId(),
    name: cleanName(draft.name),
    amount: parseAmount(draft.amount),
    frequency: draft.frequency,
    startDate: draft.startDate,
    orderMode: draft.orderMode,
    members,
    order: draft.orderMode === 'random' ? shuffle(ids, rng) : ids,
    payments: [],
    payouts: [],
    createdAt: toDateTime(now),
  };
  return { group };
}

export const memberById = (g, id) => g.members.find((m) => m.id === id) || null;
export const organizer = (g) => g.members.find((m) => m.role === 'organizer') || g.members[0];
export const tourCount = (g) => g.order.length;
export const tourDate = (g, t) => addPeriod(g.startDate, g.frequency, t - 1);
export const beneficiary = (g, t) => memberById(g, g.order[t - 1]);
export const payoutFor = (g, t) => g.payouts.find((p) => p.tour === t) || null;
export const participants = (g, t) => g.members.filter((m) => m.joinedTour <= t);

// Premier tour dont la remise n'a pas encore été faite ; null si le cycle est terminé.
export function currentTour(g) {
  for (let t = 1; t <= g.order.length; t++) {
    if (!payoutFor(g, t)) return t;
  }
  return null;
}

// Un membre ajouté en cours de cycle cotise à partir du tour en cours
// et reçoit en dernier (ou au tour suivant si le cycle était terminé).
export function addMember(g, input, { makeId = uid } = {}) {
  if (g.members.length >= MAX_MEMBERS) {
    return { errors: [{ field: 'form', message: `Un groupe peut compter ${MAX_MEMBERS} membres au maximum.` }] };
  }
  const r = validateMemberFields(input, g.members, 'Le membre');
  if (r.errors.length) return { errors: r.errors };
  const joinedTour = currentTour(g) ?? g.order.length + 1;
  const member = { id: makeId(), name: r.name, phone: r.phone, role: 'member', joinedTour };
  g.members.push(member);
  g.order.push(member.id);
  return { member, joinedTour, receivesTour: g.order.length };
}

export function removeMember(g, memberId) {
  const index = g.members.findIndex((member) => member.id === memberId);
  if (index < 0) return { errors: [{ field: 'member', message: 'Ce membre n’existe plus dans le groupe.' }] };
  if (g.members[index].role === 'organizer' || organizer(g).id === memberId) {
    return { errors: [{ field: 'member', message: 'L’organisateur ne peut pas être supprimé du groupe.' }] };
  }
  if (g.members.length <= 2) {
    return { errors: [{ field: 'member', message: 'Un groupe doit conserver au moins deux membres.' }] };
  }
  if (g.payments.length || g.payouts.length) {
    return { errors: [{ field: 'member', message: 'Impossible de supprimer un membre après le début des paiements : cela préservera les reçus et l’historique.' }] };
  }
  g.members.splice(index, 1);
  g.order = g.order.filter((id) => id !== memberId);
  return { memberId };
}

// ---------- Cotisations ----------

export function paidAmount(g, t, memberId) {
  return g.payments
    .filter((p) => p.memberId === memberId)
    .reduce((sum, p) => {
      if (Array.isArray(p.allocations)) {
        return sum + p.allocations.filter((allocation) => allocation.tour === t).reduce((amount, allocation) => amount + allocation.amount, 0);
      }
      return sum + (p.tour === t ? p.amount : 0);
    }, 0);
}

function arrearsDetails(g, beforeTour, memberId) {
  const member = memberById(g, memberId);
  if (!member) return [];
  const arrears = [];
  for (let t = member.joinedTour; t < beforeTour; t++) {
    if (participants(g, t).some((participant) => participant.id === memberId)) {
      const amount = Math.max(0, g.amount - paidAmount(g, t, memberId));
      if (amount > 0) arrears.push({ tour: t, amount });
    }
  }
  return arrears;
}

export function arrearsAmount(g, beforeTour, memberId) {
  return arrearsDetails(g, beforeTour, memberId).reduce((sum, arrear) => sum + arrear.amount, 0);
}

export function lastPayment(g, t, memberId) {
  const list = g.payments.filter((p) => p.tour === t && p.memberId === memberId);
  return list.length ? list[list.length - 1] : null;
}

export function memberStatus(g, t, memberId, today = todayISO()) {
  const paid = paidAmount(g, t, memberId);
  const arrearsList = t === currentTour(g) ? arrearsDetails(g, t, memberId) : [];
  const arrears = arrearsList.reduce((sum, arrear) => sum + arrear.amount, 0);
  const remaining = Math.max(0, g.amount - paid) + arrears;
  const due = tourDate(g, t);
  if (remaining === 0) return { state: 'paid', paid, remaining, arrears, daysLate: 0, due };
  const oldestDue = arrearsList.length ? tourDate(g, arrearsList[0].tour) : due;
  const late = daysBetween(oldestDue, today);
  if (late > 0) return { state: 'late', paid, remaining, arrears, daysLate: late, due };
  return { state: 'pending', paid, remaining, arrears, daysLate: 0, due };
}

export function tourSummary(g, t, today = todayISO()) {
  const ps = participants(g, t);
  let collected = 0;
  let paidCount = 0;
  let lateCount = 0;
  let pendingCount = 0;
  for (const m of ps) {
    const s = memberStatus(g, t, m.id, today);
    if (s.state === 'paid') paidCount++;
    else if (s.state === 'late') lateCount++;
    else pendingCount++;
  }
  collected = g.payments.filter((payment) => payment.tour === t).reduce((sum, payment) => sum + payment.amount, 0);
  const arrears = ps.reduce((sum, member) => sum + arrearsAmount(g, t, member.id), 0);
  return { tour: t, total: ps.length, expected: g.amount * ps.length + arrears, collected, paidCount, lateCount, pendingCount, arrears };
}

export function makeReceiptNo(year, n) {
  return `TP-${year}-${pad(n, 4)}`;
}

// `nextReceiptNo` n'est appelé qu'une fois la saisie validée (pas de numéro gaspillé).
export function addPayment(g, input, { now = new Date(), makeId = uid, nextReceiptNo } = {}) {
  const t = currentTour(g);
  if (t === null) {
    return { errors: [{ field: 'form', message: 'Le cycle est terminé : aucune cotisation à encaisser.' }] };
  }
  const errors = [];
  const member = participants(g, t).find((m) => m.id === input.memberId);
  if (!member) errors.push({ field: 'member', message: 'Choisissez un membre.' });

  const amount = parseContributionAmount(input.amount);
  if (Number.isNaN(amount)) {
    errors.push({ field: 'amount', message: 'Le montant doit être un nombre entier de FCFA supérieur ou égal à 0.' });
  } else if (member) {
    const remaining = memberStatus(g, t, member.id).remaining;
    if (remaining <= 0) {
      errors.push({ field: 'member', message: `${member.name} a déjà cotisé pour ce tour.` });
    } else if (amount > remaining) {
      errors.push({ field: 'amount', message: `Le montant dépasse le reste à payer (${formatFCFA(remaining)}).` });
    }
  }

  if (amount > 0 && !METHODS.includes(input.method)) {
    errors.push({ field: 'method', message: 'Choisissez un moyen de paiement.' });
  }

  let ref = '';
  if (amount > 0 && input.method && input.method !== 'Espèces') {
    ref = String(input.ref ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
    if (ref.length < 4 || ref.length > 40 || !/^[A-Z0-9._\-/ ]+$/.test(ref)) {
      errors.push({
        field: 'ref',
        message: 'La référence de la transaction est obligatoire (4 à 40 caractères : lettres, chiffres, . _ - /).',
      });
    } else if (g.payments.some((p) => p.ref && p.ref === ref)) {
      errors.push({ field: 'ref', message: 'Cette référence a déjà été enregistrée : un paiement ne peut être compté qu\'une fois.' });
    }
  }
  if (amount === 0 && member) {
    const previousAbsence = g.payments.find((p) => p.tour === t && p.memberId === member.id && p.amount === 0);
    if (previousAbsence) return { payment: previousAbsence, duplicate: true };
  }

  if (errors.length) return { errors };

  const allocations = [];
  if (amount > 0) {
    let remainingToAllocate = amount;
    for (let dueTour = member.joinedTour; dueTour <= t && remainingToAllocate > 0; dueTour++) {
      const outstanding = Math.max(0, g.amount - paidAmount(g, dueTour, member.id));
      const applied = Math.min(outstanding, remainingToAllocate);
      if (applied > 0) allocations.push({ tour: dueTour, amount: applied });
      remainingToAllocate -= applied;
    }
  }

  const payment = {
    id: makeId(),
    receiptNo: nextReceiptNo ? nextReceiptNo() : makeReceiptNo(now.getFullYear(), g.payments.length + 1),
    tour: t,
    memberId: member.id,
    amount,
    method: amount === 0 ? 'Non payé' : input.method,
    ref,
    allocations,
    date: toDateTime(now),
    recordedBy: organizer(g).name,
    channel: input.channel === 'sms' ? 'sms' : 'whatsapp',
  };
  g.payments.push(payment);
  return { payment };
}

// ---------- Remises ----------

export function canPayout(g, today = todayISO(), { allowUnpaid = false } = {}) {
  const t = currentTour(g);
  if (t === null) return { ok: false, reason: 'Le cycle est terminé : toutes les remises ont été faites.' };
  const s = tourSummary(g, t, today);
  if (s.paidCount < s.total) {
    const unpaidMembers = participants(g, t)
      .map((member) => ({ memberId: member.id, name: member.name, amount: memberStatus(g, t, member.id, today).remaining }))
      .filter((member) => member.amount > 0);
    const shortfall = unpaidMembers.reduce((sum, member) => sum + member.amount, 0);
    if (!allowUnpaid) {
      const left = unpaidMembers.length;
      return {
        ok: false,
        tour: t,
        partialAvailable: s.collected > 0,
        amount: s.collected,
        shortfall,
        unpaidMembers,
        reason: `La remise complète attend ${left} cotisation${left > 1 ? 's' : ''} impayée${left > 1 ? 's' : ''}. Vous pouvez remettre uniquement la somme collectée et reporter les arriérés.`,
      };
    }
    if (s.collected <= 0) {
      const left = unpaidMembers.length;
      return {
        ok: false,
        tour: t,
        reason: `La remise complète sera possible quand tout le monde aura cotisé (${left} cotisation${left > 1 ? 's' : ''} en attente). Une remise partielle sera possible après le premier encaissement.`,
      };
    }
    return { ok: true, tour: t, amount: s.collected, partial: true, shortfall, unpaidMembers };
  }
  return { ok: true, tour: t, amount: s.collected, partial: false, shortfall: 0, unpaidMembers: [] };
}

export function addPayout(g, { now = new Date(), makeId = uid, allowUnpaid = false } = {}) {
  const c = canPayout(g, todayISO(now), { allowUnpaid });
  if (!c.ok) return { errors: [{ field: 'form', message: c.reason }] };
  const payout = {
    id: makeId(),
    tour: c.tour,
    memberId: g.order[c.tour - 1],
    amount: c.amount,
    partial: c.partial,
    shortfall: c.shortfall,
    unpaidMembers: c.unpaidMembers,
    date: toDateTime(now),
    confirmed: false,
    confirmedAt: null,
  };
  g.payouts.push(payout);
  return { payout };
}

export function confirmPayout(g, payoutId, now = new Date()) {
  const p = g.payouts.find((x) => x.id === payoutId);
  if (!p) return null;
  if (!p.confirmed) {
    p.confirmed = true;
    p.confirmedAt = toDateTime(now);
  }
  return p;
}

// ---------- Historique ----------

// Du plus récent au plus ancien.
export function historyEntries(g) {
  const list = [];
  g.payments.forEach((p) => list.push({ kind: 'payment', date: p.date, data: p }));
  g.payouts.forEach((p) => list.push({ kind: 'payout', date: p.date, data: p }));
  return list
    .map((e, seq) => ({ ...e, seq }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.seq - a.seq);
}

export function totals(g) {
  return {
    collected: g.payments.reduce((s, p) => s + p.amount, 0),
    paidOut: g.payouts.reduce((s, p) => s + p.amount, 0),
  };
}

// ---------- Messages et liens ----------

export function receiptMessage(g, p) {
  const m = memberById(g, p.memberId);
  if (p.amount === 0) {
    return (
      `Bonjour ${firstName(m ? m.name : '')}, aucune cotisation n'a été reçue ` +
      `(tour ${p.tour}, ${g.name}) le ${formatDateNumeric(p.date.slice(0, 10))}. ` +
      `Non-paiement enregistré sous le numéro ${p.receiptNo}.`
    );
  }
  const ref = p.method === 'Espèces' ? 'Paiement en espèces.' : `Réf. ${p.method} : ${p.ref}.`;
  const arrears = (p.allocations || [])
    .filter((allocation) => allocation.tour < p.tour)
    .map((allocation) => `Tour ${allocation.tour} : ${formatFCFA(allocation.amount)}`)
    .join(', ');
  return (
    `Bonjour ${firstName(m ? m.name : '')}, votre cotisation de ${formatFCFA(p.amount)} ` +
    `(tour ${p.tour}, ${g.name}) est bien enregistrée le ${formatDateNumeric(p.date.slice(0, 10))}. ` +
    `${ref}${arrears ? ` Arriérés réglés : ${arrears}.` : ''} Reçu n° ${p.receiptNo}. Merci !`
  );
}

export function reminderMessage(g, m, t, today = todayISO()) {
  const st = memberStatus(g, t, m.id, today);
  const due = formatDate(st.due);
  const lead =
    st.state === 'late'
      ? `votre cotisation du tour ${t} de « ${g.name} » était attendue le ${due}.`
      : `rappel : votre cotisation du tour ${t} de « ${g.name} » est attendue le ${due}.`;
  return `Bonjour ${firstName(m.name)}, ${lead} Reste à régler : ${formatFCFA(st.remaining)}. Merci !`;
}

export function summaryMessage(g, today = todayISO()) {
  const t = currentTour(g);
  const lines = [`TontinePro · ${g.name}`];
  if (t === null) {
    lines.push('Cycle terminé : toutes les remises ont été faites.');
  } else {
    const s = tourSummary(g, t, today);
    const b = beneficiary(g, t);
    lines.push(`Tour ${t} sur ${g.order.length} · bénéficiaire : ${b ? b.name : '?'}`);
    lines.push(`Collecté : ${formatFCFA(s.collected)} sur ${formatFCFA(s.expected)} (${s.paidCount}/${s.total} cotisations)`);
    const late = participants(g, t).filter((m) => memberStatus(g, t, m.id, today).state === 'late');
    if (late.length) lines.push(`En retard : ${late.map((m) => m.name).join(', ')}`);
  }
  return lines.join('\n');
}

export function waLink(phone, text) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  const base = digits ? `https://wa.me/${digits}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(text)}`;
}

export function smsLink(phone, text, platform = 'android') {
  const separator = platform === 'ios' ? '&' : '?';
  return `sms:${phone}${separator}body=${encodeURIComponent(text)}`;
}
