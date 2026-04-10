export function createDrivingInput(target = window) {
  const pressedKeys = new Set();
  let version = 0;

  const snapshot = () => ({
    throttle: pressedKeys.has("KeyW") || pressedKeys.has("ArrowUp") ? 1 : 0,
    brake: pressedKeys.has("KeyS") || pressedKeys.has("ArrowDown") ? 1 : 0,
    steer:
      (pressedKeys.has("KeyA") || pressedKeys.has("ArrowLeft") ? 1 : 0) -
      (pressedKeys.has("KeyD") || pressedKeys.has("ArrowRight") ? 1 : 0),
    handbrake: pressedKeys.has("Space") ? 1 : 0,
    resetPressed: pressedKeys.has("KeyR") ? 1 : 0,
  });

  const onKeyDown = (event) => {
    const previousSize = pressedKeys.size;
    pressedKeys.add(event.code);
    if (pressedKeys.size !== previousSize) {
      version += 1;
    }
  };

  const onKeyUp = (event) => {
    if (pressedKeys.delete(event.code)) {
      version += 1;
    }
  };

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);

  return {
    get throttle() {
      return snapshot().throttle;
    },
    get brake() {
      return snapshot().brake;
    },
    get steer() {
      return snapshot().steer;
    },
    get handbrake() {
      return snapshot().handbrake;
    },
    get resetPressed() {
      return snapshot().resetPressed;
    },
    get version() {
      return version;
    },
    snapshot,
    clearResetPressed() {
      if (pressedKeys.delete("KeyR")) {
        version += 1;
      }
    },
    dispose() {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      pressedKeys.clear();
    },
  };
}
