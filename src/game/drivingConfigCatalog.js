const GLOBAL_DB_URLS = {
  steeringPc: new URL(
    "../data/database/flatout2.db extracted/root/Data/Physics/Car/Steering_PC.h",
    import.meta.url,
  ).toString(),
  tireDynamics: {
    tarmac: new URL(
      "../data/database/flatout2.db extracted/root/Data/Physics/TireDynamics/Tarmac.h",
      import.meta.url,
    ).toString(),
    gravel: new URL(
      "../data/database/flatout2.db extracted/root/Data/Physics/TireDynamics/Gravel.h",
      import.meta.url,
    ).toString(),
    sand: new URL(
      "../data/database/flatout2.db extracted/root/Data/Physics/TireDynamics/Sand.h",
      import.meta.url,
    ).toString(),
    hazard: new URL(
      "../data/database/flatout2.db extracted/root/Data/Physics/TireDynamics/Hazard.h",
      import.meta.url,
    ).toString(),
    forest: new URL(
      "../data/database/flatout2.db extracted/root/Data/Physics/TireDynamics/Forest.h",
      import.meta.url,
    ).toString(),
    stuntTarmac: new URL(
      "../data/database/flatout2.db extracted/root/Data/Physics/TireDynamics/StuntTarmac.h",
      import.meta.url,
    ).toString(),
    snow: new URL(
      "../data/database/flatout2.db extracted/root/Data/Physics/TireDynamics/Snow.h",
      import.meta.url,
    ).toString(),
    ice: new URL(
      "../data/database/flatout2.db extracted/root/Data/Physics/TireDynamics/Ice.h",
      import.meta.url,
    ).toString(),
    object: new URL(
      "../data/database/flatout2.db extracted/root/Data/Physics/TireDynamics/Object.h",
      import.meta.url,
    ).toString(),
  },
  differentials: {
    front: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Differential/Front.h",
      import.meta.url,
    ).toString(),
    rear: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Differential/Rear.h",
      import.meta.url,
    ).toString(),
    defaultFront: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Differential/DefaultFront.h",
      import.meta.url,
    ).toString(),
    defaultRear: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Differential/DefaultRear.h",
      import.meta.url,
    ).toString(),
  },
  throttleCurves: {
    front: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Differential/ThrottleCurves/Front.h",
      import.meta.url,
    ).toString(),
    rear: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Differential/ThrottleCurves/Rear.h",
      import.meta.url,
    ).toString(),
    default: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Differential/ThrottleCurves/Default.h",
      import.meta.url,
    ).toString(),
  },
  brakeCurves: {
    front: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Differential/BrakeCurves/Front.h",
      import.meta.url,
    ).toString(),
    rear: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Differential/BrakeCurves/Rear.h",
      import.meta.url,
    ).toString(),
    default: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Differential/BrakeCurves/Default.h",
      import.meta.url,
    ).toString(),
  },
  speedCurves: {
    front: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Differential/SpeedCurves/Front.h",
      import.meta.url,
    ).toString(),
    rear: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Differential/SpeedCurves/Rear.h",
      import.meta.url,
    ).toString(),
    default: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Differential/SpeedCurves/Default.h",
      import.meta.url,
    ).toString(),
  },
};

