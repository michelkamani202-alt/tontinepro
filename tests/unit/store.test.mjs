import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryStorage, STORAGE_KEY } from '../../js/store.js';
import { createGroup } from '../../js/lib.js';
import { html, raw, esc } from '../../js/html.js';

function sampleGroup() {
  return createGroup({
    name: 'Test',
    amount: '1000',
    frequency: 'weekly',
    startDate: '2026-11-15',
    orderMode: 'manual',
    members: [{ name: 'Ann A', phone: '677000001' }, { name: 'Bob B', phone: '677000002' }],
  }).group;
}

test('store : persiste et recharge un groupe', () => {
  const storage = memoryStorage();
  const s1 = createStore(storage);
  const g = sampleGroup();
  assert.equal(s1.addGroup(g), true);
  const s2 = createStore(storage);
  assert.equal(s2.get().groups.length, 1);
  assert.equal(s2.getGroup(g.id).name, 'Test');
  assert.equal(s2.get().activeGroupId, g.id);
});

test('store : numéros de reçu séquentiels et persistés', () => {
  const storage = memoryStorage();
  const s = createStore(storage);
  const now = new Date(2026, 10, 4);
  assert.equal(s.nextReceiptNo(now), 'TP-2026-0001');
  assert.equal(s.nextReceiptNo(now), 'TP-2026-0002');
  s.save();
  assert.equal(createStore(storage).nextReceiptNo(now), 'TP-2026-0003');
});

test('store : restaure un état valide et rejette un état incomplet', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  const group = sampleGroup();
  assert.equal(store.replaceState({ version: 1, counter: 4, profile: { name: 'Ann A', phone: '+237677000001' }, groups: [group] }), true);
  assert.equal(store.getGroup(group.id).name, 'Test');
  assert.equal(createStore(storage).get().counter, 4);
  assert.equal(store.replaceState({ groups: [{ id: 'invalid' }] }), false);
  assert.equal(store.get().groups.length, 1);
});

test('store : supprime un groupe, change le groupe actif et persiste', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  const first = sampleGroup();
  const second = sampleGroup();
  second.id = 'second-group';
  store.addGroup(first);
  store.addGroup(second);
  assert.equal(store.removeGroup(second.id), true);
  assert.equal(store.get().activeGroupId, first.id);
  assert.equal(createStore(storage).get().groups.length, 1);
});

test('store : suppression de membre conserve l’état si l’écriture échoue', () => {
  const store = createStore({ getItem: () => null, setItem: () => { throw new Error('quota'); } });
  const group = sampleGroup();
  const thirdMember = { id: 'third-member', name: 'Cee C', phone: '+237690000003', role: 'member', joinedTour: 1 };
  group.members.push(thirdMember);
  group.order.push(thirdMember.id);
  store.get().groups.push(group);
  const before = JSON.stringify(group);
  assert.ok(store.removeMember(group.id, group.members[2].id).errors);
  assert.equal(JSON.stringify(group), before);
});

test('store : données corrompues -> état vide + sauvegarde de secours', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, '{pas du json');
  const s = createStore(storage);
  assert.equal(s.get().groups.length, 0);
  assert.equal(storage.getItem(STORAGE_KEY + ':corrupt'), '{pas du json');
});

test('store : structure invalide -> état vide', () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify({ groups: [{ id: 'x' }], counter: 0 }));
  assert.equal(createStore(storage).get().groups.length, 0);
});

test('store : stockage qui échoue -> save renvoie false sans planter', () => {
  const broken = {
    getItem: () => null,
    setItem: () => {
      throw new Error('quota');
    },
  };
  const s = createStore(broken);
  assert.equal(s.addGroup(sampleGroup()), false);
  assert.equal(s.get().groups.length, 1, 'les données restent en mémoire');
});

test('store : stockage inaccessible -> repli en mémoire', () => {
  const denied = {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {},
  };
  const s = createStore(denied);
  assert.equal(s.get().groups.length, 0);
});

test('html : échappe les valeurs, laisse passer raw et html imbriqué', () => {
  const evil = '<img src=x onerror="alert(1)">\'&';
  assert.equal(String(html`<p>${evil}</p>`), '<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&#39;&amp;</p>');
  assert.equal(String(html`<b>${raw('<i>ok</i>')}</b>`), '<b><i>ok</i></b>');
  const inner = html`<li>${'<x>'}</li>`;
  assert.equal(String(html`<ul>${[inner, inner]}</ul>`), '<ul><li>&lt;x&gt;</li><li>&lt;x&gt;</li></ul>');
  assert.equal(String(html`${null}${undefined}${false}${true}${0}`), '0');
  assert.equal(esc('a"b'), 'a&quot;b');
});
