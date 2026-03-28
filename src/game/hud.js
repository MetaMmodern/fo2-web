export function createHud(container = document.body) {
  const hud = document.createElement("aside");
  hud.className = "hud";
  container.appendChild(hud);
  return hud;
}

export function updateHud(hud, carRoot, tireRoot) {
  const hubNames = [];
  const placeholderNames = [];
  const materialNames = new Set();
  const tireNodeNames = [];

  carRoot.traverse((obj) => {
    if (obj.name.startsWith("wheelhub_")) {
      hubNames.push(obj.name);
    }

    if (obj.name.startsWith("placeholder_tire_")) {
      placeholderNames.push(obj.name);
    }

    if (obj.isMesh) {
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach((material) => {
        if (material?.name) {
          materialNames.add(material.name);
        }
      });
    }
  });

  tireRoot.traverse((obj) => {
    if (obj.name.startsWith("tire_")) {
      tireNodeNames.push(obj.name);
    }
  });

  hud.innerHTML = `
    <div class="hud-section">
      <div class="hud-title">Wheel Hubs</div>
      <div class="hud-text">${hubNames.join(", ") || "none"}</div>
    </div>
    <div class="hud-section">
      <div class="hud-title">Tire Placeholders</div>
      <div class="hud-text">${placeholderNames.join(", ") || "none"}</div>
    </div>
    <div class="hud-section">
      <div class="hud-title">Tire Nodes</div>
      <div class="hud-text">${tireNodeNames.join(", ") || "none"}</div>
    </div>
    <div class="hud-section">
      <div class="hud-title">Materials</div>
      <div class="hud-text">${Array.from(materialNames).join(", ") || "none"}</div>
    </div>
  `;
}
