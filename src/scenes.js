// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// One action, and only one: send a chat message to the players ("Dinner is
// ready!"), through RCON `say`. Never an arbitrary command: the message is
// cleaned to one line and always sent after `say`. The message field accepts
// scene variables ({{triggerEvent.data.player}}), resolved by Gladys.
// -----------------------------------------------------------------------------

export const SCENE_ACTIONS = {
  async send_chat_message(hub, { fields = {} }) {
    const servers = await hub.say(fields.device || null, fields.message);
    return { servers };
  },
};
