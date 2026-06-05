import type { SceneView } from "../../shared/protocol";

/** Returns an HTML string rendering the scene's objects positioned in the box. */
export function renderScene(scene: SceneView): string {
  const objs = scene.present
    .map(
      (o) =>
        `<span class="obj" style="left:${o.x}%;top:${o.y}%" title="${o.label}">${o.emoji}</span>`
    )
    .join("");
  return `
    <div class="center"><strong>${scene.title}</strong> — memorize everything!</div>
    <div class="scene">${objs}</div>
  `;
}
