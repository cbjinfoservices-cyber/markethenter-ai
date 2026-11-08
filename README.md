# MarketHunter AI

Pilote React 19 / Vite / TypeScript / Tailwind, avec un client Supabase et une
Edge Function de sourcing Amazon. Ce lot conserve cette architecture : il ne
constitue ni une migration Next.js/FastAPI, ni une plateforme SaaS complete.

## Style partage

`src/styles/shared.css`, charge apres les styles des pages dans `src/App.tsx`,
harmonise les boutons, champs, cartes, titres et espacements. Les jetons
`--ui-*` completent les couleurs et polices existantes sans remplacer les
palettes ni les themes clair/sombre. Les regles visuelles sont limitees a
l'ecran pour conserver les mises en page d'impression ; les etats metier
(alertes, selection, rentabilite) restent definis dans les styles des pages.

## Demarrage local

La video decorative de l'accueil est servie depuis
[public/videos/home-scrub.mp4](./public/videos/home-scrub.mp4) (environ 20 Mo),
copiee dans le build Vite. Elle ne depend plus du stockage HelloReaddy.
Le serveur Caddy prend en charge les requetes HTTP Range pour la lecture
et le deplacement dans la video ; l'image fixe reste le repli existant.

La navigation principale et le menu mobile suivent la session sur toutes les
pages. Deconnecte : Decouvrir les outils, Tarifs, FAQ et Se connecter.
Connecte : Tableau de bord, Recherche produits, Calcul de rentabilite,
Fournisseurs et Mon compte (avec Deconnexion). Une connexion reussie ouvre
`/dashboard` ; une deconnexion reussie revient a l'accueil public. Les outils
de demonstration restent accessibles par URL : adapter le menu ne constitue
pas une restriction d'acces ou une nouvelle politique d'autorisation serveur.

Node.js 24 est utilise pour la validation de ce lot.

```powershell
npm ci
npm run dev
```

Le calculateur, le catalogue de demonstration et les scenarios locaux sont
utilisables sans compte. Pour Supabase, renseigner les variables publiques
decrites dans [.env.example](./.env.example) dans votre environnement local.
Ne jamais placer de cle service-role, Logimu, Rainforest ou OpenAI dans une variable
`VITE_*`, ni versionner vos fichiers de secrets.

### Erreur « Failed to fetch » a l'inscription

Si la console montre `markethunter-test.invalid` ou `ERR_NAME_NOT_RESOLVED`,
le navigateur utilise une ancienne configuration de test, pas le projet
Supabase renseigne dans votre environnement local. Les domaines reserves
`.invalid`, `.test`, `.example` et les adresses factices connues sont refuses
par le client ; aucune requete Supabase n'est envoyee dans cet etat.

Arreter le serveur concerne avec Ctrl+C dans son terminal. Dans un nouveau
terminal PowerShell, supprimer d'eventuelles surcharges de test pour cette
session (cela ne modifie pas les fichiers de configuration) puis relancer :

```powershell
Remove-Item Env:VITE_PUBLIC_SUPABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:VITE_PUBLIC_SUPABASE_ANON_KEY -ErrorAction SilentlyContinue
npm run dev
```

Cette procedure suppose que les deux valeurs reelles sont renseignees dans
votre fichier `.env` local. Recharger ensuite la page avec Ctrl+F5. Pour une
version hebergee, reconstruire et redeployer apres avoir configure les deux
variables publiques dans l'hebergeur : elles sont integrees au bundle par Vite.
La disponibilite HTTP du projet ne prouve pas la validite de sa cle publique
ni l'activation des inscriptions ; ces reglages restent a verifier dans Supabase.

## Perimetre reel

| Fonction | Etat |
|---|---|
| Calcul FBA, TVA, seuils et ROI | Operationnel en simulation |
| Scenarios, comparaison, CSV et impression | Operationnels ; stockage local disponible |
| Carnet fournisseurs | Saisie manuelle, pas une recherche automatique |
| Comptes et administration | Inscription Supabase, roles utilisateur/admin, attribution manuelle d'offre et statistiques comptes ; migration requise |
| Amazon FR, DE, ES, IT, UK, US | Connecteur implemente, configuration et validation fournisseur reelles requises |
| Best Sellers, Movers & Shakers, Most Wished For | Requetes a la demande ; pas un historique ni une surveillance continue |
| Score d'opportunite | Heuristique explicable, non predictive ; jamais presentee comme une IA validee |
| Abonnements 49 / 99 / 199 / 499 EUR | Offres cibles uniquement, sans paiement, quotas ni droits actifs |
| Autres marketplaces et signaux sociaux | Non connectes |
| Veille ASIN, stocks et alertes automatiques | Non implementes |
| Recherche Alibaba / 1688 / AliExpress / Global Sources | Non implementee ; aucun MOQ, delai ou certificat verifie |
| Predictions 30/90 jours et saisonnalite | Non implementees |
| Generation de marque, logo, packaging et contenu Amazon | Non implementee |
| Extension Chrome | Non implementee |
| Next.js, FastAPI, Redis, Elasticsearch, Celery, Kubernetes | Non integres dans ce pilote |

Les services cloud preexistants attendent notamment des tables de workspace,
scenarios et historique dans votre projet Supabase. Le depot ne fournit pas
leurs migrations : leur disponibilite et leurs politiques d'acces doivent
etre verifiees avant de presenter la synchronisation cloud comme disponible.
La presence d'une dependance Stripe n'active pas une facturation.

