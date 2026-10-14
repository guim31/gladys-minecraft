// -----------------------------------------------------------------------------
// The Minecraft hub: one record per configured server, read on a timer of the
// container (the interval chosen in the configuration), its states published
// to Gladys when they change (and every few hours, the heartbeat), its scene
// events fired on transitions (a player joined or left, the server went
// offline), and the chat messages of the scene action.
//
// Gladys never polls these devices (should_poll: false): Gladys 5.2 does not
// poll an external device reliably (GladysAssistant/Gladys#3198), and the
// scene events must fire even for a server whose device was not added. Every
// configured server is read; the states only go to the devices added to
// Gladys (it drops the others and they count in its 300 states a minute).
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { buildDevice, deviceIds, featureStates, serverName, slotOf } from './devices.js';
import { resolveJavaTarget } from './minecraft/address.js';
import { BEDROCK_DEFAULT_PORT, pingBedrock } from './minecraft/bedrock.js';
import { ERROR_KINDS, MinecraftError } from './minecraft/errors.js';
import { pingJava } from './minecraft/java.js';
import { parseRconList, readBedrockStatus, readJavaStatus } from './minecraft/model.js';
import { RconClient } from './minecraft/rcon.js';
import { ACTION_TEXT, CONNECTION_TEXT, ERROR_TEXT, REPORT_TEXT, labelled, pick } from './texts.js';

const logger = createLogger({ name: 'minecraft-hub' });

export const WIDGET_KEY = 'minecraft';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  PLAYER_JOINED: 'player_joined',
  PLAYER_LEFT: 'player_left',
  SERVER_OFFLINE: 'server_offline',
});

export const HUB_TIMINGS = {
  // A server that fails once is read again this soon, to tell a blip from an outage.
  retryMs: 15_000,
  // Failures in a row before a server counts as offline (state and scene event).
  downAfterFailures: 2,
  // An unchanged value is sent again this often, so Gladys never shows it as
  // stale ("no recent value" after 48 h).
  heartbeatMs: 6 * 60 * 60_000,
  // Status ping and RCON timeout.
  timeoutMs: 5_000,
};

// What a chat message may hold: one line, the 256 characters of the chat.
export const MAX_CHAT_LENGTH = 256;

/** A chat message typed in a scene, made safe for one `say` command line. */
export function cleanChatMessage(raw) {
  const text = typeof raw === 'string' ? raw : raw === undefined || raw === null ? '' : String(raw);
  const line = text
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return line.length > MAX_CHAT_LENGTH ? line.slice(0, MAX_CHAT_LENGTH) : line;
}

/** The real network: status pings and RCON clients. Tests pass a fake one. */
export const NETWORK = {
  async ping(server, { timeoutMs }) {
    if (server.edition === 'bedrock') {
      const { host, port } = server.address;
      const answer = await pingBedrock({ host, port: port ?? BEDROCK_DEFAULT_PORT, timeoutMs });
      return readBedrockStatus(answer.status, answer.latencyMs);
    }
    const target = await resolveJavaTarget(server.address);
    const answer = await pingJava({ host: target.host, port: target.port, timeoutMs });
    return readJavaStatus(answer.status, answer.latencyMs);
  },
  rcon(server, { timeoutMs }) {
    return new RconClient({
      host: server.address.host,
      port: server.rcon.port,
      password: server.rcon.password,
      timeoutMs,
    });
  },
};

const signature = (server) =>
  JSON.stringify([server.address, server.edition, server.rcon?.port, server.rcon?.password]);

const UNREACHABLE_KINDS = new Set([ERROR_KINDS.UNREACHABLE, ERROR_KINDS.DNS]);

