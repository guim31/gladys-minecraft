// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the players text, the "Test the connection"
// report, scene action errors. Four languages, the four of the Gladys
// interface; German says "du", Spanish "usted". test/i18n.test.js checks
// every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './minecraft/errors.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noServer: {
    en: 'Enter the address of your Minecraft server in the configuration.',
    fr: "Saisissez l'adresse de votre serveur Minecraft dans la configuration.",
    de: 'Gib die Adresse deines Minecraft-Servers in der Konfiguration ein.',
    es: 'Introduzca la dirección de su servidor Minecraft en la configuración.',
  },
  invalidAddress: {
    en: 'Address not understood, e.g. 192.168.1.20 or mc.example.com:25565',
    fr: 'Adresse incomprise, ex. 192.168.1.20 ou mc.example.com:25565',
    de: 'Adresse nicht verstanden, z. B. 192.168.1.20 oder mc.example.com:25565',
    es: 'Dirección no válida, p. ej. 192.168.1.20 o mc.example.com:25565',
  },
};

// One short explanation per error kind (src/minecraft/errors.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'does not answer',
    fr: 'ne répond pas',
    de: 'antwortet nicht',
    es: 'no responde',
  },
  [ERROR_KINDS.DNS]: {
    en: 'name not found',
    fr: 'nom introuvable',
    de: 'Name nicht gefunden',
    es: 'nombre no encontrado',
  },
  [ERROR_KINDS.PROTOCOL]: {
    en: 'not a Minecraft server of this edition',
    fr: 'pas un serveur Minecraft de cette édition',
    de: 'kein Minecraft-Server dieser Edition',
    es: 'no es un servidor Minecraft de esta edición',
  },
  [ERROR_KINDS.RCON_AUTH]: {
    en: 'RCON password refused',
    fr: 'mot de passe RCON refusé',
    de: 'RCON-Passwort abgelehnt',
    es: 'contraseña RCON rechazada',
  },
  [ERROR_KINDS.RCON_NO_PASSWORD]: {
    en: 'RCON is on but its password is empty',
    fr: 'RCON activé mais sans mot de passe',
    de: 'RCON ist aktiv, aber ohne Passwort',
    es: 'RCON activado pero sin contraseña',
  },
  [ERROR_KINDS.RCON_UNREACHABLE]: {
    en: 'RCON does not answer (enable-rcon, port)',
    fr: 'RCON ne répond pas (enable-rcon, port)',
    de: 'RCON antwortet nicht (enable-rcon, Port)',
    es: 'RCON no responde (enable-rcon, puerto)',
  },
};

// The "Players" feature (src/devices.js).
export const PLAYERS_TEXT = {
  en: {
    nobody: 'Nobody',
    offline: 'Server offline',
    hidden: (count) => `${count} player(s), names hidden by the server`,
    more: (count) => `and ${count} more`,
  },
  fr: {
    nobody: 'Personne',
    offline: 'Serveur hors ligne',
    hidden: (count) => `${count} joueur(s), noms masqués par le serveur`,
    more: (count) => `et ${count} autre(s)`,
  },
  de: {
    nobody: 'Niemand',
    offline: 'Server offline',
    hidden: (count) => `${count} Spieler, Namen vom Server verborgen`,
    more: (count) => `und ${count} weitere`,
  },
  es: {
    nobody: 'Nadie',
    offline: 'Servidor fuera de línea',
    hidden: (count) => `${count} jugador(es), nombres ocultos por el servidor`,
    more: (count) => `y ${count} más`,
  },
};

// The "Test the connection" report, one line per server.
export const REPORT_TEXT = {
  en: {
    players: (online, max) => `${online}/${max} players`,
    latency: (ms) => `${ms} ms`,
    rconOk: 'RCON OK',
    sampleHidden: 'player names hidden',
  },
  fr: {
    players: (online, max) => `${online}/${max} joueurs`,
    latency: (ms) => `${ms} ms`,
    rconOk: 'RCON OK',
    sampleHidden: 'noms des joueurs masqués',
  },
  de: {
    players: (online, max) => `${online}/${max} Spieler`,
    latency: (ms) => `${ms} ms`,
    rconOk: 'RCON OK',
    sampleHidden: 'Spielernamen verborgen',
  },
  es: {
    players: (online, max) => `${online}/${max} jugadores`,
    latency: (ms) => `${ms} ms`,
    rconOk: 'RCON OK',
    sampleHidden: 'nombres de jugadores ocultos',
  },
};

// Errors of the scene action (shown in Gladys).
export const ACTION_TEXT = {
  noServer: {
    en: 'No Minecraft server is configured.',
    fr: "Aucun serveur Minecraft n'est configuré.",
    de: 'Kein Minecraft-Server ist konfiguriert.',
    es: 'No hay ningún servidor Minecraft configurado.',
  },
  unknownServer: {
    en: 'This Minecraft server is no longer in the configuration.',
    fr: "Ce serveur Minecraft n'est plus dans la configuration.",
    de: 'Dieser Minecraft-Server ist nicht mehr in der Konfiguration.',
    es: 'Este servidor Minecraft ya no está en la configuración.',
  },
  noRcon: {
    en: 'Enable RCON for this server in the configuration to send chat messages.',
    fr: 'Activez RCON pour ce serveur dans la configuration pour envoyer des messages.',
    de: 'Aktiviere RCON für diesen Server in der Konfiguration, um Nachrichten zu senden.',
    es: 'Active RCON para este servidor en la configuración para enviar mensajes.',
  },
  emptyMessage: {
    en: 'The message is empty.',
    fr: 'Le message est vide.',
    de: 'Die Nachricht ist leer.',
    es: 'El mensaje está vacío.',
  },
  failed: {
    en: 'No server accepted the message.',
    fr: "Aucun serveur n'a accepté le message.",
    de: 'Kein Server hat die Nachricht angenommen.',
    es: 'Ningún servidor ha aceptado el mensaje.',
  },
};

export const LANGUAGE_FALLBACK = 'en';

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;
export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];
