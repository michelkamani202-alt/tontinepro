# Publication GitHub Pages + API VPS

GitHub Pages héberge uniquement le frontend statique. L'API, les comptes, SQLite et SMTP doivent tourner séparément sur un VPS. Le workflow `.github/workflows/pages.yml` publie `dist/` après chaque push sur `main`; Docker Compose héberge l'API derrière Caddy/HTTPS.

## Prerequis

- Un VPS Linux avec Docker Engine et le plugin Docker Compose v2.
- Un dépôt GitHub nommé selon votre choix. Le dépôt `github.com/michelkamani202-alt` seul n'est pas une URL complète de dépôt ; la configuration Pages utilise le nom réel du dépôt.
- Un sous-domaine API (par exemple `api.votredomaine.com`) dont les enregistrements DNS A/AAAA pointent vers le VPS.
- Un fournisseur SMTP avec un compte d'envoi autorisé.
- Les ports entrants 80/tcp et 443/tcp ouverts dans le pare-feu et chez l'hebergeur.
- Node.js 22.16 ou superieur si vous executez les commandes npm hors conteneur.

## 1. Publier le frontend

1. Creez le depot GitHub et poussez le projet sur la branche `main`.
2. Dans **Settings > Pages**, choisissez **GitHub Actions** comme source de publication.
3. Dans **Settings > Secrets and variables > Actions > Variables**, ajoutez `TONTINE_API_BASE_URL` avec l'origine HTTPS de l'API, par exemple `https://api.votredomaine.com` (sans chemin `/api`).
4. Poussez les changements sur `main`. Le workflow lance `check`, unitaires, E2E, construit les ressources statiques, puis publie Pages.
5. L'URL standard sera `https://michelkamani202-alt.github.io/NOM_DU_DEPOT/`. GitHub Actions affiche l'URL de publication a la fin du workflow.

Le build echoue volontairement si `TONTINE_API_BASE_URL` est absent ou n'est pas HTTPS. `config.js` genere dans `dist/` ne contient que l'URL publique de l'API, jamais de secret.

## 2. Deployer l'API

Le backend est configure pour n'accepter que l'origine de votre site Pages. Avec GitHub Pages standard, `APP_ORIGIN` est `https://michelkamani202-alt.github.io` (pas le chemin du depot). `PUBLIC_BASE_URL` inclut le nom du depot, par exemple `https://michelkamani202-alt.github.io/NOM_DU_DEPOT/`.

1. Placez le dossier du projet sur le VPS.
2. Copiez `.env.production.example` vers `.env.production`.
3. Definissez `DOMAIN` sur le sous-domaine API, `APP_ORIGIN` sur l'origine GitHub Pages, et `PUBLIC_BASE_URL` sur l'URL Pages complete.
4. Configurez `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` et `SMTP_FROM`. Utilisez un mot de passe applicatif/API du fournisseur, pas le mot de passe personnel de votre boite.
5. Generez un code d'invitation aleatoire avec `openssl rand -hex 32`, renseignez `REGISTRATION_KEY`, puis protegez le fichier : `chmod 600 .env.production`.
6. Validez la configuration puis demarrez les services :

```bash
docker compose --env-file .env.production config
docker compose --env-file .env.production up -d --build
```

7. Verifiez les services avec `docker compose --env-file .env.production ps` et les journaux avec `docker compose --env-file .env.production logs -f app caddy backup`.
8. Testez `https://api.votredomaine.com/api/healthz`, puis inscrivez un compte depuis l'URL GitHub Pages, ouvrez le lien SMTP et confirmez l'adresse. L'API refuse les origines autres que `APP_ORIGIN`.

Caddy demande et renouvelle automatiquement le certificat TLS pour le sous-domaine API. Le service `app` est sur le reseau Docker interne ; seul Caddy publie les ports 80 et 443. La base SQLite persiste dans `tontine_data`. Les cookies sont `Secure; SameSite=None` pour permettre l'authentification entre Pages et l'API.

## Sauvegardes

Une sauvegarde ponctuelle peut etre creee ainsi :

```bash
docker compose --env-file .env.production exec -T app node scripts/backup.mjs /backups
```

Pour copier une archive hors du VPS :

```bash
docker compose --env-file .env.production cp app:/backups/NOM_DU_FICHIER.sqlite ./NOM_DU_FICHIER.sqlite
```

Le service automatique conserve seulement les 30 derniers jours sur le VPS. Copiez regulierement une sauvegarde vers un stockage independant ; une sauvegarde sur le meme disque ne protege pas contre la perte du VPS.

Pour restaurer une archive, arretez d'abord les services qui utilisent SQLite, nettoyez les fichiers WAL, puis remplacez la base :

```bash
docker compose --env-file .env.production stop app backup
docker compose --env-file .env.production run --rm --no-deps --entrypoint sh app -c 'rm -f /data/tontinepro.sqlite-wal /data/tontinepro.sqlite-shm'
docker compose --env-file .env.production cp ./NOM_DU_FICHIER.sqlite app:/data/tontinepro.sqlite
docker compose --env-file .env.production start app backup
```

Verifiez ensuite `docker compose --env-file .env.production ps` et testez la connexion avant de supprimer l'archive source.

## Operations courantes

- Mettre a jour : `git pull`, puis `docker compose --env-file .env.production up -d --build`.
- Arreter sans supprimer les donnees : `docker compose --env-file .env.production down`.
- Ne faites pas `docker compose down -v` sauf si vous souhaitez detruire la base, les sauvegardes et les donnees TLS.
- Pour emettre un nouveau code d'inscription, changez `REGISTRATION_KEY` dans `.env.production`, protegez le fichier, puis executez `docker compose --env-file .env.production up -d --force-recreate app`.
- Les liens de validation expirent apres 24 heures ; les liens de reset apres une heure. Le reset invalide les sessions existantes. Les reponses de recuperation ne revelent pas si une adresse est inscrite.
- Testez la reception SMTP, y compris les dossiers indesirables, avant de distribuer les invitations. Configurez SPF/DKIM/DMARC chez votre fournisseur de domaine pour ameliorer la delivrabilite.

## Limites avant un lancement commercial

- La validation e-mail et la recuperation sont implementees, mais dependent de la delivrabilite de votre fournisseur SMTP et de la configuration SPF/DKIM/DMARC de votre domaine.
- Les paiements MTN MoMo / Orange Money et les envois SMS/WhatsApp automatiques ne sont pas connectes ; les integrations exigent des comptes marchands/fournisseurs et des tests de conformite.
- SQLite convient a un seul serveur. Pour plusieurs instances, il faut migrer vers PostgreSQL et externaliser le rate limit.
- Testez regulierement la restauration d'une sauvegarde et faites auditer les obligations legales locales avant de stocker des donnees personnelles ou financieres en production.
