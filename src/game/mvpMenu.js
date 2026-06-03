const MENU_STATES = new Set([
  "resource-consent",
  "main-menu",
  "track-select",
  "car-select",
  "race-loading",
  "press-enter",
  "racing",
  "paused",
  "menu-loading",
]);

export function createMvpMenu({
  tracks,
  cars,
  selection,
  onSelectionChange,
  onStartRace,
  onRaceStartConfirmed,
  onPauseRace,
  onResumeRace,
  onExitRace,
  onStateChange,
}) {
  const root = document.createElement("div");
  root.className = "mvp-input-layer";
  root.setAttribute("aria-live", "polite");
  document.body.appendChild(root);

  const state = {
    screen: "resource-consent",
    trackIndex: Math.max(0, tracks.findIndex((track) => track.id === selection.trackId)),
    carIndex: Math.max(0, cars.findIndex((car) => car.id === selection.carId)),
    skinIndex: 0,
    pauseIndex: 0,
    busyMessage: "",
    error: "",
  };

  syncSkinIndex();
  notifyStateChange();

  const onKeyDown = (event) => {
    if (event.repeat) {
      return;
    }

    if (state.screen === "resource-consent" && event.code === "Enter") {
      event.preventDefault();
      setScreen("main-menu");
      return;
    }

    if (state.screen === "main-menu" && event.code === "Enter") {
      event.preventDefault();
      setScreen("track-select");
      return;
    }

    if (state.screen === "track-select") {
      if (event.code === "ArrowUp" || event.code === "ArrowLeft") {
        event.preventDefault();
        moveTrack(-1);
        return;
      }
      if (event.code === "ArrowDown" || event.code === "ArrowRight") {
        event.preventDefault();
        moveTrack(1);
        return;
      }
      if (event.code === "Enter") {
        event.preventDefault();
        setScreen("car-select");
        return;
      }
      if (event.code === "Escape") {
        event.preventDefault();
        setScreen("main-menu");
      }
      return;
    }

    if (state.screen === "car-select") {
      if (event.code === "ArrowLeft") {
        event.preventDefault();
        moveCar(-1);
        return;
      }
      if (event.code === "ArrowRight") {
        event.preventDefault();
        moveCar(1);
        return;
      }
      if (event.code === "ArrowUp") {
        event.preventDefault();
        moveSkin(-1);
        return;
      }
      if (event.code === "ArrowDown") {
        event.preventDefault();
        moveSkin(1);
        return;
      }
      if (event.code === "Enter") {
        event.preventDefault();
        startRace();
        return;
      }
      if (event.code === "Escape") {
        event.preventDefault();
        setScreen("track-select");
      }
      return;
    }

    if (state.screen === "press-enter" && event.code === "Enter") {
      event.preventDefault();
      onRaceStartConfirmed?.();
      setScreen("racing");
      return;
    }

    if (state.screen === "racing") {
      if (event.code === "Escape" || event.code === "KeyP") {
        event.preventDefault();
        onPauseRace?.();
        setScreen("paused");
      }
      return;
    }

    if (state.screen === "paused") {
      if (event.code === "ArrowUp" || event.code === "ArrowDown") {
        event.preventDefault();
        state.pauseIndex = state.pauseIndex === 0 ? 1 : 0;
        notifyStateChange();
        return;
      }
      if (event.code === "Enter") {
        event.preventDefault();
        if (state.pauseIndex === 0) {
          resumeRace();
        } else {
          exitRace();
        }
        return;
      }
      if (event.code === "Escape" || event.code === "KeyP") {
        event.preventDefault();
        resumeRace();
        return;
      }
      if (event.code === "Delete" || event.code === "Backspace") {
        event.preventDefault();
        exitRace();
      }
    }
  };

  window.addEventListener("keydown", onKeyDown);

  function setScreen(screen, nextPartialState = {}) {
    if (!MENU_STATES.has(screen)) {
      return;
    }

    Object.assign(state, nextPartialState, { screen });
    if (screen === "paused" && !Number.isFinite(nextPartialState.pauseIndex)) {
      state.pauseIndex = 0;
    }
    notifyStateChange();
  }

  function setBusy(screen, busyMessage) {
    setScreen(screen, { busyMessage, error: "" });
  }

  function setError(error) {
    state.error = error instanceof Error ? error.message : String(error);
    notifyStateChange();
  }

  function getSelectedTrack() {
    return tracks[state.trackIndex] ?? tracks[0] ?? null;
  }

  function getSelectedCar() {
    return cars[state.carIndex] ?? cars[0] ?? null;
  }

  function getSelectedSkin() {
    const car = getSelectedCar();
    return car?.skins?.[state.skinIndex] ?? car?.skins?.[0] ?? null;
  }

  function syncSkinIndex() {
    const car = getSelectedCar();
    state.skinIndex = Math.max(
      0,
      car?.skins?.findIndex((skin) => skin.id === selection.skinId) ?? 0,
    );
  }

  function commitSelection() {
    const track = getSelectedTrack();
    const car = getSelectedCar();
    const skin = getSelectedSkin();

    onSelectionChange?.({
      trackId: track?.id ?? null,
      carId: car?.id ?? null,
      skinId: skin?.id ?? null,
    });
  }

  function moveTrack(direction) {
    state.trackIndex = wrapIndex(state.trackIndex + direction, tracks.length);
    commitSelection();
    notifyStateChange();
  }

  function moveCar(direction) {
    const nextIndex = clampIndex(state.carIndex + direction, cars.length);
    if (nextIndex === state.carIndex) {
      notifyStateChange();
      return;
    }

    state.carIndex = nextIndex;
    state.skinIndex = 0;
    commitSelection();
    notifyStateChange();
  }

  function moveSkin(direction) {
    const skins = getSelectedCar()?.skins ?? [];
    state.skinIndex = wrapIndex(state.skinIndex + direction, skins.length);
    commitSelection();
    notifyStateChange();
  }

  async function startRace() {
    commitSelection();
    setBusy("race-loading", "Loading race");

    try {
      await onStartRace?.();
      setScreen("press-enter", { busyMessage: "" });
    } catch (error) {
      setScreen("car-select", { busyMessage: "" });
      setError(error);
    }
  }

  function resumeRace() {
    onResumeRace?.();
    setScreen("racing");
  }

  async function exitRace() {
    setBusy("menu-loading", "Returning to menu");

    try {
      await onExitRace?.();
      setScreen("main-menu", { busyMessage: "" });
    } catch (error) {
      setScreen("paused", { busyMessage: "" });
      setError(error);
    }
  }

  function notifyStateChange() {
    onStateChange?.({
      screen: state.screen,
      pauseIndex: state.pauseIndex,
      selection: {
        trackId: getSelectedTrack()?.id ?? null,
        carId: getSelectedCar()?.id ?? null,
        skinId: getSelectedSkin()?.id ?? null,
      },
      message: state.busyMessage,
      error: state.error,
    });
  }

  return {
    setScreen,
    getState() {
      return { ...state };
    },
    dispose() {
      window.removeEventListener("keydown", onKeyDown);
      root.remove();
    },
  };
}

function wrapIndex(value, length) {
  if (length <= 0) {
    return 0;
  }

  return ((value % length) + length) % length;
}

function clampIndex(value, length) {
  if (length <= 0) {
    return 0;
  }

  return Math.min(Math.max(value, 0), length - 1);
}
