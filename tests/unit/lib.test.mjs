import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../../js/lib.js';

const NB = L.NBSP;
let n = 0;
const ids = () => 'id' + ++n;
const noShuffle = () => 0.999999; // Fisher-Yates : aucun échange

function draft(over = {}) {
  return {
    name: 'Njangi Les Cadets',
    amount: '25 000',
    frequency: 'monthly',
    startDate: '2026-11-15',
    orderMode: 'manual',
    members: [
      { name: 'Michel K.', phone: '677 00 00 01' },
      { name: 'Estelle Nkodo', phone: '699000002' },
      { name: 'Paul Fotso', phone: '+237 655 00 00 03' },
    ],
    ...over,
  };
}

function makeGroup(over) {
  const r = L.createGroup(draft(over), { makeId: ids, rng: noShuffle, now: new Date(2026, 10, 1, 9, 0) });
  assert.deepEqual(r.errors, undefined);
  return r.group;
}

test('formatFCFA groupe les milliers avec une espace insécable', () => {
  assert.equal(L.formatFCFA(250000), `250${NB}000${NB}FCFA`);
  assert.equal(L.formatNumber(999), '999');
  assert.equal(L.formatNumber(0), '0');
  assert.equal(L.formatNumber(1234567), `1${NB}234${NB}567`);
});

test('parseAmount accepte les entiers > 0 avec espaces, refuse le reste', () => {
  assert.equal(L.parseAmount('25 000'), 25000);
  assert.equal(L.parseAmount(`25${NB}000`), 25000);
  assert.equal(L.parseAmount('500'), 500);
  for (const bad of ['', '0', '-5', '12,5', '12.5', 'abc', '1e3', null, undefined, '99999999999999999999']) {
    assert.ok(Number.isNaN(L.parseAmount(bad)), `devrait refuser ${bad}`);
  }
});

test('normalizePhone gère les formats camerounais et internationaux', () => {
  assert.equal(L.normalizePhone('677 00 00 01'), '+237677000001');
  assert.equal(L.normalizePhone('237677000001'), '+237677000001');
  assert.equal(L.normalizePhone('+237 677-00-00-01'), '+237677000001');
  assert.equal(L.normalizePhone('00237677000001'), '+237677000001');
  assert.equal(L.normalizePhone('+33 6 12 34 56 78'), '+33612345678');
  for (const bad of ['', '123', 'abcdefghi', '+12', '5555555555555555555']) {
    assert.equal(L.normalizePhone(bad), null, bad);
  }
  assert.equal(L.formatPhone('+237677000001'), '+237 677 00 00 01');
});

test('initials et noms', () => {
  assert.equal(L.initials('Jean-Claude Tchoua'), 'JT');
  assert.equal(L.initials('  estelle  '), 'E');
  assert.equal(L.initials(''), '?');
  assert.equal(L.firstName('  Aïcha   Mbarga '), 'Aïcha');
});

test('addPeriod : semaines, quinzaines, mois (fin de mois et année)', () => {
  assert.equal(L.addPeriod('2026-11-15', 'weekly', 2), '2026-11-29');
  assert.equal(L.addPeriod('2026-11-15', 'biweekly', 1), '2026-11-29');
  assert.equal(L.addPeriod('2026-11-15', 'monthly', 2), '2027-01-15');
  assert.equal(L.addPeriod('2026-01-31', 'monthly', 1), '2026-02-28');
  assert.equal(L.addPeriod('2026-01-31', 'monthly', 2), '2026-03-31');
  assert.equal(L.addPeriod('2027-12-31', 'monthly', 2), '2028-02-29');
  assert.throws(() => L.addPeriod('nope', 'monthly', 1));
  assert.throws(() => L.addPeriod('2026-01-01', 'daily', 1));
});

test('dates : validation, formats et écarts', () => {
  assert.equal(L.parseISO('2026-02-30'), null);
  assert.equal(L.parseISO('26-02-03'), null);
  assert.ok(L.parseISO('2028-02-29'));
  assert.equal(L.formatDate('2026-11-15'), '15 nov. 2026');
  assert.equal(L.formatDateNumeric('2026-11-04'), '04/11/2026');
  assert.equal(L.formatDateTime('2026-11-04T08:12'), '4 nov. 2026 à 08:12');
  assert.equal(L.daysBetween('2026-11-15', '2026-11-18'), 3);
  assert.equal(L.daysBetween('2026-11-15', '2026-11-10'), -5);
  assert.equal(L.daysBetween('2026-10-25', '2026-11-02'), 8); // changement d'heure éventuel
  assert.equal(L.toDateTime(new Date(2026, 10, 4, 8, 5)), '2026-11-04T08:05');
});

