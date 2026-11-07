import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decryptBackup, encryptBackup } from '../../js/backup.js';

test('backup : chiffre puis restaure les données sans perte', async () => {
  const state = { version: 1, groups: [{ id: 'group-1', payments: [{ amount: 12500 }] }] };
  const backup = await encryptBackup(state, 'phrase secrète suffisamment longue');
  assert.equal(JSON.parse(backup).format, 'tontinepro-backup');
  assert.deepEqual(await decryptBackup(backup, 'phrase secrète suffisamment longue'), state);
});

test('backup : refuse une phrase secrète incorrecte ou trop courte', async () => {
  const backup = await encryptBackup({ groups: [] }, 'une phrase secrète valide');
  await assert.rejects(decryptBackup(backup, 'mauvaise phrase secrète'), /Impossible de déchiffrer/);
  await assert.rejects(encryptBackup({}, 'trop court'), /au moins 12 caractères/);
});

test('backup : refuse un contenu altéré ou un format inconnu', async () => {
  const backup = JSON.parse(await encryptBackup({ groups: [] }, 'une phrase secrète valide'));
  backup.data = `${backup.data.slice(0, -4)}AAAA`;
  await assert.rejects(decryptBackup(JSON.stringify(backup), 'une phrase secrète valide'), /Impossible de déchiffrer/);
  await assert.rejects(decryptBackup('{"format":"autre"}', 'une phrase secrète valide'), /non pris en charge/);
});