import * as THREE from "three";

const DEFAULT_BODY_CONFIG = {
  collisionFullMin: new THREE.Vector3(-0.878, 0.164, -1.82),
  collisionFullMax: new THREE.Vector3(0.878, 1.084, 1.835),
  collisionBottomMin: new THREE.Vector3(-0.878, 0.164, -1.82),
  collisionBottomMax: new THREE.Vector3(0.878, 0.705, 1.835),
};

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const MAX_FORWARD_SPEED = 42;
const MAX_REVERSE_SPEED = 16;

export async function createDrivingSimulation({
  carRoot,
  assetUrls,
  input,
}) {
  const bodyConfig = await loadBodyConfig(assetUrls.bodyConfig).catch(
    () => DEFAULT_BODY_CONFIG,
  );
  const state = {
    speed: 0,
    steerVisual: 0,
    previousResetPressed: false,
  };
  const vehicleLength = Math.max(
    bodyConfig.collisionBottomMax.z - bodyConfig.collisionBottomMin.z,
    3.2,
  );
  const rideHeight = Math.max(bodyConfig.collisionBottomMin.y, 0.18);
  const spawnLift = Math.max(bodyConfig.collisionBottomMax.y + 0.3, 0.9);
  carRoot.position.y = Math.max(carRoot.position.y, spawnLift);
  const spawnPosition = carRoot.position.clone();
  const spawnQuaternion = carRoot.quaternion.clone();

  return {
    update(deltaSeconds) {
      const dt = Math.min(deltaSeconds, 0.1);
      const throttle = input?.throttle ?? 0;
      const brake = input?.brake ?? 0;
      const steerInput = input?.steer ?? 0;
      const handbrake = input?.handbrake ?? 0;
      const forwardSpeed = state.speed;
      const topSpeed = MAX_FORWARD_SPEED;
      const reverseSpeed = MAX_REVERSE_SPEED;
      const acceleration = 30;
      const reverseAcceleration = 22;
      const serviceBrake = 38;
      const coastDrag = handbrake > 0 ? 7.5 : 4.6;
      const tractionLerp = handbrake > 0 ? 0.16 : 0.24;
      let nextSpeed = forwardSpeed;

      if (throttle > 0) {
        nextSpeed = Math.min(nextSpeed + acceleration * throttle * dt, topSpeed);
      } else if (brake > 0) {
        if (nextSpeed > 0.6) {
          nextSpeed = Math.max(nextSpeed - serviceBrake * brake * dt, 0);
        } else {
          nextSpeed = Math.max(
            nextSpeed - reverseAcceleration * brake * dt,
            -reverseSpeed,
          );
        }
      } else if (nextSpeed !== 0) {
        const dragAmount = Math.min(Math.abs(nextSpeed), coastDrag * dt);
        nextSpeed -= Math.sign(nextSpeed) * dragAmount;
      }

      if (handbrake > 0 && Math.abs(nextSpeed) > 1) {
        nextSpeed *= Math.max(0.84, 1 - 1.6 * dt);
      }

      state.speed = nextSpeed;

      const speedRatio = THREE.MathUtils.clamp(
        Math.abs(nextSpeed) / Math.max(topSpeed, 1e-4),
        0,
        1,
      );
      const steerStrength = THREE.MathUtils.lerp(1.2, 0.45, speedRatio);
      const yawDelta =
        steerInput *
        steerStrength *
        (handbrake > 0 ? 1.5 : 1.0) *
        (nextSpeed / vehicleLength) *
        dt;

      carRoot.rotateOnWorldAxis(WORLD_UP, yawDelta);

      const forward = new THREE.Vector3(0, 0, -1)
        .applyQuaternion(carRoot.quaternion)
        .setY(0);

      if (forward.lengthSq() > 1e-6) {
        forward.normalize();
        carRoot.position.addScaledVector(forward, nextSpeed * dt);
      }

      state.steerVisual = THREE.MathUtils.lerp(
        state.steerVisual,
        steerInput,
        tractionLerp,
      );
      syncRideHeight(carRoot, rideHeight, spawnLift);
      updateWheelVisuals(carRoot, state.speed, state.steerVisual, dt);

      const resetPressed = Boolean(input?.resetPressed);

      if ((resetPressed && !state.previousResetPressed) || carRoot.position.y < -20) {
        resetVehicle(carRoot, spawnPosition, spawnQuaternion, state, spawnLift);
      }

      state.previousResetPressed = resetPressed;
    },
    speedKph() {
      return THREE.MathUtils.clamp(
        Math.abs(state.speed) * 3.6,
        0,
        MAX_FORWARD_SPEED * 3.6,
      );
    },
  };
}

function updateWheelVisuals(carRoot, speed, steerInput, deltaSeconds) {
  const wheelSpin = (speed / 0.34) * deltaSeconds;
  const steerAngle = THREE.MathUtils.degToRad(24) * steerInput;
  const frontNames = ["placeholder_tire_fl_tire", "placeholder_tire_fr_tire"];
  const rearNames = ["placeholder_tire_rl_tire", "placeholder_tire_rr_tire"];

  for (const wheelName of frontNames) {
    const wheel = carRoot.getObjectByName(wheelName);

    if (!wheel) {
      continue;
    }

    wheel.rotation.y = steerAngle;
    wheel.rotateX(wheelSpin);
  }

  for (const wheelName of rearNames) {
    const wheel = carRoot.getObjectByName(wheelName);

    if (!wheel) {
      continue;
    }

    wheel.rotateX(wheelSpin);
  }
}

function syncRideHeight(carRoot, rideHeight, spawnLift) {
  carRoot.position.y = Math.max(carRoot.position.y, rideHeight, spawnLift);
}

function resetVehicle(carRoot, spawnPosition, spawnQuaternion, state, spawnLift) {
  carRoot.position.copy(spawnPosition);
  carRoot.quaternion.copy(spawnQuaternion);
  carRoot.position.y = Math.max(carRoot.position.y, spawnLift);
  state.speed = 0;
  state.steerVisual = 0;
}

async function loadBodyConfig(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load body config: ${response.status}`);
  }

  return parseBodyConfig(await response.text());
}

function parseBodyConfig(text) {
  return {
    collisionFullMin:
      parseIniVector(text, "CollisionFullMin") ??
      DEFAULT_BODY_CONFIG.collisionFullMin.clone(),
    collisionFullMax:
      parseIniVector(text, "CollisionFullMax") ??
      DEFAULT_BODY_CONFIG.collisionFullMax.clone(),
    collisionBottomMin:
      parseIniVector(text, "CollisionBottomMin") ??
      DEFAULT_BODY_CONFIG.collisionBottomMin.clone(),
    collisionBottomMax:
      parseIniVector(text, "CollisionBottomMax") ??
      DEFAULT_BODY_CONFIG.collisionBottomMax.clone(),
  };
}

function parseIniVector(text, key) {
  const match = text.match(new RegExp(`${key}\\s*=\\s*\\{\\s*([^}]+)\\}`));

  if (!match) {
    return null;
  }

  const values = match[1]
    .split(",")
    .map((value) => Number.parseFloat(value.trim()))
    .filter((value) => Number.isFinite(value));

  if (values.length !== 3) {
    return null;
  }

  return new THREE.Vector3(values[0], values[1], values[2]);
}