## Deux comptes : utilisateur et administrateur

Les routes `/compte` et `/administration` permettent de separer les identites.
Le menu du site donne acces a l'inscription et a la page du compte. Aucun
compte, mot de passe ou acces distant n'est cree par les fichiers du depot.

### Installation sur votre projet Supabase

1. Verifier que les variables publiques de votre projet sont configurees.
2. Appliquer la migration
   [20261102153000_account_access.sql](./supabase/migrations/20261102153000_account_access.sql)
   avec `supabase db push` si la CLI est deja liee au bon projet, ou executer
   son contenu une seule fois dans le SQL Editor de votre tableau de bord.
   Elle ajoute ses propres tables et fonctions, sans remplacer les politiques
   ou tables metier existantes.
3. Dans Authentication > URL Configuration, definir `https://markethunter-ai.com`
   comme URL du site et autoriser `https://markethunter-ai.com/**` ainsi que
   `https://www.markethunter-ai.com/**` comme redirections. Pour le developpement
   local, autoriser aussi `http://localhost:3000/**` (ou le port utilise).
   Apres connexion, l'utilisateur arrive sur `/dashboard`. L'inscription et le
   renvoi du mail demandent aussi une redirection vers `/dashboard` sur le domaine
   et sous le chemin de base actuellement utilises. Le serveur doit servir
   l'application pour cette URL directe.
   Verifier que le modele de confirmation utilise `{{ .ConfirmationURL }}` et
   ne contient pas de lien localhost codé en dur. Activer les inscriptions par
   e-mail ; configurer la confirmation d'adresse et l'envoi SMTP pour un usage reel.
4. Ouvrir `/compte`, creer le compte utilisateur et confirmer son adresse.
   Se deconnecter, puis s'inscrire avec une autre adresse pour le compte
   administrateur. Choisir les mots de passe dans le formulaire du site, pas
   dans une conversation ni dans un fichier versionne.
5. Dans Authentication > Users, copier l'identifiant UUID du compte destine a
   l'administration. Le proprietaire du projet execute ensuite ce SQL dans le
   SQL Editor, en remplacant le marqueur par ce seul UUID :

   ```sql
   update public.account_access
   set role = 'admin', updated_at = clock_timestamp()
   where user_id = 'REMPLACER_PAR_UUID_DU_COMPTE_ADMIN'::uuid
     and not exists (
       select 1 from public.account_access where role = 'admin'
     )
   returning user_id, role, plan;
   ```

   Verifier qu'une ligne est retournee. Aucune ligne signifie que l'UUID est
   absent ou qu'un administrateur existe deja : ne pas contourner le controle
   sans verifier les comptes. Les promotions suivantes se font via
   `/administration`. Ce SQL de bootstrap est reserve au proprietaire du
   projet ; ne jamais le proposer aux utilisateurs ordinaires.
6. Connecter le compte administrateur, ouvrir `/compte`, cliquer sur Actualiser,
   puis Administration. La liste est paginee par 25 comptes.

Tous les comptes existants et futurs obtiennent par defaut `role=user`,
`plan=free`. Les valeurs `role` ou `plan` des metadonnees d'inscription ne sont
jamais copiees. Seuls les comptes dont le role est admin dans la table serveur
peuvent appeler les RPC de listing et modification. La protection est dans
PostgreSQL, pas seulement dans l'interface : lecture RLS de ses propres droits,
aucune ecriture directe du client, verification de `auth.uid()` dans les RPC,
journal d'audit non lisible par les clients. Aucune cle service-role n'est
necessaire dans le navigateur.

Les modifications sont confirmees dans l'interface, journalisees et protegees
contre l'ecrasement d'une version modifiee entre-temps. La retrogradation du
dernier administrateur est refusee, meme lors de changements simultanes
serialises par verrou transactionnel. Un administrateur retrograde perd ses
droits aux RPC immediatement, sans attendre le renouvellement de son JWT.
La perte de tout acces administrateur reste recuperable par le proprietaire
dans le tableau de bord Supabase.

L'offre Starter / Pro / Premium / Agences est une **attribution administrative
persistante**, pas un abonnement paye ni un mecanisme de quota. L'offre ne
bloque pas les outils publics du pilote, ne change pas les politiques metier
preexistantes et ne debloque pas les fonctionnalites non implementees.
La facturation, les quotas et l'application des droits commerciaux sur les
API metier restent a integrer avant commercialisation.

Les statistiques indiquent les comptes inscrits, administrateurs, adresses
confirmees, inscriptions des 7 derniers jours et repartition par offre
attribuee. Elles ne simulent ni chiffre d'affaires, ni visites, ni ventes.

La migration est testee avec PostgreSQL embarque (PGlite), notamment pour les
permissions, la RLS, les promotions/retrogradations, le dernier administrateur,
les conflits de version et l'audit. Le deploiement et la creation des deux
comptes sur votre projet reel restent a effectuer par son proprietaire.

## Calcul financier

Les montants de travail sont en EUR. Le prix de vente est TTC ; les couts
d'achat sont hors TVA recuperable. La TVA des ventes est retiree exactement
une fois :

```text
cout rendu = achat + transport + emballage + (achat + transport) * douane
CA HT = prix TTC / (1 + TVA)
couts operationnels = cout rendu + prix TTC * (commission + retours) + FBA + publicite
net = CA HT - couts operationnels
marge nette (%) = net / prix TTC * 100
ROI (%) = net / cout rendu * 100
mensuel = net * volume saisi
```