export class MinecraftHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} [options.network] NETWORK seam (tests)
   * @param {boolean} [options.timers] periodic timers (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, network = NETWORK, timers = true, timings, now }) {
    this.gladys = gladys;
    this.network = network;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.config = null;
    /** @type {Map<number, object>} server records, by slot */
    this.records = new Map();
    this.transports = new Map();
    this.connection = null;
    this.pollTimer = null;
    this.stopped = false;
    /** Problems already logged, by key: repeats go to debug. */
    this.warned = new Set();
  }

  // --- Logs ------------------------------------------------------------------
  // Info keeps the lifecycle only (servers connected, lost, back, user
  // actions). A problem that repeats every cycle is logged once at its own
  // level, then at debug until it clears. LOG_LEVEL=debug shows everything.

  /** Log a problem once (`level` warn or error), its repeats at debug. */
  problem(key, message, err, level = 'warn') {
    const args = err === undefined ? [message] : [message, err];
    if (this.warned.has(key)) {
      logger.debug(...args);
      return;
    }
    this.warned.add(key);
    logger[level](...args);
  }

  /** The problem `key` is gone: one line (when given), and the next occurrence is logged again. */
  resolved(key, message) {
    if (this.warned.delete(key) && message) {
      logger.info(message);
    }
  }

  label(record) {
    return `Minecraft ${record.server.slot} (${serverName(record.server)})`;
  }

  get language() {
    return this.config?.language ?? 'fr';
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates();
    this.transports.clear();
    this.connection = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    const languageChanged = this.config !== null && this.config.language !== config.language;
    this.config = config;
    const wanted = new Map(config.servers.map((server) => [server.slot, server]));
    for (const [slot, record] of this.records) {
      const server = wanted.get(slot);
      if (!server || record.signature !== signature(server)) {
        this.dropRecord(record);
        this.records.delete(slot);
      }
    }
    for (const server of config.servers) {
      const record = this.records.get(server.slot);
      if (record) {
        record.server = server; // a new name: same connection, same players
      } else {
        this.records.set(server.slot, this.newRecord(server));
      }
    }
    if (languageChanged) {
      // The players text is worded in the configured language.
      this.gladys.forgetPublishedStates();
    }
    await this.publishDevices();
    await this.pollAll();
    this.schedulePoll();
  }

  newRecord(server) {
    return {
      server,
      signature: signature(server),
      rcon: server.rcon?.password
        ? this.network.rcon(server, { timeoutMs: this.timings.timeoutMs })
        : null,
      status: null,
      reachable: null,
      error: null,
      rconError: null,
      failures: 0,
      down: false,
      downSince: null,
      /** The last complete player list (a Set), null when unknown. */
      players: null,
      /** When each player was seen joining. */
      joinedAt: new Map(),
      polling: null,
      retryTimer: null,
      dropped: false,
    };
  }

  dropRecord(record) {
    record.dropped = true;
    clearTimeout(record.retryTimer);
    record.rcon?.close();
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    for (const record of this.records.values()) {
      this.dropRecord(record);
    }
  }

  schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped || this.records.size === 0) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      try {
        await this.pollAll();
        this.resolved('poll');
      } catch (err) {
        this.problem('poll', 'Reading cycle failed', err, 'error');
      }
      this.schedulePoll();
    }, this.config.pollIntervalMs);
  }

  // --- Devices -----------------------------------------------------------------

  async publishDevices() {
    const devices = [...this.records.values()].map((record) =>
      buildDevice(this.gladys, record.server, this.language),
    );
    // Even an empty list: the Discovery tab then shows no stale server.
    await this.gladys.publishDiscoveredDevices(devices);
  }

  /** "Search" in the Discovery tab: publish the devices again, read the servers. */
  async rediscover() {
    await this.publishDevices();
    await this.pollAll();
  }

  /** The device external ids the user added to Gladys. */
  createdDevices() {
    return new Set((this.gladys.devices ?? []).map((device) => device.external_id));
  }

  recordOf(externalId) {
    const slot = slotOf(this.gladys, externalId);
    return slot === null ? null : (this.records.get(slot) ?? null);
  }

  /** The user added a device: the SDK forgot its states, send them again now. */
  async onDeviceCreated(device) {
    const record = this.recordOf(device.external_id);
    if (!record) {
      return;
    }
    await this.publishStates(record, { created: true });
    this.transports.delete(device.external_id);
    await this.publishTransports();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  // --- Reading the servers -------------------------------------------------------

  async pollAll() {
    const records = [...this.records.values()];
    const changes = await Promise.all(records.map((record) => this.poll(record)));
    await this.afterChanges(changes.some(Boolean));
  }

  /** Gladys asks for a refresh (onPoll, a fallback): read that server now. */
  async pollDevice(device) {
    const record = this.recordOf(device.external_id);
    if (record) {
      await this.afterChanges(await this.poll(record));
    }
  }

  /**
   * Read one server and apply what changed. Concurrent calls share the read.
   * @returns {Promise<boolean>} whether the widget shows something new
   */
  poll(record) {
    record.polling ??= this.read(record).finally(() => {
      record.polling = null;
    });
    return record.polling;
  }

  async read(record) {
    let status;
    try {
      status = await this.network.ping(record.server, { timeoutMs: this.timings.timeoutMs });
    } catch (err) {
      if (!(err instanceof MinecraftError)) {
        throw err;
      }
      return this.applyFailure(record, err);
    }
    if (record.server.rcon) {
      status = await this.readRcon(record, status);
    }
    return this.applySuccess(record, status);
  }

  /** RCON `list`: the whole player list, in place of the status sample. */
  async readRcon(record, status) {
    const key = `rcon:${record.server.slot}`;
    try {
      if (!record.rcon) {
        throw new MinecraftError(ERROR_KINDS.RCON_NO_PASSWORD, 'RCON password missing');
      }
      const list = parseRconList(await record.rcon.command('list'));
      record.rconError = null;
      this.resolved(key, `${this.label(record)}: RCON works again`);
      return {
        ...status,
        online: list.online ?? status.online,
        players: list.players,
        playersComplete: list.complete,
        playersHidden: false,
        playersSource: 'rcon',
      };
    } catch (err) {
      if (!(err instanceof MinecraftError)) {
        throw err;
      }
      const changed = record.rconError?.kind !== err.kind;
      record.rconError = { kind: err.kind };
      if (changed) {
        this.warned.delete(key);
      }
      this.problem(key, `${this.label(record)}: ${err.message}`);
      return status;
    }
  }

  async applySuccess(record, status) {
    if (record.dropped) {
      return false;
    }
    const previous = record.status;
    if (record.down) {
      const downMinutes = Math.round((this.now() - record.downSince) / 60_000);
      logger.info(`${this.label(record)} answers again after ${downMinutes} min`);
    } else if (record.error) {
      logger.info(`${this.label(record)}: connection restored`);
    } else if (record.reachable === null) {
      logger.info(
        `${this.label(record)}: connected (${record.server.edition === 'java' ? 'Java' : 'Bedrock'} ${status.version || '?'})`,
      );
    }
    const widgetChanged =
      record.reachable !== true ||
      record.error !== null ||
      previous?.online !== status.online ||
      previous?.max !== status.max ||
      previous?.version !== status.version ||
      (previous?.players ?? []).join() !== status.players.join();
    record.failures = 0;
    record.down = false;
    record.downSince = null;
    record.error = null;
    record.reachable = true;
    record.status = status;
    await this.playerTransitions(record, status);
    await this.publishStates(record);
    return widgetChanged;
  }

  async applyFailure(record, err) {
    if (record.dropped) {
      return false;
    }
    const wasError = record.error?.kind;
    record.error = { kind: err.kind, message: err.message };
    record.reachable = false;
    // One warning when the problem starts (or changes), not one per reading.
    if (wasError !== err.kind) {
      logger.warn(`${this.label(record)}: ${err.message}`);
    } else {
      logger.debug(`${this.label(record)}: ${err.message} (again)`);
    }
    // Only silence counts as offline: an answer that is not a Minecraft
    // status (wrong edition, another service on the port) is a configuration
    // problem, reported by the connection status.
    if (!UNREACHABLE_KINDS.has(err.kind)) {
      record.failures = 0;
      return wasError !== err.kind;
    }
    record.failures += 1;
    if (record.failures === 1) {
      record.downSince = this.now();
      this.scheduleRetry(record);
    }
    let changed = wasError !== err.kind;
    if (!record.down && record.failures >= this.timings.downAfterFailures) {
      record.down = true;
      changed = true;
      // Who was playing is unknown from now on: no "left" event for each of
      // them, the next list is a new starting point.
      record.players = null;
      record.joinedAt.clear();
      await this.fire(TRIGGERS.SERVER_OFFLINE, record, {
        error: pick(ERROR_TEXT[err.kind], this.language),
      });
    }
    if (record.down) {
      // Every reading, for the heartbeat of a long outage (only changes are sent).
      await this.publishStates(record);
    }
    return changed;
  }

  scheduleRetry(record) {
    clearTimeout(record.retryTimer);
    if (!this.timersEnabled || this.stopped) {
      return;
    }
    record.retryTimer = setTimeout(() => {
      this.poll(record)
        .then((changed) => this.afterChanges(changed))
        .then(() => this.resolved('retry'))
        .catch((err) => this.problem('retry', 'Retry failed', err, 'error'));
    }, this.timings.retryMs);
    record.retryTimer.unref?.();
  }

  /**
   * Joins and leaves, between two complete player lists only: a partial
   * sample (more than 12 players, hidden names) would invent them.
   */
  async playerTransitions(record, status) {
    if (!status.playersComplete) {
      record.players = null;
      return;
    }
    const current = new Set(status.players);
    const before = record.players;
    record.players = current;
    if (before === null) {
      // A new starting point (first reading, list known again): no event.
      for (const name of [...record.joinedAt.keys()]) {
        if (!current.has(name)) {
          record.joinedAt.delete(name);
        }
      }
      return;
    }
    const now = this.now();
    for (const name of status.players) {
      if (!before.has(name)) {
        record.joinedAt.set(name, now);
        logger.debug(`${this.label(record)}: ${name} joined`);
        await this.fire(TRIGGERS.PLAYER_JOINED, record, {
          player: name,
          players_online: status.online,
        });
      }
    }
    for (const name of before) {
      if (!current.has(name)) {
        const since = record.joinedAt.get(name);
        record.joinedAt.delete(name);
        logger.debug(`${this.label(record)}: ${name} left`);
        await this.fire(TRIGGERS.PLAYER_LEFT, record, {
          player: name,
          players_online: status.online,
          minutes_played: since === undefined ? null : Math.round((now - since) / 60_000),
        });
      }
    }
  }

  async fire(key, record, data) {
    try {
      await this.gladys.publishSceneEvent(key, {
        device: deviceIds(this.gladys, record.server.slot).device,
        server: serverName(record.server),
        ...data,
      });
      this.resolved('scene-event');
    } catch (err) {
      this.problem('scene-event', `Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Publishing to Gladys ----------------------------------------------------------

  /**
   * The states of a server, to its device if the user added it. Only the
   * changes, and every value once per heartbeat (SDK publishChangedStates).
   */
  async publishStates(record, { created = false } = {}) {
    const externalId = deviceIds(this.gladys, record.server.slot).device;
    if (!created && !this.createdDevices().has(externalId)) {
      return;
    }
    const states = featureStates(this.gladys, record, this.language)
      .filter((entry) => entry.state !== undefined || entry.text !== undefined)
      .map(({ externalId: id, state, text }) =>
        text === undefined
          ? { device_feature_external_id: id, state }
          : { device_feature_external_id: id, text },
      );
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeatMs });
      this.resolved('states');
    } catch (err) {
      this.problem('states', `States of ${this.label(record)} refused: ${err.message}`);
    }
  }

  /** The periodic tail of a reading: transports, connection status, widget. */
  async afterChanges(widgetChanged) {
    await this.publishTransports();
    await this.publishConnectionStatus();
    if (widgetChanged) {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  async publishTransports() {
    const entries = [];
    for (const record of this.records.values()) {
      if (record.reachable === null) {
        continue;
      }
      const externalId = deviceIds(this.gladys, record.server.slot).device;
      // A single lost ping is not an outage; a wrong edition or another
      // service on the port gives no data either.
      const unreachable =
        record.error !== null && (record.down || !UNREACHABLE_KINDS.has(record.error.kind));
      const transport = unreachable ? DEVICE_TRANSPORTS.UNREACHABLE : DEVICE_TRANSPORTS.LOCAL;
      if (this.transports.get(externalId) !== transport) {
        entries.push({ external_id: externalId, transport });
      }
    }
    if (entries.length === 0) {
      return;
    }
    try {
      await this.gladys.publishTransports(entries);
      for (const entry of entries) {
        this.transports.set(entry.external_id, entry.transport);
      }
      this.resolved('transports');
    } catch (err) {
      this.problem('transports', `Transports refused: ${err.message}`);
    }
  }

  /** The problems of a record, in a language, for the status and the report. */
  problemsOf(record, language) {
    const parts = [];
    if (record.error) {
      parts.push(pick(ERROR_TEXT[record.error.kind], language));
    }
    if (record.rconError) {
      parts.push(pick(ERROR_TEXT[record.rconError.kind], language));
    }
    return parts;
  }

  /** The status under the integration name: connected while a server answers. */
  connectionStatus() {
    const { servers, invalidSlots } = this.config;
    if (servers.length === 0) {
      return {
        connected: false,
        message: invalidSlots.length ? CONNECTION_TEXT.invalidAddress : CONNECTION_TEXT.noServer,
      };
    }
    const records = [...this.records.values()];
    const failing = records.filter((record) => record.error || record.rconError);
    if (failing.length === 0 && invalidSlots.length === 0) {
      return { connected: true };
    }
    const message = {};
    for (const language of Object.keys(CONNECTION_TEXT.noServer)) {
      const parts = failing.map((record) =>
        labelled(serverName(record.server), this.problemsOf(record, language).join(', '), language),
      );
      if (invalidSlots.length) {
        parts.push(pick(CONNECTION_TEXT.invalidAddress, language));
      }
      message[language] = parts.join(' · ').slice(0, 200);
    }
    const answering = records.filter((record) => !record.error).length;
    return { connected: answering > 0, message };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.resolved('connection-status');
    } catch (err) {
      this.problem('connection-status', `Connection status refused: ${err.message}`);
    }
  }

  // --- Chat --------------------------------------------------------------------------------

  /**
   * Send a chat message (`say`) to one server, or to every server with RCON.
   * @returns {Promise<number>} the number of servers that took it
   */
  async say(deviceExternalId, raw) {
    const language = this.language;
    if (this.records.size === 0) {
      throw new Error(pick(ACTION_TEXT.noServer, language));
    }
    const message = cleanChatMessage(raw);
    if (!message) {
      throw new Error(pick(ACTION_TEXT.emptyMessage, language));
    }
    let records;
    if (deviceExternalId) {
      const record = this.recordOf(deviceExternalId);
      if (!record) {
        throw new Error(pick(ACTION_TEXT.unknownServer, language));
      }
      records = [record];
    } else {
      records = [...this.records.values()].filter((record) => record.server.rcon);
    }
    records = records.filter((record) => record.server.rcon);
    if (records.length === 0) {
      throw new Error(pick(ACTION_TEXT.noRcon, language));
    }
    const results = await Promise.all(
      records.map(async (record) => {
        try {
          if (!record.rcon) {
            throw new MinecraftError(ERROR_KINDS.RCON_NO_PASSWORD, 'RCON password missing');
          }
          await record.rcon.command(`say ${message}`);
          logger.info(`${this.label(record)}: chat message sent (${message.length} characters)`);
          return true;
        } catch (err) {
          if (!(err instanceof MinecraftError)) {
            throw err;
          }
          logger.warn(`${this.label(record)}: chat message not sent: ${err.message}`);
          record.rconError = { kind: err.kind };
          return false;
        }
      }),
    );
    await this.publishConnectionStatus();
    const sent = results.filter(Boolean).length;
    if (sent === 0) {
      const [record] = records;
      throw new Error(
        records.length === 1 && record.rconError
          ? labelled(
              serverName(record.server),
              pick(ERROR_TEXT[record.rconError.kind], language),
              language,
            )
          : pick(ACTION_TEXT.failed, language),
      );
    }
    return sent;
  }

  // --- Reports -------------------------------------------------------------------------------

  /** "Test the connection": read every server now, one line each. */
  async testConnection() {
    await this.pollAll();
    const message = {};
    for (const [language, text] of Object.entries(REPORT_TEXT)) {
      if (this.records.size === 0) {
        message[language] = pick(this.connectionStatus().message, language);
        continue;
      }
      const lines = [...this.records.values()].map((record) => {
        const name = serverName(record.server);
        if (record.error) {
          return labelled(name, this.problemsOf(record, language).join(', '), language);
        }
        const { status } = record;
        const parts = [
          `${record.server.edition === 'java' ? 'Java' : 'Bedrock'} ${status.version || '?'}`.trim(),
          text.players(status.online, status.max),
          text.latency(status.latencyMs),
        ];
        if (record.rconError) {
          parts.push(pick(ERROR_TEXT[record.rconError.kind], language));
        } else if (record.server.rcon) {
          parts.push(text.rconOk);
        } else if (status.playersHidden) {
          parts.push(text.sampleHidden);
        }
        return labelled(name, parts.join(', '), language);
      });
      if (this.config.invalidSlots.length) {
        lines.push(pick(CONNECTION_TEXT.invalidAddress, language));
      }
      message[language] = lines.join('\n');
    }
    return message;
  }

  /** What the widget shows, for one server or all of them. */
  view(deviceExternalId) {
    if (!deviceExternalId) {
      return [...this.records.values()];
    }
    const record = this.recordOf(deviceExternalId);
    return record ? [record] : [];
  }
}
