# Minecraft fixtures

## `real/`: recorded from a real server

Recorded on 14/10/2026 from the **official vanilla Java Edition server 1.21.11**
(the Mojang `server.jar` of the `webhippie/minecraft-vanilla` Docker image), in
offline mode, with bots connected through `minecraft-protocol` (players
`Steve`, `Alex`, `Notch_42`, `Player01` to `Player13`: their UUIDs are the
offline-mode ones, derived from the name, no real account). Nothing to
anonymize: a status answer carries no address.

- `*.status.hex`: the bytes the server sent after the Handshake and the
  Status Request (the Status Response packet).
- `*.rcon.hex`: the bytes of a login (`test-rcon-pass`, a test password)
  then of `list`.
- `java-1.21.11-empty`: nobody online.
- `java-1.21.11-three-players`: three players, the full `sample`.
- `java-1.21.11-thirteen-players`: thirteen players, a `sample` of **12**
  picked at random (`max-players=20`).
- `java-1.21.11-hidden-players`: `hide-online-players=true`, two players: no
  `sample` at all; MOTD with `§` codes on two lines.
- `rcon-wrong-password.hex`: a login with a wrong password (id `-1`).

The Bedrock Dedicated Server (1.21.131 and 1.26.52, Docker images
`pjnetnz/bedrock-server` and `godfool/bedrock-server`) started in the
development session but could not bind its UDP port there: no Bedrock
recording. `scripts/probe.mjs` reads a real one, read-only.

## `mcstatus/` (Apache-2.0)

From the tests of [mcstatus](https://github.com/py-mine/mcstatus): the status
packet of `tests/protocol/test_java_client.py` (1.8-pre1) and the text
component of `tests/motd/conftest.py`.

## `ha/` (Apache-2.0)

From the tests of the Home Assistant `minecraft_server` integration
(`tests/components/minecraft_server/const.py`).

## `synthetic/`

Written from the protocol documentation (minecraft.wiki, "Server List Ping",
"RakNet", "Commands/list"): an "Anonymous Player", a proxy whose `sample` is
free text, Bedrock advertisements (the default `server.properties`, a `;` in
the MOTD, the empty version seen in mcstatus' recording), the `list` answers
of older or patched servers.