`totalCost` comprend les couts operationnels et la TVA des ventes ; `netHT`
est un alias du net apres TVA, conserve pour la compatibilite des exports.
`netMarginHT` utilise le CA HT comme denominateur. Le ROI n'est pas calcule
sur tous les frais d'exploitation : son denominateur est le cout rendu.
Sans cout rendu, le ROI affiche est 0, faute de base de calcul.

Les seuils de prix, recommandations de prix vert et plafonds d'achat utilisent
la meme formule. Les anciens scenarios sont recalcules apres TVA : les
resultats, feux tricolores et prix conseilles peuvent donc changer. Les
chiffres d'entree et liens partages restent compatibles, y compris les anciens
liens sans taux de TVA (20 % par defaut).

L'exemple 49,99 EUR / achat 8,50 / transport 2 / FBA 9,20 / TVA 20 %, sans
autres frais, donne un net de 21,96 EUR et un ROI de **209,13 % sur le cout
rendu de 10,50 EUR**, et non 108 %. Une commission Amazon supplementaire
doit etre saisie si les 9,20 EUR ne la comprennent pas.

Chaque devis fournisseur (A et B) garde ses propres transport, emballage et
douane, saisis dans l'historique de prix. Un champ vide reprend la valeur du
scenario. Les frais communs (commission, FBA, publicite, retours, TVA) restent
ceux du scenario. Le devis B est compare au devis A sur le meme cout rendu :
son prix d'achat est converti en prix A equivalent, et seuils, verdicts et
alertes utilisent ce prix. Ces couts sont stockes dans le navigateur uniquement.

Le calcul ne remplace pas un conseil fiscal ni une grille Amazon : poids,
dimensions, stockage, charges fixes, impots et situation TVA doivent etre
confirmes. Les frais par defaut ne constituent pas un devis fournisseur.

## Connecteur Amazon

1. Configurer votre projet avec la CLI Supabase ou le tableau de bord.
2. Definir les secrets **cote serveur** dans Supabase > Edge Functions > Secrets :
   - Pour Logimu : `SOURCING_PROVIDER=logimu` et `LOGIMU_API_KEY` contenant
     votre cle Logimu active.
   - Pour Rainforest : `SOURCING_PROVIDER=rainforest` et `RAINFOREST_API_KEY`
     contenant une veritable cle Rainforest.
   - Sans `SOURCING_PROVIDER`, Rainforest reste le comportement par defaut
     pour les installations existantes. Aucune bascule ni relance automatique
     n'est effectuee : une erreur ne doit pas consommer des credits ailleurs.
3. Deployer :

   ```powershell
   supabase functions deploy sourcing-bestsellers
   ```

   Sans CLI, generer le fichier autonome pour l'editeur du tableau de bord :

   ```powershell
   npm run build:sourcing-function -- "$env:TEMP\sourcing-supabase-index.ts"
   ```

   Remplacer **tout** le code de la fonction `sourcing-bestsellers` par le
   contenu genere, puis deployer. Le fichier ne contient aucune cle.

4. Conserver la verification JWT de la passerelle ; ne pas deployer avec
   `--no-verify-jwt`. Verifier la compatibilite de votre cle publique et de
   votre configuration d'authentification avec cette passerelle.
5. Configurer le client public, choisir pays, classement et categorie, puis
   cliquer sur Actualiser. Tester reellement chaque pays/categorie avec votre
   abonnement avant activation commerciale.

Le connecteur accepte seulement les marches, categories et types de classement
autorises ; les URL Amazon sont construites cote serveur. Une requete invalide,
une cle absente, une erreur fournisseur ou un resultat vide produit une erreur
HTTP explicite, jamais un succes rempli de donnees fictives.

Sans reponse exploitable, le catalogue precedent reste affiche avec sa
provenance et un message d'erreur. Le choix du prochain pays ne renomme pas
les donnees deja chargees.

Si la reponse contient `{"products":[],"error":"missing-key"}`, la fonction
appelee ne trouve pas son secret. Dans le tableau de bord du **meme projet
Supabase que le client**, ouvrir Edge Functions > Secrets, enregistrer
la cle du fournisseur selectionne (`LOGIMU_API_KEY` ou `RAINFOREST_API_KEY`)
avec une valeur non vide, sans guillemets. Une cle Logimu n'est pas une cle
Rainforest, quel que soit le nom du secret. Ne jamais
copier cette valeur dans le client, les captures ou une conversation.
Le client affiche aussi cette erreur si une ancienne fonction la renvoie
avec un statut HTTP 200 ; le connecteur fourni renvoie HTTP 503 dans ce cas.

### Logimu et migration vers Rainforest

Le format commun des produits et de leur provenance est identique pour les
deux fournisseurs. Pour changer, modifier `SOURCING_PROVIDER` et configurer
la cle correspondante, sans changer l'interface ni les calculs.

Le connecteur Logimu utilise `GET https://api.logimu.com/v1/bestsellers`
avec l'en-tete `X-API-KEY`, le pays demande et `pages=1`. Il prend uniquement
en charge **Meilleures ventes avec une categorie precise**. La racine
Toutes categories renvoie des categories chez Logimu, pas un classement
de produits ; elle est donc refusee avant tout appel. Movers & Shakers et
les listes de souhaits restent disponibles avec Rainforest uniquement.

