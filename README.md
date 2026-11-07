# TontinePro

Application web mobile (PWA installable) pour gérer des tontines et njangis : groupes, membres,
calendrier des bénéficiaires, suivi des cotisations et des retards, reçus WhatsApp/SMS, historique
et export PDF. Design : voir l'artefact « TontinePro » (7 écrans).

## Lancer

```bash
npm install
npm start            # http://localhost:8080
```

Node.js 22.16 ou supérieur est requis (`node:sqlite.backup`). Au premier lancement en développement, créez un compte organisateur avec une adresse e-mail et un mot de passe de 12 caractères minimum.
La base SQLite est créée dans `data/tontinepro.sqlite` ; définissez `TONTINE_DB_PATH` pour choisir un autre emplacement.
En développement, le serveur écoute uniquement sur `127.0.0.1`. En production, exposez-le uniquement derrière un proxy HTTPS, avec `NODE_ENV=production` et `HOST=0.0.0.0`. Ne transmettez jamais des identifiants par HTTP sur un réseau local.
Pour préparer le déploiement Docker/Caddy, suivre [DEPLOYMENT.md](DEPLOYMENT.md). La production exige un code d’invitation aléatoire défini dans `.env.production`.
Sur téléphone, ouvrez l’adresse HTTPS du déploiement, connectez-vous puis ajoutez TontinePro à l’écran d’accueil.
Depuis l'accueil, les boutons de sauvegarde permettent d'exporter ou restaurer un fichier chiffré par phrase secrète (12 caractères minimum).

## Ce que fait l'application

- **Créer un groupe** : nom, cotisation, fréquence (semaine, 15 jours, mois), date du premier tour, ordre des tours (tirage au sort ou manuel).
- **Ajouter des membres** : à la création, puis à tout moment depuis le groupe (icône « + » en haut). Nom et téléphone validés, doublons refusés (max. 50).
  Un membre ajouté en cours de cycle cotise à partir du tour en cours et reçoit en dernier.
- **Supprimer** : un groupe peut être supprimé après confirmation ; un membre peut être retiré avant le premier paiement si le groupe conserve au moins deux personnes. Le retrait est verrouillé dès qu’un paiement ou une remise existe afin de préserver les reçus et l’historique.
- **Suivi du tour** : bénéficiaire, cagnotte collectée, statuts payé / en attente / en retard, bouton « Relancer » (WhatsApp prérempli).
- **Paiements** : montant partiel accepté ; saisir `0` enregistre une cotisation non reçue sans marquer le membre payé. Une nouvelle validation de `0` pour le même membre et le même tour réutilise cet enregistrement sans doublon. Les paiements MTN MoMo / Orange Money exigent une référence unique ; aucun argent n'est détenu par l'application.
- **Reçus** numérotés (TP-2026-0001…), message prêt pour WhatsApp ou SMS, reçu en PDF.
- **Remise** complète quand tout le monde a cotisé ; remise partielle possible après au moins un encaissement. Le bénéficiaire reçoit uniquement la somme collectée. Les impayés restent dus, sont affichés comme arriérés et les prochains paiements les règlent avant la cotisation courante.
- **Historique** filtrable, relevé PDF (bouton « Exporter en PDF » → « Enregistrer au format PDF »), résumé partageable sur WhatsApp.
- **Sauvegarde chiffrée** : export et restauration des données avec AES-GCM ; la phrase secrète n'est pas enregistrée par l'application.
- **Comptes organisateur** : e-mail et mot de passe haché par scrypt, sessions HttpOnly et données SQLite séparées par compte.
- **Validation/récupération e-mail** : compte activé uniquement après confirmation ; liens uniques et expirants, renvoi de validation et reset du mot de passe qui invalide les sessions. Production requiert SMTP configuré.
- **Sécurité des comptes** : validation de l’adresse avant la première session, renvoi du lien et récupération par jeton unique à durée limitée ; le changement de mot de passe ferme toutes les sessions existantes. En production, ces e-mails nécessitent un fournisseur SMTP configuré.
- **Synchronisation** : les changements sont enregistrés sur le serveur ; les écritures concurrentes depuis deux appareils sont refusées au lieu de s'écraser silencieusement.

## Limites actuelles (volontaires pour le MVP)

- **Envoi des reçus** : l'application ouvre WhatsApp / SMS avec le message prêt, l'organisateur appuie sur « Envoyer ».
  L'envoi automatique demande un compte fournisseur (API WhatsApp Business ou passerelle SMS), pas encore configuré.
- **Mobile Money** : l'application consigne la référence d'un transfert déjà effectué ; elle ne déclenche ni ne vérifie de transaction. L'intégration Orange Money / MTN MoMo demande des comptes marchands actifs, un backend sécurisé et un hébergement HTTPS.
- **Accès hors connexion** : une connexion au serveur est requise pour ouvrir le compte et synchroniser ; les opérations hors ligne ne sont pas encore mises en file d'attente.
- **Déploiement** : SQLite convient à un serveur unique. Le serveur doit être déployé derrière HTTPS avec sauvegardes régulières de la base ; l'accès membre n'est pas encore implémenté.

## Vérifier le code

```bash
npm run check   # syntaxe de chaque fichier, JSON, imports, références HTML/manifest/service worker
npm test        # logique métier, stockage, chiffrement et API serveur
npm run e2e     # 20 scénarios Chromium/Edge, dont montant zéro, suppressions et écrans mobiles
npm run backup  # sauvegarde cohérente de la base SQLite active
```

Playwright est une dépendance de développement. Pour installer Chromium : `npx playwright install chromium`.

## Structure

```
index.html  manifest.webmanifest  sw.js  serve.mjs
server/database.js  SQLite, comptes, sessions et état synchronisé
css/style.css
js/lib.js     logique métier pure (calendrier, statuts, paiements, validations, messages)
js/store.js   stockage local avec synchronisation serveur
js/backup.js  export et restauration chiffrés
js/html.js    gabarits HTML avec échappement automatique
js/views.js   les écrans
js/app.js     routeur, comptes, synchronisation et formulaires
tests/        unitaires API + E2E    scripts/check.mjs
```
