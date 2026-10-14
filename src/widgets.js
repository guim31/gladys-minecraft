// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `minecraft`.
//
// The use case: the wall tablet in the kitchen shows whether the children's
// server is up and who is on it. So: one tile per server (players online /
// slots, green when it answers, red when it is offline), and a status list
// with each server's state and version and who is playing.
//
// Budget (8 components, 6 tiles, 1 status): three tiles at most (three
// servers), one status list of ten rows at most. The values are sent as
// values, not bound to device features, so the widget works before the
// devices are added to Gladys. Every server by default, or the one chosen in
// the widget settings. The core gives the user's language: texts are
// localized with it.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { serverName } from './devices.js';
import { WIDGET_KEY } from './hub.js';
import { pick } from './texts.js';

export const TEXT = {
  pick: {
    en: 'Enter the address of your Minecraft server in the configuration of the integration.',
    fr: "Saisissez l'adresse de votre serveur Minecraft dans la configuration de l'intégration.",
    de: 'Gib die Adresse deines Minecraft-Servers in der Konfiguration der Integration ein.',
    es: 'Introduzca la dirección de su servidor Minecraft en la configuración de la integración.',
  },
  unknown: {
    en: 'This server is no longer in the configuration: choose another one in the widget settings.',
    fr: "Ce serveur n'est plus dans la configuration : choisissez-en un autre dans les réglages du widget.",
    de: 'Dieser Server ist nicht mehr in der Konfiguration: Wähle einen anderen in den Widget-Einstellungen.',
    es: 'Este servidor ya no está en la configuración: elija otro en la configuración del widget.',
  },
  players: { en: 'Players', fr: 'Joueurs', de: 'Spieler', es: 'Jugadores' },
  latency: { en: 'Latency', fr: 'Latence', de: 'Latenz', es: 'Latencia' },
  online: { en: 'Online', fr: 'En ligne', de: 'Online', es: 'En línea' },
  offline: { en: 'Offline', fr: 'Hors ligne', de: 'Offline', es: 'Desconectado' },
  error: { en: 'Error', fr: 'Erreur', de: 'Fehler', es: 'Error' },
  waiting: { en: 'Waiting…', fr: 'En attente…', de: 'Warte…', es: 'Esperando…' },
  nobody: { en: 'Nobody', fr: 'Personne', de: 'Niemand', es: 'Nadie' },
  hidden: {
    en: 'names hidden',
    fr: 'noms masqués',
    de: 'Namen verborgen',
    es: 'nombres ocultos',
  },
};

const t = (text, language) => pick(text, language);
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

const answering = (record) => record.reachable === true && record.status;

/** The tile of one server: players online / slots. */
function serverTile(record, label, language) {
  if (answering(record)) {
    return {
      type: 'value',
      value: fit(`${record.status.online}/${record.status.max}`, 12),
      label: fit(label, 24),
      icon: 'users',
      color: WIDGET_COLORS.SUCCESS,
    };
  }
  if (record.down || (record.error && record.reachable === false && record.failures === 0)) {
    return {
      type: 'value',
      value: t(record.down ? TEXT.offline : TEXT.error, language),
      label: fit(label, 24),
      icon: 'alert-triangle',
      color: WIDGET_COLORS.DANGER,
    };
  }
  return {
    type: 'value',
    value: '…',
    label: fit(label, 24),
    icon: 'clock',
    color: WIDGET_COLORS.NEUTRAL,
  };
}

/** The status row of one server: online with its version, or offline. */
function stateRow(record, language) {
  const label = fit(serverName(record.server), 40);
  if (answering(record)) {
    const version = record.status.version;
    return {
      label,
      icon: 'check-circle',
      value: fit(
        version ? `${t(TEXT.online, language)} · ${version}` : t(TEXT.online, language),
        40,
      ),
      color: WIDGET_COLORS.SUCCESS,
    };
  }
  if (record.down) {
    return {
      label,
      icon: 'x-circle',
      value: t(TEXT.offline, language),
      color: WIDGET_COLORS.DANGER,
    };
  }
  if (record.error && record.failures === 0) {
    return {
      label,
      icon: 'alert-triangle',
      value: t(TEXT.error, language),
      color: WIDGET_COLORS.DANGER,
    };
  }
  return { label, icon: 'clock', value: t(TEXT.waiting, language), color: WIDGET_COLORS.NEUTRAL };
}

/** Who is playing on one server, as one row (null: unknown, Bedrock). */
function playersRow(record, label, language) {
  if (!answering(record)) {
    return null;
  }
  const { status } = record;
  let value;
  if (status.online === 0) {
    value = t(TEXT.nobody, language);
  } else if (status.players.length > 0) {
    const missing = status.online - status.players.length;
    value =
      status.players.join(', ') + (missing > 0 && !status.playersComplete ? ` +${missing}` : '');
  } else if (status.playersHidden) {
    value = t(TEXT.hidden, language);
  } else {
    return null; // Bedrock: the count is in the tile
  }
  return {
    label: fit(label, 40),
    icon: 'user',
    value: fit(value, 40),
    color: WIDGET_COLORS.NEUTRAL,
  };
}

async function get(hub, { settings, language = 'en' } = {}) {
  if (hub.records.size === 0) {
    return message(TEXT.pick, language);
  }
  const records = hub.view(settings?.device).slice(0, 3);
  if (records.length === 0) {
    return message(TEXT.unknown, language);
  }
  const single = records.length === 1;
  const components = [];
  for (const record of records) {
    components.push(
      serverTile(record, single ? t(TEXT.players, language) : serverName(record.server), language),
    );
  }
  if (single && answering(records[0])) {
    components.push({
      type: 'value',
      value: records[0].status.latencyMs,
      unit: 'ms',
      label: t(TEXT.latency, language),
      icon: 'activity',
    });
  }
  const items = [];
  for (const record of records) {
    items.push(stateRow(record, language));
    const row = playersRow(
      record,
      single
        ? t(TEXT.players, language)
        : `${t(TEXT.players, language)} · ${serverName(record.server)}`,
      language,
    );
    if (row) {
      items.push(row);
    }
  }
  components.push({ type: 'status', items: items.slice(0, 10) });
  return { ttl_seconds: 60, components };
}

export const WIDGETS = {
  [WIDGET_KEY]: { get },
};