test('validateGroupDraft : brouillon valide', () => {
  assert.deepEqual(L.validateGroupDraft(draft()), []);
});

test('validateGroupDraft : signale chaque erreur', () => {
  const fields = (d) => L.validateGroupDraft(d).map((e) => e.field);
  assert.ok(fields(draft({ name: ' ' })).includes('name'));
  assert.ok(fields(draft({ amount: '0' })).includes('amount'));
  assert.ok(fields(draft({ frequency: 'daily' })).includes('frequency'));
  assert.ok(fields(draft({ startDate: '2026-13-01' })).includes('startDate'));
  assert.ok(fields(draft({ orderMode: 'x' })).includes('orderMode'));
  assert.ok(fields(draft({ members: [{ name: 'Seul', phone: '677000001' }] })).includes('members'));
  const dupPhone = draft({ members: [{ name: 'A A', phone: '677000001' }, { name: 'B B', phone: '+237677000001' }] });
  assert.ok(fields(dupPhone).includes('phone'));
  const dupName = draft({ members: [{ name: 'Paul Fotso', phone: '677000001' }, { name: 'paul  fotso', phone: '677000002' }] });
  assert.ok(fields(dupName).includes('name'));
  const badPhone = draft({ members: [{ name: 'A A', phone: '677000001' }, { name: 'B B', phone: '12' }] });
  assert.ok(fields(badPhone).includes('phone'));
  const tooMany = draft({ members: Array.from({ length: 51 }, (_, i) => ({ name: `Membre ${i}`, phone: String(600000000 + i) })) });
  assert.ok(fields(tooMany).includes('members'));
});

test('createGroup : ordre manuel respecte la liste, normalise les données', () => {
  const g = makeGroup();
  assert.equal(g.amount, 25000);
  assert.equal(g.members.length, 3);
  assert.equal(g.members[0].role, 'organizer');
  assert.equal(g.members[1].phone, '+237699000002');
  assert.deepEqual(g.order, g.members.map((m) => m.id));
  assert.equal(g.createdAt, '2026-11-01T09:00');
  assert.ok(g.members.every((m) => m.joinedTour === 1));
});

test('createGroup : tirage au sort = permutation de tous les membres', () => {
  const g = makeGroup({ orderMode: 'random' });
  assert.deepEqual(g.order.slice().sort(), g.members.map((m) => m.id).sort());
  const r = L.createGroup(draft({ orderMode: 'random' }), { makeId: ids, rng: () => 0 });
  assert.equal(r.group.order.length, 3);
});

test('createGroup refuse un brouillon invalide sans rien créer', () => {
  const r = L.createGroup(draft({ name: '' }));
  assert.ok(r.errors.length > 0);
  assert.equal(r.group, undefined);
});

test('calendrier : dates, bénéficiaires et tour en cours', () => {
  const g = makeGroup();
  assert.equal(L.tourDate(g, 1), '2026-11-15');
  assert.equal(L.tourDate(g, 3), '2027-01-15');
  assert.equal(L.beneficiary(g, 2).name, 'Estelle Nkodo');
  assert.equal(L.currentTour(g), 1);
});

test('statuts : en attente, en retard, payé, partiel', () => {
  const g = makeGroup();
  const [m0, m1] = g.members;
  assert.equal(L.memberStatus(g, 1, m0.id, '2026-11-15').state, 'pending');
  const late = L.memberStatus(g, 1, m0.id, '2026-11-18');
  assert.equal(late.state, 'late');
  assert.equal(late.daysLate, 3);
  assert.equal(late.remaining, 25000);

  let r = L.addPayment(g, { memberId: m0.id, amount: '10 000', method: 'MTN MoMo', ref: 'mp1234' }, { nextReceiptNo: () => 'TP-2026-0001' });
  assert.ok(r.payment);
  const partial = L.memberStatus(g, 1, m0.id, '2026-11-18');
  assert.equal(partial.state, 'late');
  assert.equal(partial.remaining, 15000);

  r = L.addPayment(g, { memberId: m0.id, amount: '15000', method: 'Espèces' }, { nextReceiptNo: () => 'TP-2026-0002' });
  assert.ok(r.payment);
  assert.equal(L.memberStatus(g, 1, m0.id, '2026-11-18').state, 'paid');
  assert.equal(L.memberStatus(g, 1, m1.id, '2026-11-14').state, 'pending');
});

