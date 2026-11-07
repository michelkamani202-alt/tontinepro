// Parcours complet dans un vrai navigateur (Chromium via Playwright).
// Usage : npm run e2e   (Playwright doit être installé : npm i -D playwright)
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createApp } from '../serve.mjs';
import * as L from '../js/lib.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const outgoingEmails = [];
const emailSender = {
  sendVerification: async (message) => outgoingEmails.push({ kind: 'verification', ...message }),
  sendPasswordReset: async (message) => outgoingEmails.push({ kind: 'reset', ...message }),
};
const server = createApp({
  databasePath: ':memory:',
  registrationKey: 'e2e-invitation-secret',
  publicBaseUrl: 'https://tontine.test',
  emailSender,
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

let browser;
try {
  browser = await chromium.launch();
} catch (error) {
  if (process.platform !== 'win32' || !error.message.includes("Executable doesn't exist")) throw error;
  browser = await chromium.launch({ channel: 'msedge' });
}
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', locale: 'fr-FR' });
const page = await context.newPage();

const problems = [];
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|ERR_(NAME|INTERNET|CONNECTION|BLOCKED|TUNNEL)|Failed to load resource/.test(m.text())) {
    problems.push('console: ' + m.text());
  }
});
const acceptDialogs = (dialog) => dialog.accept();
page.on('dialog', acceptDialogs);

let step = 0;
async function t(name, fn) {
  step++;
  try {
    await fn();
    console.log(`  ✓ ${step}. ${name}`);
  } catch (e) {
    console.error(`  ✗ ${step}. ${name}\n    ${e.message.split('\n').slice(0, 6).join('\n    ')}`);
    await page.screenshot({ path: `e2e-failure-${step}.png` }).catch(() => {});
    await browser.close();
    server.close();
    process.exit(1);
  }
}

async function noOverflow(label) {
  const o = await page.evaluate(() => {
    const els = [document.documentElement, ...document.querySelectorAll('.screen, .screen *')];
    return els
      .map((e) => ({
        element: `${e.tagName.toLowerCase()}${typeof e.className === 'string' && e.className ? `.${e.className.trim().replace(/\s+/g, '.')}` : ''}`,
        overflow: e.scrollWidth - e.clientWidth,
      }))
      .filter((e) => e.overflow > 0);
  });
  assert.deepEqual(o, [], `débordement horizontal sur ${label} : ${JSON.stringify(o)}`);
}

const today = new Date();
const fiveDaysAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 5);
const startDate = L.toISO(fiveDaysAgo);

console.log('Parcours TontinePro');