Un rafraichissement demande au maximum 50 entrees et affiche au maximum
24 produits avec prix utilisable, sans enrichissement ni appel par ASIN.
Logimu annonce 1 credit par page de 50, meme en cache ; confirmer la
facturation dans votre compte. Le delai maximal est 120 secondes
(25 secondes pour Rainforest). Logimu peut servir un cache de categorie
de 30 minutes : la date conservee est `observed_at`, pas l'heure du clic.
Les titres FR/IT/ES peuvent etre en anglais selon le fournisseur.
Les reponses d'un autre marche, les prix dans une mauvaise devise et les
donnees incompletes sont refuses, sans catalogue invente. Les categories
et la qualite reelle de chaque marche restent a verifier sur votre compte.

Le controle de prix Logimu exige `price.raw` (prix textuel) et sa concordance
avec `price.value`, dans la devise du marche. Les montants francais `1,89 EUR`
et anglais `EUR 1.89` sont acceptes, avec groupement de milliers valide.
Une contradiction comme `value: 215, raw: "2,15 EUR"` est exclue, pas
automatiquement divisee par 100. Les prix textuels absents ou ambigus sont
egalement exclus. Le nombre d'exclusions est affiche ; si aucun produit
n'est utilisable, une erreur explicite est renvoyee. Le client refait ce
controle pour ne pas accepter les reponses d'un ancien connecteur Logimu.
Rainforest conserve son comportement sans prix textuel ; lorsqu'il en
fournit un, sa coherence est egalement verifiee.
Ce controle ne garantit ni le prix Amazon actuel, ni l'absence d'une erreur
identique dans les deux champs fournisseur. Il n'effectue aucun appel
supplementaire et ne remplace pas une verification du devis et de l'offre.

Documentation du contrat : https://api.logimu.com/docs#bestsellers et
https://api.logimu.com/openapi.json. Les tests utilisent des reponses
simulees basees sur ce contrat : ils ne consomment aucun credit et ne
garantissent pas la disponibilite reelle du fournisseur.

### Redis et historique PostgreSQL du sourcing

La fonction `sourcing-bestsellers` utilise Redis (Upstash REST) comme cache
rapide, puis PostgreSQL, et ne consulte Rainforest ou Logimu qu'en cas de
cache absent ou expire et apres authentification. Les classements restent
valides six heures ; le prix verifie de la Buy Box reste valide une heure.
Ces delais sont mesures depuis l'observation d'origine : une lecture ou une
copie dans Redis ne les prolonge pas. Les observations sans prix sont aussi
memorisees. Une erreur Redis est journalisee et la fonction utilise
PostgreSQL ; une erreur de lecture PostgreSQL reste bloquante avant un appel
payant. Si Redis n'est pas configure, PostgreSQL fonctionne seul et un
avertissement apparait dans les logs de la fonction.

Pour mettre en service cette version :

1. Appliquer d'abord les migrations existantes
   `20261103080500_sourcing_price_cache.sql` et
   `20261103094500_sourcing_catalog_cache.sql` si elles ne sont pas deja
   appliquees, puis appliquer
   `supabase/migrations/20261107170000_sourcing_history.sql`. Ne pas executer
   une migration deja appliquee une deuxieme fois.