test('addPayment : validations', () => {
  const g = makeGroup();
  const m = g.members[1];
  const base = { memberId: m.id, amount: '25000', method: 'Orange Money', ref: 'OM9999' };
  const fields = (input) => (L.addPayment(g, input, { nextReceiptNo: () => 'X' }).errors || []).map((e) => e.field);

  assert.ok(fields({ ...base, memberId: 'inconnu' }).includes('member'));
  assert.ok(fields({ ...base, amount: '' }).includes('amount'));
  assert.ok(fields({ ...base, amount: '30000' }).includes('amount')); // dépasse le reste
  assert.ok(fields({ ...base, method: 'Chèque' }).includes('method'));
  assert.ok(fields({ ...base, ref: '' }).includes('ref'));
  assert.ok(fields({ ...base, ref: '<script>' }).includes('ref'));
  assert.equal(g.payments.length, 0, 'aucune écriture en cas d\'erreur');

  let called = 0;
  const ok = L.addPayment(g, base, { nextReceiptNo: () => (++called, 'TP-2026-0001') });
  assert.equal(called, 1);
  assert.equal(ok.payment.ref, 'OM9999');
  assert.equal(ok.payment.recordedBy, 'Michel K.');
  assert.equal(ok.payment.channel, 'whatsapp');

  // déjà payé
  assert.ok(fields(base).includes('member'));
  // référence déjà utilisée par un autre membre
  const dup = L.addPayment(g, { ...base, memberId: g.members[2].id }, { nextReceiptNo: () => { called++; return 'X'; } });
  assert.equal(dup.errors[0].field, 'ref');
  assert.equal(called, 1, 'le numéro de reçu n\'est pas consommé sur erreur');
  // espèces : pas de référence requise
  const cash = L.addPayment(g, { memberId: g.members[2].id, amount: '25000', method: 'Espèces', channel: 'sms' }, { nextReceiptNo: () => 'TP-2026-0002' });
  assert.equal(cash.payment.ref, '');
  assert.equal(cash.payment.channel, 'sms');
});

