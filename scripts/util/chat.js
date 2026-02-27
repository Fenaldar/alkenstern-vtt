// gmWhisper(), gmSpeaker(), etc.
export function getActiveGM() {
  return game.users.find(u => u.isGM && u.active) ?? game.users.find(u => u.isGM);
}

export function gmIds() {
  return game.users.filter(u => u.isGM).map(u => u.id);
}

export async function gmWhisper(html) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ user: getActiveGM() ?? game.user }),
    whisper: gmIds(),
    content: html
  });
}