2. Creer une base Upstash Redis et configurer uniquement dans les secrets de
   la fonction Supabase `UPSTASH_REDIS_REST_URL` (URL HTTPS REST) et
   `UPSTASH_REDIS_REST_TOKEN` (jeton REST avec droits d'ecriture). Ne jamais
   les mettre dans le code ou les variables frontend `VITE_*`.
3. Si plusieurs environnements partagent une base Redis, definir un
   `SOURCING_REDIS_PREFIX` distinct pour chacun ; par defaut il vaut
   `markethunter:sourcing:v1`. Ne pas partager le meme prefixe entre projets
   Supabase differents. Surveiller la disponibilite et les quotas Upstash :
   chaque lecture ou ecriture Redis consomme des requetes de ce service.
4. Generer la fonction autonome avec la commande ci-dessous et la deployer,
   ou deployer directement la fonction et ses imports avec la CLI Supabase.
   Verifier les logs, la reutilisation du cache et les compteurs Rainforest
   et Upstash.

   ```powershell
   npm run build:sourcing-function -- "C:\chemin\vers\sourcing-supabase-index.ts"
   ```

Les tables `sourcing_catalog_history` et `sourcing_price_history` enregistrent
automatiquement les changements des caches dans la meme transaction et
reprennent les entrees presentes lors de la migration. Les observations plus
anciennes deja remplacees ne peuvent pas etre reconstituees. L'historique est
accessible au seul service serveur et conserve en detail sans suppression ni
agregation automatique. Le catalogue contient les classements et les notes et
nombres d'avis disponibles dans la reponse ; son rang n'est pas un BSR
individuel. Le prix historise est celui de la Buy Box, y compris les
observations sans prix. Aucune donnee vendeur, stock ou mot-cle n'est inventee.
Prevoir la surveillance de la taille et des sauvegardes PostgreSQL ; le
partitionnement et l'agregation ne sont pas encore mis en place.

L'historisation seule n'ajoute ni suivi de popularite,
favoris ou alertes d'ASIN, ni TTL dynamique. Le rafraichissement planifie
est configure separement ci-dessous. Les appels simultanes sur
plusieurs instances peuvent encore consommer des credits en double.
L'economie reelle de credits depend du trafic et ne peut pas etre garantie.

### Cache des classements (6 heures)

Le code source integre un cache catalogue PostgreSQL partage, separe par
fournisseur, marche, categorie et type de classement. Il garde l'instantane
du fournisseur pendant six heures ; Relire le cache reutilise ce resultat sans
nouvel appel Rainforest ou Logimu. L'heure d'observation d'origine est
conservee. Les observations de prix des fiches restent dans leur cache
independant d'une heure.

La page Sourcing relit automatiquement les caches des sept categories a
l'ouverture et chaque minute pendant que l'onglet est visible, uniquement via
`action: read-cache`. Le bouton Relire le cache utilise le meme chemin,
limite a la categorie selectionnee. Aucun appel fournisseur n'est declenche
par la page. Les categories sans cache recent sont indiquees ; avec Supabase
configure, elles ne sont jamais remplacees par des produits de demonstration.
Sans backend configure, la demonstration reste disponible.

En cas d'erreur de lecture, les resultats deja obtenus restent affiches et
la categorie en echec est indiquee. Un produit present dans plusieurs
categories n'apparait qu'une fois, mais reste trouvable dans chacune.

La page ne conserve ensuite que les produits avec un prix de fiche Amazon
verifie depuis moins d'une heure et affiche ce prix, pas celui du classement.
Le planificateur serveur verifie les fiches par lots de trois. Un prix absent
ou expire est masque ; une panne fournisseur ne devient jamais un prix absent.
Les observations reussies sont conservees meme lorsqu'un autre produit du lot
echoue. Les erreurs fournisseur et leur statut HTTP (par exemple 429) sont
visibles dans les reponses du planificateur, pas dans les lectures de page.
Il n'y a pas de retry payant immediat ; le cycle suivant tente une nouvelle
mise a jour. Un classement existant est conserve si sa mise a jour echoue.

Pour activer le cache sur Supabase, executer
`supabase/migrations/20261103094500_sourcing_catalog_cache.sql` dans le SQL
Editor, puis generer le fichier autonome avec :

```powershell
npm run build:sourcing-function -- "C:\chemin\vers\sourcing-supabase-index.ts"
```

Dans Supabase > Edge Functions > `sourcing-bestsellers`, remplacer le code
par le fichier genere, puis cliquer **Deploy**. Cette etape est requise :
la fonction precedente ne consultait pas le cache. La fonction utilise
`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` cote serveur ; ces secrets ne
doivent jamais etre ajoutes au `.env` du frontend. Si la migration manque,
la fonction signale explicitement l'erreur et ne fait pas d'appel payant.
Si deux demandes simultanees rencontrent la meme entree absente, elles peuvent
encore produire deux appels fournisseur.

### Actualisation horaire serveur : sept categories France

Cette configuration concerne Rainforest, Amazon FR et Best Sellers uniquement.
Elle ne demarre pas par la migration seule. Le planificateur s'execute chaque
minute mais chaque categorie est actualisee une seule fois par heure :
classements aux minutes 0, 8, 16, 24, 32, 40 et 48, puis huit lots maximum
de trois prix dans les huit minutes suivantes. Le cycle finit a la minute 56.
Chaque requete reste bornee a un classement ou trois fiches, sans processus
Edge Function de plusieurs minutes ni lancement massif des 168 fiches.
Le premier remplissage complet peut donc prendre une heure.

Le cycle force la mise a jour des classements et prix meme si leur cache est
encore valide, pour ne pas sauter une heure a cause d'une variation de duree.
Prevoir au maximum **175 appels fournisseur par heure / 4 200 par jour**
(sept classements et 168 fiches), meme sans visite. Les ASIN presents dans
plusieurs categories peuvent etre reverifies. Verifier votre budget, les quotas
et les limites de concurrence Rainforest avant d'activer cette tache.

1. Appliquer les migrations de cache catalogue et prix, puis
   [20261107211500_sourcing_hourly_refresh.sql](./supabase/migrations/20261107211500_sourcing_hourly_refresh.sql).
   Elle utilise les extensions Supabase `pg_cron`, `pg_net` et Vault.
2. Generer un secret aleatoire d'au moins 32 caracteres hors du depot.
   Ajouter `SOURCING_CRON_SECRET` aux secrets de l'Edge Function.
   Garder `SOURCING_PROVIDER=rainforest` et une cle `RAINFOREST_API_KEY` valide.
3. Dans Supabase Vault, creer trois secrets, sans les placer dans le frontend :
   - `sourcing_function_url` : URL HTTPS exacte du projet Supabase,
     terminee par `/functions/v1/sourcing-bestsellers`.
   - `sourcing_gateway_jwt` : cle **anon JWT** du projet pour la passerelle
     (pas une cle publishable `sb_publishable_*`, pas une cle service-role).
   - `sourcing_cron_secret` : meme valeur que `SOURCING_CRON_SECRET`.
     Ce secret supplementaire autorise les actions planifiees ; la cle anon
     seule ne permet pas de les appeler.
4. Redeployer la fonction regeneree et le frontend. Conserver la verification
   JWT de la passerelle, ne pas utiliser `--no-verify-jwt`.
5. Dans le SQL Editor, en tant que proprietaire, activer une seule tache :

   ```sql
   select cron.schedule(
     'sourcing-hourly-fr',
     '* * * * *',
     'select public.dispatch_sourcing_refresh();'
   );
   ```

Le dispatcher est interdit aux roles publics, anon et authenticated. Chaque
slot est reserve en base pour eviter deux envois du meme slot dans une heure.
Les receptions HTTP restent asynchrones : une tache cron reussie signifie
que l'appel est enfile, pas que Rainforest a reussi.

Verifier les executions dans Supabase Cron et les logs Edge Function, puis
les statuts et corps HTTP avec ce SQL reserve au proprietaire :

```sql
select r.cycle, r.category, r.action, r.batch, r.error,
       h.status_code, h.timed_out, h.error_msg, h.content
from public.sourcing_refresh_requests r
left join net._http_response h on h.id = r.request_id
order by r.submitted_at desc
limit 63;
```

Les envois sont conserves sept jours ; les reponses `pg_net` ont leur propre
retention courte. `no-cached-candidates` signifie qu'aucun candidat n'existait
pour ce lot (cache non rempli ou classement de moins de 24 produits).
Une reponse 502 fournisseur impose de verifier le statut upstream et les
quotas ; une lecture de cache peut encore echouer si les tables ou le backend
sont indisponibles. Le message promotionnel i18next/Locize n'est pas une erreur.
Pour stopper les credits sans toucher au site :

```sql
select cron.unschedule('sourcing-hourly-fr');
```

### Deploiement du frontend sur le VPS

Le site de production utilise maintenant le Supabase auto-heberge du VPS,
via `https://markethunter-ai.com/supabase`, pour les comptes et le sourcing.
Les comptes du projet Supabase heberge ne sont pas transferes automatiquement.
Pour chaque build de production, fournir `VITE_PUBLIC_SUPABASE_URL` avec cette
URL et `VITE_PUBLIC_SUPABASE_ANON_KEY` avec la cle anon publique de cette
instance. Ne pas reutiliser les variables du projet heberge ni publier une
cle service-role. Ces variables sont integrees au bundle au build.

Les inscriptions necessitent un SMTP fonctionnel. Si `SMTP_HOST=supabase-mail`
mais aucun service de ce nom ne tourne, la confirmation echoue et la creation
du compte peut etre annulee. Configurer un expediteur valide sur le VPS avec
le script interactif `/opt/supabase/configure-smtp.sh` (Brevo), puis tester
une inscription reelle. Ne pas envoyer les identifiants SMTP dans un chat.
Le formulaire distingue une panne d'envoi d'une adresse e-mail invalide ;
ne pas desactiver la confirmation pour contourner la panne.

Le proxy Caddy route aussi `/auth/v1/*` directement vers `supabase-envoy:8000`,
sans retirer le prefixe. Les liens de confirmation deja envoyes avec
`/auth/v1/verify` atteignent ainsi Supabase Auth au lieu du routeur React.
Le chemin `/supabase/auth/v1/*` reste disponible. Tester ces routes sans
token retourne une erreur JSON de validation Auth (400), jamais une page
404 du frontend ; ne pas copier les tokens de confirmation dans les logs.

La fonction est montee dans
`/opt/supabase/volumes/functions/sourcing-bestsellers/index.ts`. Ses variables
persistantes sont dans `/opt/supabase/functions.env`, reserve au serveur :
`RAINFOREST_API_KEY`, `SOURCING_PROVIDER=rainforest` et `SOURCING_CRON_SECRET`.
La presence du nom d'une variable ne prouve pas que sa valeur est renseignee.
Apres modification de ce fichier, recreer uniquement le service functions
depuis `/opt/supabase` avec `docker compose up -d --no-deps functions`.

Le dispatcher SQL accepte aussi l'URL de fonction auto-hebergee
`https://markethunter-ai.com/supabase/functions/v1/sourcing-bestsellers`.
Le job `sourcing-hourly-fr` a ete cree, mais suspendu car la cle Rainforest
locale etait vide au premier remplissage (`missing-key`).
Apres avoir configure une cle valide et verifie un premier remplissage,
reactiver depuis PostgreSQL en tant que proprietaire :

```sql
select cron.alter_job(jobid, active := true)
from cron.job where jobname = 'sourcing-hourly-fr';
```

### Cle Rainforest dans Administration

Appliquer [20261107230000_admin_rainforest_key.sql](./supabase/migrations/20261107230000_admin_rainforest_key.sql),
puis redeployer la fonction autonome et le frontend. La page `/administration`
propose une cle globale, exclusivement aux administrateurs verifies en base.
La valeur est envoyee une seule fois par HTTPS a une RPC, chiffree dans Vault,
et effacee du champ apres soumission. Aucun endpoint utilisateur ne la relit ;
le statut affiche seulement « configuree » et l'etat de la tache horaire.
Les RPC verifient le role serveur meme si le client contourne l'interface.
Utiliser une cle neuve si une ancienne a ete partagee dans une conversation.

Enregistrer reprend le job `sourcing-hourly-fr` s'il existe, sans creer de
nouvelle tache ni verifier immediatement la validite fournisseur. Un
enregistrement reussi n'est donc pas une preuve de prix disponibles.
La fonction lit la cle Vault sur chaque appel payant ; elle prend priorite
sur `RAINFOREST_API_KEY` serveur et son remplacement ne necessite aucun
redemarrage. Sans cle Vault, la variable serveur reste utilisable. Une panne
de lecture Vault est une erreur explicite `provider-key-store`, jamais un
repli silencieux. Les lectures cache seules ne consultent pas la cle.

Le proxy Caddy distribue MarketHunter entre les clusters Kind `cluster-1`
et `cluster-2`, chacun avec deux replicas. Mettre a jour un seul cluster
laisse donc une partie des visites sur l'ancienne version.

Construire avec `npm run build`, puis transferer uniquement `out/` (sans
les fichiers `.map`), le [Dockerfile](./deploy/k8s/Dockerfile) et
[Caddyfile.pod](./deploy/k8s/Caddyfile.pod) dans un repertoire de release
distinct sur le VPS. Ne pas transferer `.env`, les sources ou les secrets.
Depuis ce repertoire distant, construire une image avec un tag unique :

```sh
docker build -t markethunter-ai:TAG_RELEASE .
kind load docker-image markethunter-ai:TAG_RELEASE --name cluster-1
kind load docker-image markethunter-ai:TAG_RELEASE --name cluster-2
kubectl --context kind-cluster-1 -n markethunter-ai set image deployment/markethunter-ai web=markethunter-ai:TAG_RELEASE
kubectl --context kind-cluster-1 -n markethunter-ai rollout status deployment/markethunter-ai --timeout=180s
kubectl --context kind-cluster-2 -n markethunter-ai set image deployment/markethunter-ai web=markethunter-ai:TAG_RELEASE
kubectl --context kind-cluster-2 -n markethunter-ai rollout status deployment/markethunter-ai --timeout=180s
```

Sauvegarder auparavant les deux manifests de deployment et conserver
l'image precedente pour revenir en arriere. Ne pas recreer les clusters ni
modifier les workloads ArtiFlow. Verifier les quatre replicas, `/healthz`,
le nom du bundle public sur plusieurs requetes, puis les sept lectures
`read-cache` de la page sourcing. Aucun `verify-prices` ne doit etre emis
par le frontend. Ce deploiement ne configure pas la fonction ni Cron sur
le projet Supabase heberge : suivre la section precedente separement.

### Verification economique Rainforest

Appliquer `supabase/migrations/20261103080500_sourcing_price_cache.sql`
dans l'editeur SQL Supabase, puis redeployer la fonction regeneree.
Le cache utilise les variables integrees `SUPABASE_URL` et
`SUPABASE_SERVICE_ROLE_KEY` uniquement cote serveur, jamais dans le client.
Une migration absente ou une panne du cache produit une erreur explicite
avant les appels fournisseur pour les lectures en echec.

Les produits live utilisent une grille unique avec photo, avis, prix de
fiche en principal et badge de statut. Le prix du classement reste dans les
details de la carte ; il n'est pas substitue au prix de fiche absent.
La page ne propose plus de verification payante sur clic. Relire le cache restaure
les observations encore valides du cache serveur, y compris les prix absents,
sans requete de fiche supplementaire. Cette restauration apres rechargement
necessite le deploiement de la nouvelle version de sourcing-bestsellers.
L'actualisation horaire demande la migration et la configuration ci-dessus.
Les explications techniques sont repliables. Les produits non verifies
sont exclus des calculs, recommandations, comparaisons et exports financiers
tant qu'ils n'ont pas un prix concordant. Les lots planifies demandent au
maximum trois fiches Rainforest `type=product` par requete, par rang du
classement. Chaque nouveau controle peut consommer un credit par fiche,
uniquement cote serveur.
Le bouton Simuler ouvre un calculateur en saisie manuelle
(`/calculateur?manual=1&price=...#calculator`) avec uniquement le prix
de fiche concordant, ou le prix explicitement confirme par l'utilisateur
si les prix divergent ou sont absents. La confirmation ne valide pas le
produit et n'autorise pas ses recommandations automatiques. Le prix est
converti en EUR au taux du catalogue ; couts, TVA et volumes restent a saisir.
Aucune ancienne valeur memorisee n'est prechargee et la synchronisation
du compte ne remplace pas cette saisie
par les anciens champs sauvegardes ; les scenarios restent accessibles
sans etre selectionnes automatiquement. La comparaison et l'enregistrement
de simulations estimees restent possibles uniquement pour les prix
concordants recents. Le catalogue de demonstration conserve son parcours
de calculateur historique.
Le calculateur n'affiche ni verdict, ni marge, ni benefice tant qu'un champ
de cout, taxe, prix ou volume est vide ou invalide. Un cout nul doit etre
confirme par une saisie explicite de 0. La liste des champs a completer
remplace les resultats ; le partage et l'enregistrement du brouillon ainsi
que son impression sont desactives jusqu'a une saisie complete. Les scenarios
deja enregistres restent accessibles.
Seuls la Buy Box en etat neuf, l'ASIN et le domaine demandes, et une devise
explicite sont acceptes. Aucun prix alternatif, prix a l'unite ou variante
n'est utilise comme remplacement arbitraire.

Les observations (y compris prix absent) sont conservees une heure dans
PostgreSQL, par pays et ASIN. Un nouveau clic apres rechargement reutilise
les observations recentes. Les appels identiques simultanes sont regroupes
dans une meme instance ; des instances distinctes simultanees peuvent encore
consommer des credits en double. Les erreurs HTTP ne sont pas mises en cache,
ni relancees automatiquement. Une ecriture cache en echec est signalee meme
si l'appel a deja consomme un credit.

### Cache des classements (6 heures)

Appliquer `supabase/migrations/20261103094500_sourcing_catalog_cache.sql`
dans le SQL Editor Supabase, puis redeployer `sourcing-bestsellers`
(ou remplacer son code par le fichier autonome regenere).
Le cache PostgreSQL est partage entre les utilisateurs, accessible uniquement
au serveur via `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY`.
Il separe fournisseur, pays, categorie et type de classement. Le taux de
change saisi n'est pas une cle : les montants source restent inchanges.

Actualiser reutilise le catalogue si son observation a moins de 6 heures,
sans appel Rainforest/Logimu supplementaire, meme apres fermeture du navigateur.
La date originale reste affichee. Une absence ou expiration declenche une
seule requete de classement par appel ; une observation fournisseur deja trop
ancienne n'est pas rajeunie artificiellement. Aucun bouton ne force un appel
payant avant expiration. Des demandes simultanees sur plusieurs instances
peuvent encore facturer plusieurs appels lors d'un cache manquant.
Les erreurs fournisseur ne sont pas stockees et une panne de lecture du cache
bloque explicitement avant tout appel payant ; un echec d'ecriture est signale.
Les observations de prix restent separees, valables une heure et rechargees
depuis leur propre cache, jamais prolongees a six heures par le catalogue.

La simulation est autorisee seulement si les deux prix different d'au plus
0,01 dans la devise source et si la verification a moins d'une heure.
La verification expire dans l'interface avec un controle toutes les
30 secondes. Les anciens connecteurs sans cette action doivent etre
redeployes. Les scenarios deja sauvegardes ne sont pas modifies ou certifies
retroactivement : revoir manuellement les anciens prix avant reutilisation.

Deux extractions du **meme fournisseur** ne sont pas une preuve independante
du prix Amazon actuel. Frais de livraison, coupons, adresse, promotions et
erreurs identiques dans les deux extractions restent des limites. Un prix
absent (comme la fiche Sanytol observee) ou divergent reste bloque, sans
division par 100 ni remplacement par un prix invente.

Les instantanes contiennent fournisseur, marche, devise d'origine, horodatage,
lien Amazon et type de classement. Sans categorie connue, un produit reste
non classe. Aucun rang, nombre d'avis, historique ou taux de croissance n'est
invente pour combler un signal manquant.

Les prix GBP/USD necessitent un taux de conversion manuel strictement positif
avant la requete ; EUR reste au taux 1. Les calculs utilisent ensuite l'EUR,
et les prix d'origine sont conserves. Les hypotheses de TVA sont FR 20 %,
DE 19 %, ES 21 %, IT 22 %, UK 20 %, US 0 % (hors sales tax, pas une garantie
fiscale). Elles sont modifiables dans le calculateur.

Les produits reels ont encore des couts simules : achat 26 %, transport 6 %,
FBA 11 %, publicite 10 %, retours 8 % du prix converti ; emballage 0,35 EUR
et douane 5,5 %. Le volume de 300 unites/mois est arbitraire, **pas une
estimation de ventes**. Ces hypotheses sont indiquees sur chaque fiche.

La provenance des produits sources accompagne les comparatifs, exports CSV,
textes copies et impressions. Le transfert vers un scenario ou un lien de
calcul conserve les valeurs financieres, pas un historique de collecte :
archiver l'export source si cette tracabilite doit etre conservee.

Avant production, ajouter des quotas serveur par compte, limitation de debit,
cache, suivi des credits fournisseur et droits d'abonnement. L'authentification
de passerelle seule ne constitue pas un controle d'acces commercial.

Documentation fournisseur :
[parametres Bestsellers](https://docs.trajectdata.com/rainforestapi/product-data-api/parameters/bestsellers)
et [format de reponse](https://docs.trajectdata.com/rainforestapi/product-data-api/results/bestsellers).
Les routes internationales sont configurees mais n'ont pas ete interrogees
avec une cle reelle pendant ce lot.

## Score explicable

- Demande : `100 / (1 + rang / 100)`, uniquement pour un rang Best Sellers.
- Concurrence : `20 * log10(1 + nombre d'avis)`.
- Marge : `2 * marge nette en %`.
- Composantes arrondies et bornees a 0-100 ; global = moyenne de demande,
  `100 - concurrence`, marge. Si le net est nul ou negatif, global plafonne a 39.
- A+ >= 85, A >= 70, B >= 55, C >= 40, sinon D.
- Pas de note globale si une des trois composantes manque. La couverture
  maximale est 60 % : croissance et saisonnalite manquent toujours.

Ce sont des proxies, pas des mesures de demande ou de concurrence globale.
Ne pas comparer des rangs de categories/pays differents. Aucun volume de
ventes ni projection 30/90 jours ne peut etre deduit de ce score.

## Verification

```powershell
npm test
npx tsc --noEmit --project tsconfig.tests.json
npm run type-check
npm run lint
npm run build
```

Les tests couvrent calculs, seuils, compatibilite CSV/liens, devises,
provenance, reponses/erreurs du fournisseur, score et traductions FR/EN.
Ils utilisent des reponses simulees et ne consomment aucun credit API.

Des diagnostics preexistants subsistent hors du lot : typage dans
`src/pages/home/scrub.ts` et avertissements lint dans le calculateur,
la memoire de defilement et les filtres de sourcing. Le build Vite n'effectue
pas de verification TypeScript. La restauration npm signale aussi des
avis de vulnerabilite de dependances ; aucune mise a niveau automatique
potentiellement incompatible n'a ete appliquee.
