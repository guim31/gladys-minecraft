# Minecraft-Server

Behalte deinen **Minecraft-Server** in Gladys im Blick: ob er online ist, wie
viele Spieler darauf sind und welche, seine Version und seine Nachricht des
Tages. Gladys kann reagieren, wenn ein Spieler beitritt oder geht oder wenn der
Server stoppt, und per RCON eine Nachricht in den Spiel-Chat schicken („Essen
ist fertig!“). Java Edition und Bedrock Edition, zu Hause (ein NAS, ein
Raspberry Pi, ein PC) oder im Internet.

Die Integration liest den Server so, wie es der Mehrspieler-Bildschirm des
Spiels tut (der „Server List Ping“): kein Minecraft-Konto, kein Plugin, nichts
auf dem Server zu installieren. Diese Integration ist nicht mit Mojang oder
Microsoft verbunden.

> **Ohne die Hardware entwickelt: Rückmeldungen willkommen.** Der Java-Edition-Teil
> wurde mit einem echten Vanilla-Server 1.21.11 getestet; der Bedrock-Edition-Teil
> nur mit Antworten, die andere dokumentiert haben, und in einem echten Gladys
> wurde noch nichts getestet. Wenn etwas nicht wie beschrieben funktioniert,
> sag es im [Gladys-Forum](https://community.gladysassistant.com) oder in den
> [Issues](https://github.com/guim31/gladys-minecraft/issues).

## Was du brauchst

- Gladys Assistant 5.1.0 oder neuer.
- Einen Minecraft-Server, den Gladys erreicht: **Java Edition** 1.7 oder neuer
  (Vanilla, Paper, Spigot, Fabric, Forge, ein BungeeCord- oder Velocity-Proxy…)
  oder **Bedrock Edition** (Bedrock Dedicated Server oder ein Server mit
  Bedrock-Port). Ein Server im Internet funktioniert auch: Gladys liest ihn
  direkt.
- In der `server.properties` des Servers `enable-status=true` (Standard).
- Optional, nur Java Edition: **RCON**, für die vollständige Spielerliste und
  die Chatnachrichten. In `server.properties`: `enable-rcon=true`,
  `rcon.password=` ein eigenes Passwort, `rcon.port=25575` (Standard). Starte
  den Server nach der Änderung neu.

## Einrichtung

1. Installiere die Integration aus dem Gladys-Katalog.
2. Gib unter **Konfiguration** die **Adresse** des Servers ein, so wie im Spiel:
   `192.168.1.20`, `mc.example.com` oder `192.168.1.20:25570`, wenn der Port
   nicht der Standard ist (Java 25565, Bedrock 19132). Für einen Java-Namen ohne
   Port wird der SRV-Eintrag `_minecraft._tcp` verwendet, wie im Spiel. Wähle
   die **Edition** und, wenn du willst, einen **Namen**.
3. RCON (optional, Java): Aktiviere **RCON verwenden**, gib den **RCON-Port**
   und das **RCON-Passwort** ein.
4. Speichere und klicke auf **Verbindung testen**: Die Meldung unter der
   Schaltfläche zeigt für jeden Server, ob er antwortet, seine Version, die
   Spieler und ob RCON funktioniert.
5. Öffne den Tab **Entdecken**: ein Gerät pro Server. Klicke auf
   **Hinzufügen**, wähle einen Raum, speichere.

Bis zu drei Server: Fülle die Abschnitte _Zweiter Server_ und _Dritter Server_
aus. Weitere Optionen:

- **Aktualisierungsintervall**: wie oft die Server gelesen werden, von 15
  Sekunden bis 5 Minuten (standardmäßig 30 Sekunden). Ein Beitritt wird
  höchstens so spät erkannt. Eine Statusabfrage hat ein paar hundert Bytes:
  Selbst alle 15 Sekunden merkt der Server davon nichts.
- **Sprache der Funktionsnamen**: Englisch, Französisch, Deutsch oder Spanisch
  (standardmäßig Französisch). Die Namen werden beim Hinzufügen eines Geräts
  vergeben; der Spielertext und die Szenen-Ereignisse verwenden sie auch.

## Das Gerät jedes Servers

| Funktion            | Was es ist                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| Online              | 1, wenn der Server antwortet, 0, sobald er zweimal hintereinander nicht geantwortet hat                    |
| Spieler online      | Wie viele Spieler auf dem Server sind                                                                      |
| Spielerplätze       | Das `max-players` des Servers                                                                              |
| Spieler             | Wer spielt (nur Java Edition), „Niemand“ oder ein Hinweis, wenn die Liste unvollständig oder verborgen ist |
| Version             | Die Version, die der Server meldet (`1.21.11`, `Paper 1.21.4`, `Velocity 3.4.0`…)                          |
| Nachricht des Tages | Die MOTD ohne Farben, ihre zwei Zeilen mit „·“ verbunden                                                   |
| Latenz              | Die Dauer der Statusabfrage, in Millisekunden                                                              |

Ein **Bedrock-Edition**-Server verrät nie, wer spielt: Sein Gerät hat keine
Funktion _Spieler_, und die Auslöser für Beitritt und Verlassen gelten für ihn
nicht. Wenn der Server offline ist, gehen _Online_ und _Spieler online_ auf 0,
_Spieler_ sagt es, und Version und MOTD behalten ihren letzten Wert.

**Wer spielt, Java Edition**: Ohne RCON stammen die Namen aus der „Stichprobe“
der Statusantwort. Der Vanilla-Server legt **höchstens 12 Spieler** hinein,
zufällig ausgewählt; `hide-online-players=true` entfernt sie; ein Spieler, der
_Serverauflistung erlauben_ ausgeschaltet hat, erscheint als „Anonymous
Player“; manche Plugins und Proxys ersetzen sie durch Text. Der Text _Spieler_
sagt, wenn die Liste unvollständig („und 3 weitere“) oder verborgen ist. Mit
**RCON** fragt die Integration den Server nach seiner vollständigen Liste (der
Befehl `list`).

## Dashboard

Füge das Widget **Minecraft** zu einem Dashboard hinzu: Für jeden Server (alle
oder der in den Widget-Einstellungen gewählte) eine Kachel mit den Spielern
online und den Plätzen, grün, wenn der Server antwortet, rot, wenn er offline
ist; und eine Liste mit dem Zustand jedes Servers, seiner Version und wer
spielt. Bei einem einzigen Server zeigt eine zweite Kachel die Latenz.

## Szenen

Die Integration fügt dem Szenen-Editor eigene Karten hinzu (Gladys 5.1 oder
neuer).

### Auslöser

- **Ein Spieler ist dem Minecraft-Server beigetreten** — Filter: der Server
  (leer: beliebig) und der Spielername (leer: beliebig; genau wie im Spiel, mit
  Groß- und Kleinschreibung). Variablen: `player`, `server`, `device`,
  `players_online`.
- **Ein Spieler hat den Minecraft-Server verlassen** — gleiche Filter.
  Variablen: `player`, `server`, `device`, `players_online`, `minutes_played`
  (wie lange der Spieler da war, leer, wenn er beim Start der Integration
  schon da war).
- **Minecraft-Server offline** — der Server antwortet nicht mehr, zweimal
  hintereinander (eine einzelne verlorene Antwort wird ignoriert). Filter: der
  Server. Variablen: `server`, `device`, `error` (der Grund, in der
  konfigurierten Sprache).

Die Auslöser für Beitritt und Verlassen brauchen die **vollständige**
Spielerliste: mit RCON immer; ohne RCON nur, solange der Server 12 Spieler oder
weniger und keinen verborgenen Namen zeigt. Ist die Liste unvollständig, wird
kein Beitritt und kein Verlassen erfunden: Es wird nichts gemeldet. Stoppt
der ganze Server, löst nur _Minecraft-Server offline_ aus, nicht ein Verlassen
pro Spieler; kommt er zurück, werden die schon anwesenden Spieler nicht als
Beitritte gemeldet.

### Aktionen

- **Nachricht im Minecraft-Chat senden** — an einen Server oder, wenn das
  Server-Feld leer ist, an alle Server mit RCON. Eine Zeile, höchstens 256
  Zeichen; die Nachricht kann die Variablen der Szene verwenden
  (`Willkommen {{triggerEvent.data.player}}!`). Die Spieler sehen sie als
  `[Rcon] Essen ist fertig!`: Das ist der Befehl `say` des Servers, und neben
  `list` der einzige Befehl, den die Integration sendet. Erfordert RCON (Java
  Edition). Ausgabe: `servers`, wie viele Server die Nachricht angenommen haben.

Im Konfigurationsbildschirm liest **Verbindung testen** jeden Server sofort.

### Szenen-Ideen

- **Essenszeit**: um 19:30 Uhr _Nachricht im Minecraft-Chat senden_ „Essen ist
  fertig! Speichern und runterkommen 🍽️“.
- **Wer ist online?** Wenn _Ein Spieler ist dem Minecraft-Server beigetreten_,
  schick den Eltern eine Gladys-Nachricht: „{{triggerEvent.data.player}} ist
  {{triggerEvent.data.server}} beigetreten“.
- **Schlafenszeit**: an Schultagen um 21 Uhr, wenn _Spieler online_ über 0 ist,
  „Noch 5 Minuten!“ in den Chat senden, dann um 21:05 Uhr die Steckdose des
  Gaming-PCs ausschalten.
- **Der Server ist abgestürzt**: wenn _Minecraft-Server offline_, schick der
  Person, die den Server betreut, eine Benachrichtigung mit
  `{{triggerEvent.data.error}}`.

## Fehlerbehebung

- **„antwortet nicht“**: Prüfe Adresse und Port vom Rechner aus, auf dem Gladys
  läuft, dass `enable-status=true` gesetzt ist und dass keine Firewall den Port
  sperrt (TCP 25565 für Java, **UDP** 19132 für Bedrock). Gladys führt die
  Integration in einem Docker-Container aus: `localhost` ist dort nicht dein
  Server, verwende seine IP-Adresse in deinem Netzwerk.
- **„kein Minecraft-Server dieser Edition“**: Auf dem Port antwortet etwas, aber
  nicht wie ein Minecraft-Server der gewählten Edition: Prüfe die **Edition**
  (ein Bedrock-Server antwortet nicht auf die Java-Abfrage) und den Port.
- **„Name nicht gefunden“**: Der Name lässt sich von Gladys aus nicht auflösen;
  verwende die IP-Adresse.
- **„RCON-Passwort abgelehnt“**: Es ist nicht das `rcon.password` des Servers.
  **„RCON antwortet nicht“**: `enable-rcon=true` fehlt, falscher **RCON-Port**
  oder der Port ist durch eine Firewall gesperrt. RCON-Probleme machen den Server
  nie „offline“: Der Status funktioniert weiter.
- **Keine Namen unter _Spieler_**: Der Server verbirgt sie (siehe oben):
  Aktiviere RCON.
- Für mehr Details: Setze `LOG_LEVEL=debug` am Container; die Integration
  protokolliert dann jede Abfrage, jeden Beitritt und jedes Verlassen. Das
  RCON-Passwort protokolliert sie nie.

## Grenzen

- Java Edition 1.7 oder neuer: Server älter als 1.7 (2013, der alte
  „Legacy“-Ping) werden nicht unterstützt.
- Wer spielt: nur Java Edition, ohne RCON höchstens 12 Namen (siehe oben).
  Bedrock Edition meldet nur, wie viele Spieler online sind.
- Ein Beitritt oder ein Verlassen wird bei der nächsten Abfrage erkannt
  (standardmäßig 30 Sekunden): Ein Spieler, der zwischen zwei Abfragen kommt und
  geht, wird nicht erkannt.
- Pro Server bleibt eine RCON-Verbindung offen: Der Vanilla-Server schreibt bei
  jeder neuen RCON-Verbindung zwei Zeilen in sein Protokoll, und sich alle 30
  Sekunden neu zu verbinden würde es überfluten.
- Chatnachrichten laufen über `say`: Das Spiel zeigt sie mit dem Präfix `[Rcon]`.
  Kein anderer Befehl ist aus Gladys möglich, mit Absicht.
- Keine automatische Erkennung der Server im Netzwerk: Gladys führt die
  Integration in einem isolierten Container aus, der die Netzwerk-Ankündigungen
  des Spiels nicht sieht. Gib die Adresse ein.
- Ohne echtes Gladys und ohne echten Bedrock-Server entwickelt: Was dort nicht
  geprüft wurde, steht in der README des Repositorys.
