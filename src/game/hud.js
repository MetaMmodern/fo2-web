export function createHud(container = document.body) {
  const hud = document.createElement("aside");
  hud.className = "hud hud-collapsed";
  hud.innerHTML = `
    <div class="hud-header">
      <button class="hud-toggle" type="button" aria-expanded="false">Show HUD</button>
    </div>
    <div class="hud-body"></div>
  `;

  const toggleButton = hud.querySelector(".hud-toggle");
  toggleButton.addEventListener("click", () => {
    const collapsed = hud.classList.toggle("hud-collapsed");
    toggleButton.textContent = collapsed ? "Show HUD" : "Hide HUD";
    toggleButton.setAttribute("aria-expanded", collapsed ? "false" : "true");
  });

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

  const body = hud.querySelector(".hud-body");
  body.innerHTML = `
    <div class="hud-section">
      <div class="hud-title">Controls</div>
      <div class="hud-text">W/S or arrows: throttle and brake</div>
      <div class="hud-text">A/D or arrows: steer</div>
      <div class="hud-text">Space: handbrake</div>
      <div class="hud-text">R: reset car</div>
      <div class="hud-text">C: cycle chase cameras</div>
      <div class="hud-text">\`: toggle orbit debug camera</div>
      <div class="hud-text">Orbit: I/J/K/L move, U/O vertical</div>
      <div class="hud-text">Orbit: 1/2 slower or faster step</div>
      <div class="hud-text">Orbit: mouse wheel changes FOV</div>
    </div>
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
