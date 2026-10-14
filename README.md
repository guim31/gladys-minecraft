# Minecraft Server for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com) that
follows a **Minecraft server** — Java Edition or Bedrock Edition — the way the
multiplayer screen of the game does: online or not, how many players and who,
version, message of the day, latency. Scenes can react when a player joins or
leaves or when the server goes offline, and send a message in the game chat
through RCON. No Minecraft account, no plugin on the server, no cloud.

Many families host the children's server at home, on a NAS, a Raspberry Pi or
an old PC: this is for them. A server on the Internet works too (Gladys reads
it directly).

> **Developed without the hardware: feedback welcome.** The Java Edition part
> was tested against a real vanilla 1.21.11 server (status, RCON, players
> joining and leaving); the Bedrock Edition part only against documented
> answers; nothing was run inside a real Gladys yet. Please report what works
> and what does not in the [issues](https://github.com/guim31/gladys-minecraft/issues).

## Features

- **One device per server** (up to three, each with its address, edition,
  name and RCON): _Online_, _Players online_, _Player slots_, _Players_ (who is
  playing, Java Edition), _Version_, _Message of the day_ and _Latency_.
- **Scene triggers**: _A player joined the Minecraft server_ and _A player left
  the Minecraft server_ (filters: server, player name; variables: player,
  players online, minutes played), _Minecraft server offline_ (after two failed
  readings in a row, with the reason).
- **Scene action**: _Send a message in the Minecraft chat_ ("Dinner is ready!"),
  through RCON `say`, to one server or all of them. No other command.
- **Dashboard widget** "Minecraft": a tile per server (players online / slots,
  green or red), and the state, version and players of each.
- **Optional RCON** (Java Edition, off by default): the complete list of
  players, beyond the 12 of the status sample, and the chat messages.
- A **Test the connection** button, a connection status that names the server
  and the problem, a transport badge per device (local or unreachable).
- Every text in English, French, German and Spanish.

## Requirements

- Gladys Assistant **5.1.0** or later.
- A Minecraft server reachable from Gladys: **Java Edition 1.7** or later
  (vanilla, Paper, Spigot, Fabric, Forge, BungeeCord or Velocity proxies…), or
  **Bedrock Edition** (Bedrock Dedicated Server, or a server with a Bedrock
  port, such as Geyser). `enable-status=true` in `server.properties` (the
  default).
- For RCON (optional, Java): `enable-rcon=true`, `rcon.password` and
  `rcon.port` in `server.properties`.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-minecraft`
   (or install **Minecraft Server** from the catalog once it is listed).
2. In **Configuration**, enter the address of the server as typed in the game
   (`192.168.1.20`, `mc.example.com`, `192.168.1.20:25570`…), its edition, a
   name, and optionally the RCON port and password. Save, then click **Test the
   connection**.
3. Open the **Discover** tab and add the devices.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

- **Java Edition**: the "Server List Ping" over TCP (Handshake with protocol
  47, Status Request, Status Response JSON, then Ping/Pong for the latency),
  written in this repository (`src/minecraft/java.js`, `varint.js`), no
  dependency. A name typed without port is looked up as the SRV record
  `_minecraft._tcp.<name>` first, like the game, then on port 25565.
- **Bedrock Edition**: the RakNet "Unconnected Ping" over UDP, answered by an
  "Unconnected Pong" carrying the `;`-separated advertisement
  (`src/minecraft/bedrock.js`); sent again every second until the timeout, as a
  datagram may be lost.
- **RCON** (`src/minecraft/rcon.js`): one connection per server, kept open
  (the vanilla server logs two lines for every new RCON connection), opened
  again after a drop. Only `list` and `say <message>` are ever sent; the
  message is cleaned to one line of 256 characters at most.
- **Who is playing**: the status `sample` holds 12 players at most, picked at
  random by the vanilla server, can be hidden (`hide-online-players`), shows
  "Anonymous Player" for some players, and is free text on some proxies. The
  integration treats it as a list only when it holds exactly the number of
  players online, all real names; the join and leave triggers fire only between
  two complete lists, so a partial list never invents arrivals or departures.
  With RCON, `list` gives the whole list.
- **Refresh**: every 15 s to 5 min (30 s by default), on a timer of the
  container: the devices are published with `should_poll: false` (Gladys 5.2
  does not poll external devices reliably, GladysAssistant/Gladys#3198), and
  `onPoll` stays as a fallback. A first failure is checked again 15 s later; a
  server is offline after two failures in a row, counting only silence (a
  refused connection, a timeout, a name that does not resolve).
- **States**: only the changes are sent (`publishChangedStates` of the SDK),
  every value again every 6 hours (Gladys shows "no recent value" after 48 h),
  all of them when a device is added or Gladys reconnects, and only to the
  devices added to Gladys. The scene triggers fire for every configured server,
  added or not.
- **Logs**: at the default level, the start, each server connected, lost (once)
  and back, an RCON problem once and its end, one line per chat message (its
  length, not its text). `LOG_LEVEL=debug` shows each reading, join and leave.
  The RCON password never reaches the logs.
- Nothing is written to `/data`: the integration keeps no state on disk.

## Checked on a real server, and what was not

The tests run the protocol code on real sockets against fake servers replaying
bytes recorded from a real server (`test/fixtures/minecraft/real/`), and the
integration against the SDK's fake Gladys. On 14/10/2026, in the development
session, the **official vanilla Java Edition server 1.21.11** (the Mojang
`server.jar` of the `webhippie/minecraft-vanilla` Docker image) was run with
RCON, and bots (`minecraft-protocol`, offline mode) joined and left it:

- checked: status of an empty server, of three players, of thirteen players
  (a sample of 12, random), with `hide-online-players=true` (no sample at all),
  a MOTD with `§` codes on two lines; RCON login, `list`, `say` (shown in game
  as `[Not Secure] [Rcon] message`), a wrong password (id `-1`), one connection
  kept open across readings and idle for 150 s; the whole integration (fake
  Gladys) firing _A player joined_ and _A player left_ from the RCON list,
  hiding names on the server with `hide-online-players`, sending a chat
  message, serving the widget; `npm run test:real` (3 tests) and
  `scripts/probe.mjs`; the Docker image of the integration run with the
  constraints of the Gladys sandbox (read-only root, all capabilities dropped,
  256 MB, bridge network) against the same server: joins, leaves and a chat
  message, about 70 MB of memory with the test harness;
- not checked: a **Bedrock Edition** server (the Bedrock Dedicated Server, in
  the versions 1.21.131 and 1.26.52 of the `pjnetnz/bedrock-server` and
  `godfool/bedrock-server` Docker images, could not bind its UDP port in the
  development sandbox: the Bedrock code follows the documented format and the
  fixtures of mcstatus and Home Assistant; `scripts/probe.mjs bedrock <address>`
  reads a real one); Paper, Spigot, Fabric, Forge servers and BungeeCord or
  Velocity proxies (their formats come from the mcstatus fixtures and the
  protocol documentation); a real SRV record; and everything inside a real
  Gladys (discovery, "Add", the widget, the scene editor cards).

## Limitations

- Java Edition 1.7 or later (no "legacy" ping of older servers); three servers
  at most per Gladys.
- Who is playing: Java Edition only; without RCON, 12 names at most and only
  when the server shows them. Bedrock Edition only gives the counts.
- A join or a leave is seen at the next reading: someone who comes and goes
  between two readings is not seen. When the whole server stops, only _offline_
  fires, not one departure per player.
- Chat messages carry the `[Rcon]` prefix of the `say` command. No other command
  can be sent, on purpose.
- No discovery of the servers on the LAN: Gladys runs the integration in an
  isolated container (bridge network) that does not see the LAN broadcasts of
  the game. Names ending in `.local` do not resolve there: use IP addresses or
  names your DNS resolves.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

Against a real server (skipped when the variables are not set):

```bash
MINECRAFT_JAVA=192.0.2.10:25565 MINECRAFT_RCON_PASSWORD=… npm run test:real
node scripts/probe.mjs java 192.0.2.10            # read-only, prints no name
node scripts/probe.mjs bedrock 192.0.2.10:19132
```

See [`CLAUDE.md`](CLAUDE.md) for the project rules and the pitfalls already
found.

## Credits

- [minecraft.wiki](https://minecraft.wiki): the documentation of the Server
  List Ping, RakNet, RCON and `server.properties`, from which the protocol code
  was written.
- [mcstatus](https://github.com/py-mine/mcstatus) by the py-mine contributors
  (Apache-2.0): the edge cases (SRV lookup, MOTD formats, Bedrock
  advertisement) and test fixtures; no code was copied.
- Home Assistant's
  [`minecraft_server`](https://github.com/home-assistant/core/tree/dev/homeassistant/components/minecraft_server)
  integration (Apache-2.0), by elmurato, zachdeibert and contributors: the choice of
  sensors and its test fixtures.
- The structure and the conformity tests follow
  [gladys-pihole](https://github.com/guim31/gladys-pihole) and
  [gladys-wled](https://github.com/guim31/gladys-wled).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by Mojang Studios or
Microsoft. "Minecraft" is a trademark of Mojang Synergies AB.

## License

[Apache-2.0](LICENSE)
