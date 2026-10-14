# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **Secrets**: the RCON passwords are `secret` fields of the Gladys
  configuration. The integration reads them from Gladys, keeps them in memory,
  sends them only to the RCON port of the server they belong to, and never
  writes them to `/data` nor to the logs. RCON runs any command on the server:
  the integration only ever sends `list` and `say <message>`, the message
  cleaned to one line, and a scene cannot send anything else.
- **Stored in `/data`**: nothing.
- **Network**: the integration connects only to the addresses typed in the
  configuration: TCP to the Java Edition port (25565 by default) and to the
  RCON port, UDP to the Bedrock Edition port (19132 by default), and a DNS SRV
  lookup (`_minecraft._tcp.<name>`) for a Java name typed without port. RCON is
  not encrypted (a limit of the Minecraft protocol): keep it on the local
  network. The integration opens no port and calls no cloud service.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
Minecraft servers and their plugins, and the Minecraft protocols themselves.