test('addPayment : zéro enregistre une non-cotisation sans marquer payé', () => {
  const g = makeGroup();
  const member = g.members[1];
  const result = L.addPayment(g, { memberId: member.id, amount: '0', method: '', ref: '' });
  assert.equal(result.payment.amount, 0);
  assert.equal(result.payment.method, 'Non payé');
  assert.equal(result.payment.ref, '');
  assert.equal(L.memberStatus(g, 1, member.id).state, 'pending');
  assert.equal(L.tourSummary(g, 1).collected, 0);
  assert.match(L.receiptMessage(g, result.payment), /aucune cotisation n'a été reçue/);
  let receiptCalls = 0;
  const repeated = L.addPayment(g, { memberId: member.id, amount: '0', method: '' }, { nextReceiptNo: () => (++receiptCalls, 'SHOULD-NOT-BE-USED') });
  assert.equal(repeated.payment.id, result.payment.id);
  assert.equal(repeated.duplicate, true);
  assert.equal(receiptCalls, 0, 'une répétition ne consomme pas un nouveau numéro de reçu');
  assert.equal(g.payments.length, 1, 'aucun doublon n’est créé');
});

test('remise : impossible tant que tout n\'est pas payé, puis avance au tour suivant', () => {
  const g = makeGroup();
  const today = '2026-11-10';
  assert.equal(L.canPayout(g, today).ok, false);
  assert.match(L.canPayout(g, today).reason, /3 cotisations/);
  assert.ok(L.addPayout(g, { now: new Date(2026, 10, 10) }).errors);

  g.members.forEach((m, i) => L.addPayment(g, { memberId: m.id, amount: '25000', method: 'Espèces' }, { nextReceiptNo: () => 'R' + i }));
  const c = L.canPayout(g, today);
  assert.equal(c.ok, true);
  assert.equal(c.amount, 75000);

  const r = L.addPayout(g, { now: new Date(2026, 10, 15, 10, 30), makeId: ids });
  assert.equal(r.payout.memberId, g.members[0].id);
  assert.equal(r.payout.amount, 75000);
  assert.equal(r.payout.confirmed, false);
  assert.equal(L.currentTour(g), 2);

  const confirmed = L.confirmPayout(g, r.payout.id, new Date(2026, 10, 16, 8, 0));
  assert.equal(confirmed.confirmed, true);
  assert.equal(confirmed.confirmedAt, '2026-11-16T08:00');
  assert.equal(L.confirmPayout(g, 'nope'), null);
});

test('remise partielle : reporte l’impayé et affecte les prochaines cotisations aux arriérés d’abord', () => {
  const g = makeGroup();
  const debtor = g.members[2];
  g.members.slice(0, 2).forEach((member) => L.addPayment(g, { memberId: member.id, amount: '25000', method: 'Espèces' }));

  assert.equal(L.canPayout(g).ok, false);
  const partial = L.canPayout(g, L.todayISO(), { allowUnpaid: true });
  assert.equal(partial.ok, true);
  assert.equal(partial.amount, 50000);
  assert.equal(partial.shortfall, 25000);
  assert.deepEqual(partial.unpaidMembers.map((member) => member.memberId), [debtor.id]);

  const payout = L.addPayout(g, { allowUnpaid: true });
  assert.equal(payout.payout.amount, 50000);
  assert.equal(payout.payout.shortfall, 25000);
  assert.equal(L.currentTour(g), 2);
  assert.equal(L.arrearsAmount(g, 2, debtor.id), 25000);
  assert.equal(L.memberStatus(g, 2, debtor.id).remaining, 50000);
  const overdue = L.memberStatus(g, 2, debtor.id, '2026-12-20');
  assert.equal(overdue.state, 'late');
  assert.equal(overdue.daysLate, L.daysBetween(L.tourDate(g, 1), '2026-12-20'));

  const firstPayment = L.addPayment(g, { memberId: debtor.id, amount: '25000', method: 'Espèces' });
  assert.deepEqual(firstPayment.payment.allocations, [{ tour: 1, amount: 25000 }]);
  assert.equal(L.arrearsAmount(g, 2, debtor.id), 0);
  assert.equal(L.memberStatus(g, 2, debtor.id).remaining, 25000);

  const secondPayment = L.addPayment(g, { memberId: debtor.id, amount: '25000', method: 'Espèces' });
  assert.deepEqual(secondPayment.payment.allocations, [{ tour: 2, amount: 25000 }]);
  assert.equal(L.memberStatus(g, 2, debtor.id).state, 'paid');
});

test('cycle terminé : plus de tour en cours, plus de paiement', () => {
  const g = makeGroup();
  for (let t = 1; t <= 3; t++) {
    g.members.forEach((m, i) => L.addPayment(g, { memberId: m.id, amount: '25000', method: 'Espèces' }, { nextReceiptNo: () => `R${t}${i}` }));
    assert.ok(L.addPayout(g, { now: new Date(2026, 10, 1 + t), makeId: ids }).payout);
  }
  assert.equal(L.currentTour(g), null);
  assert.equal(L.canPayout(g).ok, false);
  assert.ok(L.addPayment(g, { memberId: g.members[0].id, amount: '1000', method: 'Espèces' }, {}).errors);
  assert.equal(L.totals(g).collected, 225000);
  assert.equal(L.totals(g).paidOut, 225000);
});

test('addMember : validation et règles de participation', () => {
  const g = makeGroup();
  const before = JSON.stringify(g);
  assert.ok(L.addMember(g, { name: 'Paul Fotso', phone: '690000009' }).errors, 'nom en double');
  assert.ok(L.addMember(g, { name: 'Nouveau', phone: '699000002' }).errors, 'téléphone en double');
  assert.ok(L.addMember(g, { name: 'N', phone: '690000009' }).errors, 'nom trop court');
  assert.ok(L.addMember(g, { name: 'Nouveau', phone: 'abc' }).errors, 'téléphone invalide');
  assert.equal(JSON.stringify(g), before, 'rien n\'est modifié en cas d\'erreur');

  const r = L.addMember(g, { name: '  Hervé   Mbouda ', phone: '6 90 00 00 09' }, { makeId: ids });
  assert.equal(r.member.name, 'Hervé Mbouda');
  assert.equal(r.member.phone, '+237690000009');
  assert.equal(r.joinedTour, 1);
  assert.equal(r.receivesTour, 4);
  assert.equal(g.order.length, 4);
  assert.equal(L.beneficiary(g, 4).id, r.member.id);
  assert.equal(L.participants(g, 1).length, 4);
});

test('removeMember : retire un membre sans activité financière et préserve le minimum', () => {
  const g = makeGroup();
  const memberId = g.members[2].id;
  assert.deepEqual(L.removeMember(g, memberId), { memberId });
  assert.equal(g.members.length, 2);
  assert.equal(g.order.includes(memberId), false);
  assert.ok(L.removeMember(g, g.members[0].id).errors, 'organisateur protégé');
  assert.ok(L.removeMember(g, g.members[1].id).errors, 'minimum de deux membres protégé');
});

test('removeMember : bloque la suppression après paiement ou remise', () => {
  const g = makeGroup();
  const memberId = g.members[2].id;
  L.addPayment(g, { memberId: g.members[0].id, amount: '25000', method: 'Espèces' });
  const before = JSON.stringify(g);
  assert.ok(L.removeMember(g, memberId).errors);
  assert.equal(JSON.stringify(g), before);
});

test('addMember en cours de cycle : cotise à partir du tour en cours', () => {
  const g = makeGroup();
  g.members.forEach((m, i) => L.addPayment(g, { memberId: m.id, amount: '25000', method: 'Espèces' }, { nextReceiptNo: () => 'R' + i }));
  L.addPayout(g, { now: new Date(2026, 10, 15), makeId: ids });
  const r = L.addMember(g, { name: 'Retardataire', phone: '690000011' }, { makeId: ids });
  assert.equal(r.joinedTour, 2);
  assert.equal(L.participants(g, 1).length, 3);
  assert.equal(L.participants(g, 2).length, 4);
  assert.equal(L.tourSummary(g, 2, '2026-12-01').expected, 100000);
});

test('addMember quand le cycle est terminé : ouvre un nouveau tour', () => {
  const g = makeGroup();
  for (let t = 1; t <= 3; t++) {
    g.members.forEach((m, i) => L.addPayment(g, { memberId: m.id, amount: '25000', method: 'Espèces' }, { nextReceiptNo: () => `R${t}${i}` }));
    L.addPayout(g, { now: new Date(2026, 10, 1 + t), makeId: ids });
  }
  const r = L.addMember(g, { name: 'Dernier Venu', phone: '690000012' }, { makeId: ids });
  assert.equal(r.joinedTour, 4);
  assert.equal(L.currentTour(g), 4);
  assert.equal(L.participants(g, 4).length, 4);
});

test('limite de 50 membres à l\'ajout', () => {
  const g = makeGroup();
  for (let i = 0; i < 47; i++) {
    assert.ok(L.addMember(g, { name: `Membre ${i + 10}`, phone: String(690100000 + i) }, { makeId: ids }).member);
  }
  assert.equal(g.members.length, 50);
  assert.ok(L.addMember(g, { name: 'De trop', phone: '690200000' }).errors);
});

test('historique : tri décroissant, totaux', () => {
  const g = makeGroup();
  L.addPayment(g, { memberId: g.members[0].id, amount: '25000', method: 'Espèces' }, { now: new Date(2026, 10, 3, 9, 0), nextReceiptNo: () => 'A' });
  L.addPayment(g, { memberId: g.members[1].id, amount: '25000', method: 'Espèces' }, { now: new Date(2026, 10, 4, 8, 12), nextReceiptNo: () => 'B' });
  const h = L.historyEntries(g);
  assert.equal(h[0].data.receiptNo, 'B');
  assert.equal(h[1].data.receiptNo, 'A');
  assert.equal(L.totals(g).collected, 50000);
});

test('messages et liens', () => {
  const g = makeGroup();
  const m = g.members[2];
  const { payment } = L.addPayment(g, { memberId: m.id, amount: '25000', method: 'MTN MoMo', ref: 'mp261104.0812.k47' }, { now: new Date(2026, 10, 4, 8, 12), nextReceiptNo: () => 'TP-2026-0147' });
  const msg = L.receiptMessage(g, payment);
  assert.match(msg, /^Bonjour Paul, votre cotisation de 25.000.FCFA \(tour 1, Njangi Les Cadets\)/);
  assert.match(msg, /04\/11\/2026/);
  assert.match(msg, /Réf\. MTN MoMo : MP261104\.0812\.K47\./);
  assert.match(msg, /Reçu n° TP-2026-0147/);

  const wa = L.waLink(m.phone, msg);
  assert.ok(wa.startsWith('https://wa.me/237655000003?text='));
  assert.equal(decodeURIComponent(wa.split('text=')[1]), msg);
  assert.ok(L.smsLink(m.phone, 'a b').startsWith('sms:+237655000003?body=a%20b'));
  assert.ok(L.smsLink(m.phone, 'a b', 'ios').startsWith('sms:+237655000003&body=a%20b'));

  const other = g.members[1];
  assert.match(L.reminderMessage(g, other, 1, '2026-11-18'), /était attendue le 15 nov\. 2026/);
  assert.match(L.reminderMessage(g, other, 1, '2026-11-10'), /rappel : /);
  assert.match(L.summaryMessage(g, '2026-11-18'), /En retard : Michel K\., Estelle Nkodo/);
});
