# Serveur Minecraft

Suivez votre **serveur Minecraft** depuis Gladys : s'il est en ligne, combien de
joueurs y sont et lesquels, sa version et son message du jour. Gladys peut
réagir quand un joueur arrive ou part, ou quand le serveur s'arrête, et envoyer
un message dans le chat du jeu (« À table ! ») par RCON. Java Edition et Bedrock
Edition, à la maison (un NAS, un Raspberry Pi, un PC) ou sur Internet.

L'intégration lit le serveur comme le fait l'écran multijoueur du jeu (le
« Server List Ping ») : pas de compte Minecraft, pas de plugin, rien à installer
sur le serveur. Cette intégration est sans lien avec Mojang ni Microsoft.

> **Développée sans le matériel : vos retours sont les bienvenus.** La partie
> Java Edition a été testée contre un vrai serveur vanilla 1.21.11 ; la partie
> Bedrock Edition seulement contre des réponses documentées par d'autres, et
> rien n'a encore été testé dans un vrai Gladys. Si quelque chose ne marche pas
> comme décrit, dites-le sur le
> [forum Gladys](https://community.gladysassistant.com) ou dans les
> [issues](https://github.com/guim31/gladys-minecraft/issues).

## Ce qu'il faut

- Gladys Assistant 5.1.0 ou plus récent.
- Un serveur Minecraft joignable depuis Gladys : **Java Edition** 1.7 ou plus
  récent (vanilla, Paper, Spigot, Fabric, Forge, un proxy BungeeCord ou
  Velocity…) ou **Bedrock Edition** (Bedrock Dedicated Server, ou un serveur
  avec un port Bedrock). Un serveur sur Internet marche aussi : Gladys le lit
  directement.
- Dans le `server.properties` du serveur, `enable-status=true` (par défaut).
- Facultatif, Java Edition seulement : **RCON**, pour la liste complète des
  joueurs et les messages dans le chat. Dans `server.properties` :
  `enable-rcon=true`, `rcon.password=` un mot de passe à part,
  `rcon.port=25575` (par défaut). Redémarrez le serveur après la modification.

## Mise en place

1. Installez l'intégration depuis le catalogue de Gladys.
2. Dans **Configuration**, saisissez l'**Adresse** du serveur, comme dans le
   jeu : `192.168.1.20`, `mc.example.com`, ou `192.168.1.20:25570` quand le port
   n'est pas celui par défaut (Java 25565, Bedrock 19132). Pour un nom Java sans
   port, l'enregistrement SRV `_minecraft._tcp` est utilisé, comme dans le jeu.
   Choisissez l'**Édition** et, si vous voulez, un **Nom**.
3. RCON (facultatif, Java) : cochez **Utiliser RCON**, saisissez le **Port
   RCON** et le **Mot de passe RCON**.
4. Enregistrez, puis cliquez sur **Tester la connexion** : le message sous le
   bouton indique, pour chaque serveur, s'il répond, sa version, les joueurs et
   si RCON fonctionne.
5. Ouvrez l'onglet **Découverte** : un appareil par serveur. Cliquez sur
   **Ajouter**, choisissez une pièce, enregistrez.

Jusqu'à trois serveurs : remplissez les sections _Deuxième serveur_ et
_Troisième serveur_. Autres options :

- **Intervalle de rafraîchissement** : fréquence de lecture des serveurs, de 15
  secondes à 5 minutes (30 secondes par défaut). Une arrivée est vue au plus
  avec ce retard. Une demande de statut fait quelques centaines d'octets : même
  toutes les 15 secondes, le serveur ne la remarque pas.
- **Langue des noms de fonctionnalités** : anglais, français, allemand ou
  espagnol (français par défaut). Les noms sont donnés à l'ajout d'un appareil ;
  le texte des joueurs et les événements de scène l'utilisent aussi.

## L'appareil de chaque serveur

| Fonctionnalité    | Ce que c'est                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| En ligne          | 1 quand le serveur répond, 0 dès qu'il n'a pas répondu deux fois de suite                               |
| Joueurs connectés | Le nombre de joueurs sur le serveur                                                                     |
| Places            | Le `max-players` du serveur                                                                             |
| Joueurs           | Qui joue (Java Edition seulement), « Personne », ou une mention quand la liste est partielle ou masquée |
| Version           | La version annoncée par le serveur (`1.21.11`, `Paper 1.21.4`, `Velocity 3.4.0`…)                       |
| Message du jour   | Le MOTD, sans ses couleurs, ses deux lignes réunies par « · »                                           |
| Latence           | La durée de la demande de statut, en millisecondes                                                      |

Un serveur **Bedrock Edition** ne dit jamais qui joue : son appareil n'a pas de
fonctionnalité _Joueurs_, et les déclencheurs d'arrivée et de départ ne s'y
appliquent pas. Quand le serveur est hors ligne, _En ligne_ et _Joueurs
connectés_ passent à 0, _Joueurs_ le dit, et la version et le MOTD gardent leur
dernière valeur.

**Qui joue, en Java Edition** : sans RCON, les noms viennent de l'« échantillon »
de la réponse de statut. Le serveur vanilla y met **12 joueurs au plus**, tirés
au hasard ; `hide-online-players=true` le supprime ; un joueur qui a décoché
_Autoriser l'affichage dans la liste des serveurs_ apparaît comme « Anonymous
Player » ; certains plugins et proxys le remplacent par du texte. Le texte
_Joueurs_ dit quand la liste est partielle (« et 3 autre(s) ») ou masquée. Avec
**RCON**, l'intégration demande au serveur sa liste complète (la commande
`list`).

## Tableau de bord

Ajoutez le widget **Minecraft** à un tableau de bord : pour chaque serveur (tous,
ou celui choisi dans les réglages du widget), une tuile avec les joueurs
connectés et les places, verte quand le serveur répond, rouge quand il est hors
ligne ; et une liste avec l'état de chaque serveur, sa version et qui joue. Avec
un seul serveur, une deuxième tuile montre la latence.

## Scènes

L'intégration ajoute ses propres cartes à l'éditeur de scènes (Gladys 5.1 ou
plus récent).

### Déclencheurs

- **Un joueur a rejoint le serveur Minecraft** — filtres : le serveur (vide :
  n'importe lequel) et le pseudo (vide : n'importe qui ; exactement comme dans le
  jeu, majuscules comprises). Variables : `player`, `server`, `device`,
  `players_online`.
- **Un joueur a quitté le serveur Minecraft** — mêmes filtres. Variables :
  `player`, `server`, `device`, `players_online`, `minutes_played` (le temps
  passé, vide quand le joueur était déjà là au démarrage de l'intégration).
- **Serveur Minecraft hors ligne** — le serveur ne répond plus, deux fois de
  suite (une seule réponse perdue est ignorée). Filtre : le serveur. Variables :
  `server`, `device`, `error` (la raison, dans la langue configurée).

Les déclencheurs d'arrivée et de départ ont besoin de la liste **complète** des
joueurs : toujours avec RCON ; sans RCON, seulement tant que le serveur montre
12 joueurs ou moins et aucun nom masqué. Quand la liste est partielle, aucune
arrivée ni aucun départ n'est inventé : ils ne sont pas signalés. Quand tout le
serveur s'arrête, seul _Serveur Minecraft hors ligne_ se déclenche, pas un
départ par joueur ; à son retour, les joueurs déjà là ne sont pas signalés
comme des arrivées.

### Actions

- **Envoyer un message dans le chat Minecraft** — à un serveur, ou à tous les
  serveurs avec RCON quand le champ serveur est vide. Une ligne, 256 caractères
  au plus ; le message peut utiliser les variables de la scène
  (`Bienvenue {{triggerEvent.data.player}} !`). Les joueurs le voient sous la
  forme `[Rcon] À table !` : c'est la commande `say` du serveur, et la seule
  commande que l'intégration envoie avec `list`. Demande RCON (Java Edition).
  Sortie : `servers`, le nombre de serveurs qui ont pris le message.

Dans l'écran Configuration, **Tester la connexion** lit chaque serveur tout de
suite.

### Idées de scènes

- **À table** : à 19 h 30, _Envoyer un message dans le chat Minecraft_ « À table !
  Sauvegardez et descendez 🍽️ ».
- **Qui est connecté ?** Quand _Un joueur a rejoint le serveur Minecraft_,
  envoyer un message Gladys aux parents : « {{triggerEvent.data.player}} a
  rejoint {{triggerEvent.data.server}} ».
- **L'heure du coucher** : les jours d'école à 21 h, si _Joueurs connectés_ est
  au-dessus de 0, envoyer « Encore 5 minutes ! » dans le chat, puis éteindre la
  prise du PC de jeu à 21 h 05.
- **Le serveur a planté** : quand _Serveur Minecraft hors ligne_, envoyer une
  notification avec `{{triggerEvent.data.error}}` à la personne qui gère le
  serveur.

## Dépannage

- **« ne répond pas »** : vérifiez l'adresse et le port depuis la machine de
  Gladys, que `enable-status=true`, et qu'un pare-feu laisse passer le port (TCP
  25565 pour Java, **UDP** 19132 pour Bedrock). Gladys fait tourner l'intégration
  dans un conteneur Docker : `localhost` n'y est pas votre serveur, utilisez son
  adresse IP sur votre réseau.
- **« pas un serveur Minecraft de cette édition »** : quelque chose répond sur ce
  port, mais pas comme un serveur Minecraft de l'édition choisie : vérifiez
  l'**Édition** (un serveur Bedrock ne répond pas à la demande Java) et le port.
- **« nom introuvable »** : le nom ne se résout pas depuis Gladys ; utilisez
  l'adresse IP.
- **« mot de passe RCON refusé »** : ce n'est pas le `rcon.password` du serveur.
  **« RCON ne répond pas »** : `enable-rcon=true` manquant, mauvais **Port
  RCON**, ou port bloqué par un pare-feu. Un problème RCON ne rend jamais le
  serveur « hors ligne » : le statut continue de fonctionner.
- **Pas de noms dans _Joueurs_** : le serveur les masque (voir plus haut) :
  activez RCON.
- Pour en voir plus : réglez `LOG_LEVEL=debug` sur le conteneur ; l'intégration
  écrit alors chaque lecture, chaque arrivée et chaque départ. Elle n'écrit
  jamais le mot de passe RCON.

## Limites

- Java Edition 1.7 ou plus récent : les serveurs antérieurs à 1.7 (2013, l'ancien
  ping « legacy ») ne sont pas pris en charge.
- Qui joue : Java Edition seulement, 12 noms au plus sans RCON (voir plus haut).
  Bedrock Edition dit seulement combien de joueurs sont connectés.
- Une arrivée ou un départ est vu à la lecture suivante (30 secondes par
  défaut) : un joueur qui vient et repart entre deux lectures n'est pas vu.
- Une connexion RCON reste ouverte par serveur : le serveur vanilla écrit deux
  lignes dans son journal à chaque nouvelle connexion RCON, et se reconnecter
  toutes les 30 secondes l'inonderait.
- Les messages passent par `say` : le jeu les affiche avec le préfixe `[Rcon]`.
  Aucune autre commande n'est possible depuis Gladys, volontairement.
- Pas de découverte automatique des serveurs sur le réseau : Gladys fait tourner
  l'intégration dans un conteneur isolé qui ne voit pas les annonces réseau du
  jeu. Saisissez l'adresse.
- Développée sans vrai Gladys et sans vrai serveur Bedrock : ce qui n'a pas été
  vérifié est listé dans le README du dépôt.
