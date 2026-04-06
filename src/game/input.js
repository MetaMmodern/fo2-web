export function createDrivingInput(target = window) {
  const pressedKeys = new Set();

  const onKeyDown = (event) => {
    pressedKeys.add(event.code);
  };

  const onKeyUp = (event) => {
    pressedKeys.delete(event.code);
  };

  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);

  return {
    get throttle() {
      return pressedKeys.has("KeyW") || pressedKeys.has("ArrowUp") ? 1 : 0;
    },
    get brake() {
      return pressedKeys.has("KeyS") || pressedKeys.has("ArrowDown") ? 1 : 0;
    },
    get steer() {
      const left =
        pressedKeys.has("KeyA") || pressedKeys.has("ArrowLeft") ? 1 : 0;
      const right =
        pressedKeys.has("KeyD") || pressedKeys.has("ArrowRight") ? 1 : 0;
      return left - right;
    },
    get handbrake() {
      return pressedKeys.has("Space") ? 1 : 0;
    },
    get resetPressed() {
      return pressedKeys.has("KeyR") ? 1 : 0;
    },
    dispose() {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      pressedKeys.clear();
    },
  };
}
