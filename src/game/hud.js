export function createHud(
  { tracks, cars, selection, onTrackChange, onCarChange, onSkinChange },
  container = document.body,
) {
  const hudRoot = document.createElement("aside");
  hudRoot.className = "hud hud-collapsed";
  hudRoot.innerHTML = `
    <div class="hud-header">
      <button class="hud-toggle" type="button" aria-expanded="false">Show HUD</button>
    </div>
    <div class="hud-body">
      <div class="hud-section">
        <div class="hud-title">Scene</div>
        <label class="hud-control">
          <span class="hud-control-label">Track</span>
          <select class="hud-select" data-role="track"></select>
        </label>
        <label class="hud-control">
          <span class="hud-control-label">Car</span>
          <select class="hud-select" data-role="car"></select>
        </label>
        <label class="hud-control">
          <span class="hud-control-label">Skin</span>
          <select class="hud-select" data-role="skin"></select>
        </label>
      </div>
      <div class="hud-section">
        <div class="hud-title">Telemetry</div>
        <div class="hud-text" data-role="speed">Speed: 0 km/h</div>
      </div>
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
    </div>
  `;

  const toggleButton = hudRoot.querySelector(".hud-toggle");
  const trackSelect = hudRoot.querySelector('[data-role="track"]');
  const carSelect = hudRoot.querySelector('[data-role="car"]');
  const skinSelect = hudRoot.querySelector('[data-role="skin"]');
  const speedValue = hudRoot.querySelector('[data-role="speed"]');

  toggleButton.addEventListener("click", () => {
    const collapsed = hudRoot.classList.toggle("hud-collapsed");
    toggleButton.textContent = collapsed ? "Show HUD" : "Hide HUD";
    toggleButton.setAttribute("aria-expanded", collapsed ? "false" : "true");
  });

  trackSelect.addEventListener("change", () => {
    onTrackChange?.(trackSelect.value);
  });

  carSelect.addEventListener("change", () => {
    onCarChange?.(carSelect.value);
  });

  skinSelect.addEventListener("change", () => {
    onSkinChange?.(skinSelect.value);
  });

  container.appendChild(hudRoot);

  const hud = {
    root: hudRoot,
    trackSelect,
    carSelect,
    skinSelect,
    speedValue,
  };

  syncHudSelection(hud, { tracks, cars, selection });
  return hud;
}

export function syncHudSelection(hud, { tracks, cars, selection }) {
  setSelectOptions(hud.trackSelect, tracks, selection.trackId);
  setSelectOptions(hud.carSelect, cars, selection.carId);

  const selectedCar = cars.find((car) => car.id === selection.carId) ?? cars[0] ?? null;
  const skins = selectedCar?.skins ?? [];
  setSelectOptions(hud.skinSelect, skins, selection.skinId);
}

export function updateHudTelemetry(hud, { speedKph = 0 }) {
  hud.speedValue.textContent = `Speed: ${Math.round(speedKph)} km/h`;
}

function setSelectOptions(select, items, selectedId) {
  const nextSignature = items.map((item) => `${item.id}:${item.label}`).join("|");

  if (select.dataset.signature !== nextSignature) {
    select.innerHTML = items
      .map(
        (item) =>
          `<option value="${escapeAttribute(item.id)}">${escapeHtml(item.label)}</option>`,
      )
      .join("");
    select.dataset.signature = nextSignature;
  }

  if (selectedId != null) {
    select.value = selectedId;
  }
}

function escapeAttribute(value) {
  return String(value).replace(/"/g, "&quot;");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