await t('accueil vide : invitation à créer un premier groupe', async () => {
  await page.goto(base + '/#/');
  await page.waitForSelector('form[data-form=auth]');
  await noOverflow('connexion');
  await page.setViewportSize({ width: 320, height: 740 });
  await noOverflow('connexion 320px');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('[data-action=auth-toggle]');
  await page.fill('#auth-invitation', 'e2e-invitation-secret');
  await page.fill('#auth-email', 'organisateur@example.test');
  await page.fill('#auth-password', 'mot de passe de test');
  await page.click('button[type=submit]');
  await page.waitForSelector('form[data-form=resend-verification]');
  await page.click('button[type=submit]');
  await page.waitForSelector('.info:has-text("Si un compte non validé")');
  const verificationEmail = outgoingEmails.filter((message) => message.kind === 'verification').at(-1);
  const verificationUrl = new URL(base);
  verificationUrl.hash = new URL(verificationEmail.url).hash;
  await page.goto(verificationUrl.href);
  await page.waitForSelector('form[data-form=verify-email]');
  await page.click('button[type=submit]');
  await page.waitForSelector('.empty');
  assert.match(await page.textContent('h1'), /Vos groupes/);
  assert.ok(await page.isVisible('text=Aucun groupe pour l\'instant'));
  await noOverflow('accueil');
  for (const viewport of [{ width: 320, height: 740 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await noOverflow(`accueil ${viewport.width}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
});

await t('formulaire vide : erreurs claires, rien n\'est créé', async () => {
  await page.click('a:has-text("Créer mon premier groupe")');
  await page.waitForSelector('form[data-form=new-group]');
  await page.click('button[type=submit]');
  const alert = await page.textContent('#form-errors');
  assert.match(alert, /nom du groupe/);
  assert.match(alert, /cotisation/);
  assert.match(alert, /au moins un autre membre/);
  await noOverflow('nouveau groupe');
});

await t('ajout de membres : validation (numéro, doublon) puis succès, touche Entrée', async () => {
  await page.fill('#f-newname', 'Estelle Nkodo');
  await page.fill('#f-newphone', '12');
  await page.click('[data-action=draft-add]');
  assert.match(await page.textContent('.add-row .alert'), /numéro invalide/);
  await page.fill('#f-newphone', '699 00 00 02');
  await page.press('#f-newphone', 'Enter'); // ajoute, ne soumet pas le formulaire
  await page.waitForSelector('.member-row:has-text("Estelle Nkodo")');
  await page.fill('#f-newname', 'Paul Fotso');
  await page.fill('#f-newphone', '+237 699000002'); // même numéro qu'Estelle
  await page.click('[data-action=draft-add]');
  assert.match(await page.textContent('.add-row .alert'), /déjà utilisé/);
  await page.fill('#f-newphone', '655 00 00 03');
  await page.click('[data-action=draft-add]');
  await page.waitForSelector('.member-row:has-text("Paul Fotso")');
  assert.match(await page.textContent('#h-members'), /Membres \(3\)/);
  assert.equal(await page.inputValue('#f-newname'), '');
  assert.ok(await page.isVisible('[data-form=new-group]'), 'toujours sur le formulaire');
});

await t('retrait d\'un membre puis ré-ajout', async () => {
  await page.click('[aria-label="Retirer Paul Fotso"]');
  assert.match(await page.textContent('#h-members'), /Membres \(2\)/);
  await page.fill('#f-newname', 'Paul Fotso');
  await page.fill('#f-newphone', '655 00 00 03');
  await page.click('[data-action=draft-add]');
  assert.match(await page.textContent('#h-members'), /Membres \(3\)/);
});

await t('ordre manuel : monter un membre', async () => {
  await page.fill('#f-name', 'Njangi Les Cadets');
  await page.fill('#f-amount', '25 000');
  await page.fill('#f-start', startDate);
  await page.fill('#f-m0name', 'Michel K.');
  await page.fill('#f-m0phone', '677 00 00 01');
  await page.click('label[for=om-manual]');
  await page.waitForSelector('.order-list');
  assert.deepEqual(await page.$$eval('.order-list .name', (n) => n.map((x) => x.textContent)), ['Michel K.', 'Estelle Nkodo', 'Paul Fotso']);
  await page.click('[aria-label="Monter Paul Fotso"]');
  assert.deepEqual(await page.$$eval('.order-list .name', (n) => n.map((x) => x.textContent)), ['Michel K.', 'Paul Fotso', 'Estelle Nkodo']);
  assert.equal(await page.inputValue('#f-name'), 'Njangi Les Cadets', 'les champs saisis sont conservés');
  assert.equal(await page.inputValue('#f-m0phone'), '677 00 00 01');
});

await t('création du groupe : suivi du tour avec retards', async () => {
  await page.click('button[type=submit]');
  await page.waitForSelector('.hero:has-text("Bénéficiaire du tour")');
  assert.match(await page.textContent('.topbar h1'), /Njangi Les Cadets/);
  assert.match(await page.textContent('.topbar .sub'), /Tour 1 sur 3/);
  assert.match(await page.textContent('.hero-title'), /Michel K\./);
  const text = await page.textContent('.list[aria-label^="Cotisations"]');
  assert.equal((text.match(/En retard · 5 jours/g) || []).length, 3);
  assert.match(await page.textContent('.payout'), /La remise complète sera possible/);
  await noOverflow('suivi du tour');
});

await t('ajout d\'un membre au groupe existant (validation puis succès)', async () => {
  await page.click('[aria-label="Ajouter un membre"]');
  await page.waitForSelector('form[data-form=member]');
  await page.fill('#m-name', 'Paul Fotso');
  await page.fill('#m-phone', '690000009');
  await page.click('button[type=submit]');
  assert.match(await page.textContent('#form-errors'), /porte déjà le nom/);
  await page.fill('#m-name', 'Aïcha Mbarga');
  await page.fill('#m-phone', '690 00 00 09');
  await noOverflow('ajout membre');
  await page.click('button[type=submit]');
  await page.waitForSelector('.member .name:has-text("Aïcha Mbarga")');
  assert.equal(await page.locator('.list[aria-label^="Cotisations"] > li').count(), 4);
  await page.click('[aria-label="Supprimer Aïcha Mbarga"]');
  await page.waitForSelector('.toast:has-text("retiré du groupe")');
  assert.equal(await page.locator('.list[aria-label^="Cotisations"] > li').count(), 3);
  await page.click('[aria-label="Ajouter un membre"]');
  await page.fill('#m-name', 'Aïcha Mbarga');
  await page.fill('#m-phone', '690 00 00 09');
  await page.click('button[type=submit]');
  assert.equal(await page.locator('.list[aria-label^="Cotisations"] > li').count(), 4);
});

await t('paiement : référence obligatoire, puis reçu numéroté avec messages WhatsApp/SMS', async () => {
  await page.locator('.member:has-text("Estelle Nkodo") a:has-text("Encaisser")').click();
  await page.waitForSelector('form[data-form=payment]');
  assert.equal(await page.inputValue('#p-amount'), '25000');
  await page.click('button[type=submit]');
  assert.match(await page.textContent('#form-errors'), /référence/);
  await page.fill('#p-ref', 'mp261104.0812.k47');
  await page.click('button[type=submit]');
  await page.waitForSelector('.receipt');
  const yr = today.getFullYear();
  assert.match(await page.textContent('.receipt-head'), new RegExp(`TP-${yr}-0001`));
  assert.match(await page.textContent('.receipt-body'), /MP261104\.0812\.K47/);
  assert.match(await page.textContent('.bubble'), /^Bonjour Estelle, votre cotisation de 25.000.FCFA/);
  const wa = await page.getAttribute('a:has-text("Envoyer sur WhatsApp")', 'href');
  assert.ok(wa.startsWith('https://wa.me/237699000002?text='));
  const sms = await page.getAttribute('a:has-text("Envoyer par SMS")', 'href');
  assert.ok(sms.startsWith('sms:+237699000002?body='));
  await noOverflow('reçu');
});

await t('référence déjà utilisée refusée ; espèces sans référence', async () => {
  await page.click('a:has-text("Retour au suivi du tour")');
  const memberDeleteButtons = page.locator('[data-action=delete-member]');
  assert.ok(await memberDeleteButtons.count() > 0, 'l’option de retrait reste visible');
  assert.equal(await page.locator('[data-action=delete-member]:not([disabled])').count(), 0, 'le retrait est verrouillé dès qu’un paiement existe');
  await page.locator('.member:has-text("Paul Fotso") a:has-text("Encaisser")').click();
  await page.waitForSelector('form[data-form=payment]');
  await page.fill('#p-ref', 'MP261104.0812.K47');
  await page.click('button[type=submit]');
  assert.match(await page.textContent('#form-errors'), /déjà été enregistrée/);
  await page.click('label[for=pm-2]');
  assert.ok(await page.isHidden('#ref-field'), 'champ référence masqué pour les espèces');
  await page.fill('#p-amount', '30000');
  await page.click('button[type=submit]');
  assert.match(await page.textContent('#form-errors'), /dépasse le reste/);
  await page.fill('#p-amount', '10000'); // paiement partiel
  await page.click('button[type=submit]');
  await page.waitForSelector('.receipt');
  assert.match(await page.textContent('.receipt-head'), /10.000.FCFA/);
  assert.ok(!(await page.textContent('.receipt-body')).includes('Référence'));
});

await t('tout le monde paie (le partiel est soldé) puis remise et confirmation', async () => {
  const members = ['Paul Fotso', 'Michel K.', 'Aïcha Mbarga'];
  for (const name of members) {
    await page.evaluate(() => {
      location.hash = location.hash.replace(/\/recu\/.*/, '/paiement');
    });
    await page.waitForSelector('form[data-form=payment]');
    const value = await page.evaluate((n) => [...document.querySelectorAll('#p-member option')].find((o) => o.textContent.startsWith(n))?.value, name);
    await page.selectOption('#p-member', value);
    await page.click('label[for=pm-2]');
    await page.click('button[type=submit]');
    await page.waitForSelector('.receipt');
  }
  await page.click('a:has-text("Retour au suivi du tour")');
  assert.match(await page.textContent('.payout'), /Tout le monde a cotisé/);
  assert.match(await page.textContent('.hero'), /100.000[\s\S]*sur 100.000/);
  await page.click('[data-action=payout]');
  await page.waitForSelector('.notice:has-text("en attente de confirmation")');
  assert.match(await page.textContent('.topbar .sub'), /Tour 2 sur 4/);
  await page.click('.notice [data-action=confirm-payout]');
  await page.waitForSelector('.toast:has-text("confirmée")');
  assert.equal(await page.locator('.notice').count(), 0);
});

await t('calendrier : remis / en cours / à venir', async () => {
  await page.click('.tabbar a:has-text("Calendrier")');
  await page.waitForSelector('.cal');
  assert.equal(await page.locator('.cal-done').count(), 1);
  assert.equal(await page.locator('.cal-now').count(), 1);
  assert.equal(await page.locator('.cal-next').count(), 2);
  assert.match(await page.textContent('.cal-done'), /Michel K\./);
  await noOverflow('calendrier');
});

await t('historique : entrées, filtres, export PDF (relevé imprimable)', async () => {
  await page.click('.tabbar a:has-text("Historique")');
  await page.waitForSelector('.entry');
  assert.equal(await page.locator('.entry:not(.entry-out)').count(), 5);
  assert.equal(await page.locator('.entry-out').count(), 1);
  assert.match(await page.textContent('.entry-out'), /Réception confirmée par le bénéficiaire/);
  await page.click('[data-filter=payout]');
  assert.equal(await page.locator('.entry').count(), 1);
  await page.click('[data-filter=payment]');
  assert.equal(await page.locator('.entry').count(), 5);
  await page.click('[data-filter=all]');
  await noOverflow('historique');

  await page.emulateMedia({ media: 'print' });
  assert.ok(await page.isVisible('.print-only table'));
  assert.ok(await page.isHidden('.tabbar'));
  assert.ok(await page.isHidden('.entry'));
  const rows = await page.locator('.print-only tbody tr').count();
  assert.equal(rows, 6);
  assert.match(await page.textContent('.print-only tfoot'), /100.000/);
  await page.emulateMedia({ media: 'screen' });
  const pdf = await page.pdf({ format: 'A4' });
  assert.ok(pdf.length > 5000, 'le PDF est généré');
});

await t('persistance : les données survivent au rechargement', async () => {
  await page.goto(base + '/#/');
  await page.reload();
  await page.waitForSelector('.list a.card');
  assert.match(await page.textContent('.list a.card'), /Njangi Les Cadets/);
  assert.match(await page.textContent('.list a.card'), /4 membres/);
});

await t('sécurité : un nom malveillant est affiché tel quel, jamais exécuté', async () => {
  await page.goto(base + '/#/nouveau');
  await page.waitForSelector('form[data-form=new-group]');
  const evil = '<img src=x onerror="window.__xss=1">';
  await page.fill('#f-name', evil);
  await page.fill('#f-amount', '1000');
  await page.fill('#f-m0name', 'Michel K.');
  await page.fill('#f-m0phone', '677000001');
  await page.fill('#f-newname', '"><script>window.__xss=2</script>');
  await page.fill('#f-newphone', '699000077');
  await page.click('[data-action=draft-add]');
  await page.click('button[type=submit]');
  await page.waitForSelector('.hero');
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.equal(await page.locator('.topbar h1 img').count(), 0);
  assert.equal(await page.textContent('.topbar h1'), evil);
});

await t('plusieurs groupes sur l\'accueil, aucune erreur console', async () => {
  await page.goto(base + '/#/');
  await page.waitForSelector('.list a.card');
  assert.equal(await page.locator('.list a.card').count(), 2);
  assert.match(await page.textContent('.hero-label'), /tour/);
  await noOverflow('accueil');
  assert.deepEqual(problems, []);
});

await t('montant zéro : enregistre une non-cotisation sans référence et garde le membre impayé', async () => {
  await page.locator('.list a.card').filter({ hasText: 'Njangi Les Cadets' }).click();
  await page.locator('.member:has-text("Aïcha Mbarga") a:has-text("Encaisser")').click();
  await page.fill('#p-amount', '0');
  assert.ok(await page.isHidden('#method-field'));
  assert.ok(await page.isHidden('#ref-field'));
  await page.click('button[type=submit]');
  await page.waitForSelector('h1:has-text("Non-cotisation enregistrée")');
  const firstAbsenceReceipt = page.url();
  assert.match(await page.textContent('.receipt'), /Aucune cotisation reçue/);
  assert.match(await page.textContent('.receipt-foot'), /ne constitue pas un reçu de paiement/);
  await page.click('a:has-text("Retour au suivi du tour")');
  assert.equal(await page.locator('.hero-amount').textContent(), '0');
  const memberRow = page.locator('.member:has-text("Aïcha Mbarga")');
  assert.match(await memberRow.textContent(), /En attente|En retard/);
  assert.equal(await memberRow.locator('.amt').textContent(), L.formatNumber(25000));
  await memberRow.locator('a:has-text("Régler")').click();
  await page.fill('#p-amount', '0');
  await page.click('button[type=submit]');
  await page.waitForSelector('.receipt');
  assert.equal(page.url(), firstAbsenceReceipt, 'la répétition rouvre le reçu déjà créé');
  assert.ok(await page.isVisible('.toast:has-text("déjà prise en compte")'));
  await page.click('a:has-text("Retour au suivi du tour")');

  for (const name of ['Michel K.', 'Estelle Nkodo', 'Paul Fotso']) {
    await page.locator(`.member:has-text("${name}") a:has-text("Encaisser")`).click();
    await page.waitForSelector('form[data-form=payment]');
    await page.click('label[for=pm-2]');
    await page.click('button[type=submit]');
    await page.waitForSelector('.receipt');
    await page.click('a:has-text("Retour au suivi du tour")');
  }

  await page.click('[data-action=payout-partial]');
  await page.waitForSelector('.notice:has-text("impayés reportés")');
  assert.match(await page.textContent('.topbar .sub'), /Tour 3 sur 4/);
  assert.match(await page.textContent('.notice'), /25.000[\s\S]*impayés reportés/);
  assert.equal(await page.locator('.member:has-text("Aïcha Mbarga") .amt').textContent(), L.formatNumber(50000));

  await page.locator('.member:has-text("Aïcha Mbarga") a:has-text("Encaisser")').click();
  await page.waitForSelector('form[data-form=payment]');
  await page.fill('#p-amount', '25000');
  await page.click('label[for=pm-2]');
  await page.click('button[type=submit]');
  await page.waitForSelector('.receipt');
  assert.match(await page.textContent('.receipt-body'), /Arriérés réglés.*tour 2/i);
  await page.click('a:has-text("Retour au suivi du tour")');
  assert.equal(await page.locator('.member:has-text("Aïcha Mbarga") .amt').textContent(), L.formatNumber(25000));
  await page.click('.tabbar a:has-text("Historique")');
  await page.waitForSelector('.entry-out:has-text("remise partielle")');
  assert.match(await page.textContent('.entry-out'), /Aïcha Mbarga[\s\S]*25.000/);
});

await t('sauvegarde chiffrée : téléchargement puis restauration', async () => {
  await page.goto(base + '/#/');
  page.off('dialog', acceptDialogs);
  page.on('dialog', (dialog) => dialog.accept('phrase secrète de test 2026'));
  const downloadPromise = page.waitForEvent('download');
  await page.click('[data-action=backup-export]');
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /^tontinepro-sauvegarde-.*\.json$/);
  await page.setInputFiles('#backup-file', await download.path());
  await page.waitForSelector('.toast:has-text("Sauvegarde restaurée")');
  page.removeAllListeners('dialog');
  page.on('dialog', acceptDialogs);
  assert.deepEqual(problems, []);
});

await t('compte : déconnexion puis reconnexion restaure les groupes du serveur', async () => {
  await page.click('[data-action=logout]');
  await page.waitForSelector('form[data-form=auth]');
  await page.fill('#auth-email', 'organisateur@example.test');
  await page.fill('#auth-password', 'mot de passe de test');
  await page.click('button[type=submit]');
  await page.waitForSelector('.list a.card');
  assert.equal(await page.locator('.list a.card').count(), 2);
  assert.match(await page.textContent('.list a.card'), /Njangi Les Cadets/);

  await page.click('[data-action=logout]');
  await page.waitForSelector('form[data-form=auth]');
  await page.click('[data-action=forgot-password]');
  await page.fill('#forgot-email', 'organisateur@example.test');
  await page.click('button[type=submit]');
  await page.waitForSelector('.info:has-text("Si un compte validé")');
  const resetEmail = outgoingEmails.filter((message) => message.kind === 'reset').at(-1);
  const resetUrl = new URL(base);
  resetUrl.hash = new URL(resetEmail.url).hash;
  await page.goto(resetUrl.href);
  await page.waitForSelector('form[data-form=reset-password]');
  await page.fill('#reset-password', 'nouveau mot de passe robuste');
  await page.fill('#reset-confirm', 'nouveau mot de passe robuste');
  await page.click('button[type=submit]');
  await page.waitForSelector('.info:has-text("Mot de passe modifié")');
  await page.fill('#auth-email', 'organisateur@example.test');
  await page.fill('#auth-password', 'nouveau mot de passe robuste');
  await page.click('button[type=submit]');
  await page.waitForSelector('.list a.card');
  assert.equal(await page.locator('.list a.card').count(), 2);
});

await t('suppression confirmée d’un groupe et de son historique', async () => {
  const groupName = await page.locator('.list a.card').first().locator('.name').textContent();
  await page.locator('.list a.card').first().click();
  await page.click('[data-action=delete-group]');
  await page.waitForSelector('.list a.card');
  assert.equal(await page.locator('.list a.card').count(), 1);
  assert.ok(!(await page.textContent('.list a.card')).includes(groupName));
});

await t('lien inconnu : page « introuvable » sans planter', async () => {
  await page.goto(base + '/#/g/inconnu/paiement');
  await page.waitForSelector('text=Page introuvable');
});

console.log(`\nTous les ${step} scénarios passent.`);
await browser.close();
server.close();
