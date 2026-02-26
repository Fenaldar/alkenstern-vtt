// getSelectedCharacters(), getSceneCharacters()
export function getSelectedCharacters() {
  return (canvas.tokens.controlled ?? [])
    .map(t => t.actor)
    .filter(a => a?.type === "character");
}

export function getSceneCharacters({ unique = true, visibleOnly = false } = {}) {
  const tokens = canvas.tokens.placeables
    .filter(t => (visibleOnly ? t.visible : true))
    .filter(t => t.actor?.type === "character");

  const actors = tokens.map(t => t.actor);

  if (!unique) return actors;
  return [...new Map(actors.map(a => [a.id, a])).values()];
}