const CAR_DB_URLS = {
  car_1: {
    car: new URL(
      "../data/database/flatout2.db extracted/root/Data/Cars/Amateur/Car01.h",
      import.meta.url,
    ).toString(),
    body: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Body/RaceCar01.h",
      import.meta.url,
    ).toString(),
    engine: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Engine/RaceCar01.h",
      import.meta.url,
    ).toString(),
    gearbox: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Gearbox/RaceCar01.h",
      import.meta.url,
    ).toString(),
    suspension: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Suspension/RaceCar01.h",
      import.meta.url,
    ).toString(),
    tires: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Tires/RaceCar01.h",
      import.meta.url,
    ).toString(),
  },
  car_3: {
    car: new URL(
      "../data/database/flatout2.db extracted/root/Data/Cars/Amateur/Car03.h",
      import.meta.url,
    ).toString(),
    body: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Body/RaceCar03.h",
      import.meta.url,
    ).toString(),
    engine: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Engine/RaceCar03.h",
      import.meta.url,
    ).toString(),
    gearbox: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Gearbox/RaceCar03.h",
      import.meta.url,
    ).toString(),
    suspension: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Suspension/RaceCar3.h",
      import.meta.url,
    ).toString(),
    tires: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Tires/RaceCar03.h",
      import.meta.url,
    ).toString(),
  },
  car_4: {
    car: new URL(
      "../data/database/flatout2.db extracted/root/Data/Cars/Amateur/Car04.h",
      import.meta.url,
    ).toString(),
    body: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Body/RaceCar04.h",
      import.meta.url,
    ).toString(),
    engine: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Engine/RaceCar04.h",
      import.meta.url,
    ).toString(),
    gearbox: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Gearbox/RaceCar04.h",
      import.meta.url,
    ).toString(),
    suspension: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Suspension/RaceCar04.h",
      import.meta.url,
    ).toString(),
    tires: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Tires/RaceCar04.h",
      import.meta.url,
    ).toString(),
  },
  car_5: {
    car: new URL(
      "../data/database/flatout2.db extracted/root/Data/Cars/Amateur/Car05.h",
      import.meta.url,
    ).toString(),
    body: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Body/RaceCar05.h",
      import.meta.url,
    ).toString(),
    engine: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Engine/RaceCar05.h",
      import.meta.url,
    ).toString(),
    gearbox: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Gearbox/RaceCar05.h",
      import.meta.url,
    ).toString(),
    suspension: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Suspension/RaceCar05.h",
      import.meta.url,
    ).toString(),
    tires: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Tires/RaceCar05.h",
      import.meta.url,
    ).toString(),
  },
  car_7: {
    car: new URL(
      "../data/database/flatout2.db extracted/root/Data/Cars/Amateur/Car07.h",
      import.meta.url,
    ).toString(),
    body: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Body/RaceCar07.h",
      import.meta.url,
    ).toString(),
    engine: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Engine/RaceCar07.h",
      import.meta.url,
    ).toString(),
    gearbox: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Gearbox/RaceCar07.h",
      import.meta.url,
    ).toString(),
    suspension: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Suspension/RaceCar07.h",
      import.meta.url,
    ).toString(),
    tires: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Tires/RaceCar07.h",
      import.meta.url,
    ).toString(),
  },
  car_10: {
    car: new URL(
      "../data/database/flatout2.db extracted/root/Data/Cars/Amateur/Car10Bonus.h",
      import.meta.url,
    ).toString(),
    body: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Body/RaceCar10.h",
      import.meta.url,
    ).toString(),
    engine: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Engine/RaceCar10.h",
      import.meta.url,
    ).toString(),
    gearbox: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Gearbox/RaceCar10.h",
      import.meta.url,
    ).toString(),
    suspension: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Suspension/RaceCar10.h",
      import.meta.url,
    ).toString(),
    tires: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Tires/RaceCar10.h",
      import.meta.url,
    ).toString(),
  },
  car_16: {
    car: new URL(
      "../data/database/flatout2.db extracted/root/Data/Cars/Amateur/Car16.h",
      import.meta.url,
    ).toString(),
    body: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Body/RaceCar16.h",
      import.meta.url,
    ).toString(),
    engine: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Engine/RaceCar16.h",
      import.meta.url,
    ).toString(),
    gearbox: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Gearbox/RaceCar16.h",
      import.meta.url,
    ).toString(),
    suspension: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Suspension/RaceCar16.h",
      import.meta.url,
    ).toString(),
    tires: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Tires/RaceCar16.h",
      import.meta.url,
    ).toString(),
  },
  car_19: {
    car: new URL(
      "../data/database/flatout2.db extracted/root/Data/Cars/Amateur/Car19.h",
      import.meta.url,
    ).toString(),
    body: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Body/RaceCar19.h",
      import.meta.url,
    ).toString(),
    engine: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Engine/RaceCar19.h",
      import.meta.url,
    ).toString(),
    gearbox: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Gearbox/RaceCar19.h",
      import.meta.url,
    ).toString(),
    suspension: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Suspension/RaceCar19.h",
      import.meta.url,
    ).toString(),
    tires: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Tires/RaceCar19.h",
      import.meta.url,
    ).toString(),
  },
  car_24: {
    car: new URL(
      "../data/database/flatout2.db extracted/root/Data/Cars/Amateur/Car24.h",
      import.meta.url,
    ).toString(),
    body: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Body/RaceCar24.h",
      import.meta.url,
    ).toString(),
    engine: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Engine/RaceCar24.h",
      import.meta.url,
    ).toString(),
    gearbox: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Gearbox/RaceCar24.h",
      import.meta.url,
    ).toString(),
    suspension: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Suspension/RaceCar24.h",
      import.meta.url,
    ).toString(),
    tires: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Tires/RaceCar24.h",
      import.meta.url,
    ).toString(),
  },
  car_26: {
    car: new URL(
      "../data/database/flatout2.db extracted/root/Data/Cars/Amateur/Car26.h",
      import.meta.url,
    ).toString(),
    body: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Body/RaceCar26.h",
      import.meta.url,
    ).toString(),
    engine: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Engine/RaceCar26.h",
      import.meta.url,
    ).toString(),
    gearbox: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Gearbox/RaceCar26.h",
      import.meta.url,
    ).toString(),
    suspension: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Suspension/RaceCar26.h",
      import.meta.url,
    ).toString(),
    tires: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Tires/RaceCar26.h",
      import.meta.url,
    ).toString(),
  },
  car_33: {
    car: new URL(
      "../data/database/flatout2.db extracted/root/Data/Cars/Amateur/Car33.h",
      import.meta.url,
    ).toString(),
    body: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Body/RaceCar33.h",
      import.meta.url,
    ).toString(),
    engine: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Engine/RaceCar33.h",
      import.meta.url,
    ).toString(),
    gearbox: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Gearbox/RaceCar33.h",
      import.meta.url,
    ).toString(),
    suspension: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Suspension/RaceCar33.h",
      import.meta.url,
    ).toString(),
    tires: new URL(
      "../data/database/flatout2.db extracted/root/Data/Parts/Tires/RaceCar33.h",
      import.meta.url,
    ).toString(),
  },
};

export function getDrivingDbConfigByCarId(carId) {
  const carConfig = CAR_DB_URLS[carId];

  if (!carConfig) {
    return null;
  }

  return {
    ...carConfig,
    ...GLOBAL_DB_URLS,
  };
}
