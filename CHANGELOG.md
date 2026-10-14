# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.1] - 2026-10-14

### Added

- One Gladys device per Minecraft server (up to three, Java Edition or Bedrock
  Edition, at home or on the Internet): online, players online, player slots,
  who is playing (Java Edition), version, message of the day and latency, read
  like the multiplayer screen of the game, without any account.
- Scene triggers: a player joined the server, a player left it (with the
  minutes played), the server is offline.
- Scene action: send a message in the game chat through RCON ("Dinner is
  ready!").
- Optional RCON (Java Edition, off by default) for the complete list of
  players, beyond the 12 names of the server list.
- Dashboard widget "Minecraft": players online and state of each server, and
  who is playing.
- A "Test the connection" button, and a connection status naming the server and
  the problem.
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-minecraft/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/guim31/gladys-minecraft/releases/tag/v1.0.1
