// Every number that shapes how the game feels lives here, so designers can tune in one place.
// Units: metres, seconds, radians, hit points.

export const TUNING = {
  sim: {
    hz: 60,
    gravity: 22,
    maxFallSpeed: 40,
  },

  player: {
    radius: 0.32,
    height: 1.8,
    crouchHeight: 1.1,
    eyeHeight: 1.62,
    walkSpeed: 2.4,
    runSpeed: 5.6,
    sprintSpeed: 7.6,
    crouchSpeed: 2.0,
    aimMoveSpeed: 2.6,
    /** Speed multiplier for walking backwards in shooter style (keyboard and mouse). */
    backpedalScale: 0.75,
    swimSpeed: 2.6,
    walkThreshold: 0.55, // stick magnitude below this = walk
    groundAccel: 40,
    airAccel: 14,
    turnRate: 14,
    jumpVelocity: 7.4,
    coyoteTime: 0.12,
    jumpBuffer: 0.15,
    stepHeight: 0.4,
    hardLandingSpeed: 13,
    hardLandingRecovery: 0.35,
    fatalFallSpeed: 26,
    rollSpeed: 8.5,
    rollDuration: 0.55,
    rollIFrames: 0.32,
    rollCooldown: 0.2,
    slideSpeed: 9,
    slideSteer: 3.5,
  },

  climb: {
    grabReachUp: 0.35, // how far above the head a ledge can be grabbed
    grabReachDown: 0.9, // how far below hand height while falling
    grabDistance: 0.55,
    hangOffset: 0.36, // distance from wall while hanging
    handHeight: 1.92,
    shimmySpeed: 1.6,
    climbUpTime: 0.45,
    ledgeJumpUp: 2.4,
    ledgeJumpSide: 2.6,
    ledgeJumpVelocity: 6.2,
    backEjectVelocity: { h: 5.4, v: 6.2 },
    wallClimbSpeed: 1.5,
    wallJumpVelocity: { h: 6.0, v: 7.8 },
    regrabCooldown: 0.25,
    crumbleTime: 1.6,
  },

  traversal: {
    ropeGrabDistance: 1.4,
    ropePumpAccel: 7,
    ropeDamping: 0.12,
    ropeReleaseBoost: 1.15,
    grappleRange: 13,
    ziplineSpeed: 11,
    ziplineGrab: 1.6,
    beamSwayRate: 0.9,
    beamCounterRate: 2.6,
    beamFallThreshold: 1,
    crateMaxPushMass: 2,
    cratePushSpeed: 1.4,
  },

  camera: {
    distance: 4.2,
    aimDistance: 1.6,
    pivotHeight: 1.55,
    shoulderOffset: 0.62,
    aimShoulderOffset: 0.55,
    fov: 1.05,
    aimFovScale: 0.72,
    scopeFovScale: 0.32,
    minPitch: -1.25,
    maxPitch: 1.1,
    collisionRadius: 0.2,
    recenterDelay: 2.4,
    recenterSpeed: 1.6,
    lookSensitivity: 2.6, // radians per second at full stick
    touchSensitivity: 0.0065, // radians per CSS pixel
    mouseSensitivity: 0.0025,
  },

  cover: {
    snapDistance: 1.35,
    moveSpeed: 2.2,
    lowHeight: 1.2,
    peekTime: 0.12,
    blindFireSpreadScale: 3.5,
    /** Chance an enemy bullet still finds you while tucked in cover on the side facing them. */
    protectLow: 0.35,
    protectHigh: 0.2,
  },

  /** How much of a bullet's damage breakable cover takes, by material (wood splinters, stone barely chips). */
  coverDamage: { wood: 1, plaster: 0.8, foliage: 1, sand: 0.5, metal: 0.4, stone: 0.25, rock: 0.2, ground: 0.2, snow: 0.6 } as Record<string, number>,

  /** Sound through a wall: radius multiplier when a solid blocks the straight path. */
  wallMuffle: 0.4,

  /** Map edge: how far inside the boundary the "turn back" warning starts. */
  boundaryWarn: 6,

  health: {
    max: 100,
    regenDelay: 4,
    regenRate: 28,
    damageVignetteThreshold: 40,
  },

  melee: {
    range: 1.7,
    arc: 1.2,
    comboWindow: 0.6,
    hitDamage: [30, 30, 55],
    counterWindow: 0.45,
    takedownRange: 1.6,
    takedownBehindAngle: 2.0, // radians from enemy facing that counts as "behind"
    finisherWallDistance: 1.1,
  },

  stealth: {
    visionRange: 22,
    visionHalfAngle: 0.95,
    peripheralHalfAngle: 1.6,
    crouchVisibility: 0.55,
    grassVisibility: 0.0,
    suspicionRise: 1.15,
    suspicionDecay: 0.35,
    alertThreshold: 1,
    noise: { gunshot: 34, sprint: 5, land: 6, bottle: 10, explosion: 45, melee: 4 },
    tagHoldTime: 0.45,
    tagRange: 45,
  },

  grenade: {
    throwSpeed: 13,
    throwPitch: 0.42,
    fuse: 2.4,
    radius: 5,
    damage: 140,
    bounce: 0.38,
    throwBackRadius: 2.6,
  },

  /**
   * Aim assist (see sim/combat/aimAssist.ts and docs/input-feel.md). Angles are measured in "target
   * sizes": a target's size is the angle its body covers from the camera, atan(targetRadius / distance),
   * so a far-away enemy gets a small help zone and a close one a big zone. `minZone` keeps tiny
   * far targets usable.
   *  - friction: look speed is multiplied by 1 - frictionAlpha * exp(-frictionK * angle / zone).
   *  - track: share of the target's sideways motion the reticle follows while the player steers.
   *  - snap: when aim starts within snapZone, the camera eases onto the target over snapTime seconds.
   *  - magnet: near misses (outside the body, within magnetZone) bend onto the target.
   */
  aimAssist: {
    targetRadius: 0.45,
    maxRange: 60,
    /** Targets further than this from the reticle (radians) are never considered. */
    maxAngle: 0.6,
    /** Scoring weights: angle from the reticle matters most, distance breaks ties. */
    weightAngle: 1,
    weightDistance: 0.35,
    low: { zone: 3.2, minZone: 0.035, frictionAlpha: 0.4, frictionK: 1.6, track: 0.35, snapZone: 0, snapTime: 0.12, magnetZone: 1.6 },
    high: { zone: 4.5, minZone: 0.05, frictionAlpha: 0.6, frictionK: 1.2, track: 0.6, snapZone: 5, snapTime: 0.12, magnetZone: 2.4 },
  },

  /** Controller look stick shaping (see input/LookShaping.ts). */
  stick: {
    /** Stick travel past this counts as fully pushed (many sticks never quite reach 1.0). */
    outerDeadzone: 0.92,
    /** Holding the stick fully over for boostDelay seconds speeds the turn up to boostMul over boostRamp seconds. */
    boostDelay: 0.2,
    boostRamp: 0.35,
    boostMul: 1.6,
    /** Flick stick: pushing past this starts a flick; the flick takes flickTime seconds. */
    flickThreshold: 0.9,
    flickTime: 0.1,
  },

  /** Phone motion-sensor aiming (see input/Gyro.ts). Rates in radians per second. */
  gyro: {
    /** Below this rate the phone counts as still, and the drift estimate is updated. */
    stillRate: 0.035,
    /** How long the phone must be still before calibration starts trusting it (seconds). */
    calibrateAfter: 0.6,
    /** Rotation slower than this is scaled down smoothly, which hides hand tremor. */
    tightenRate: 0.04,
    /** Ignore single readings faster than this (sensor glitches). */
    maxRate: 25,
  },

  /** Touch swipe-to-look. */
  touchLook: {
    /** Finger speed (px per ms) at which swipe acceleration reaches its full effect. */
    accelSpeed: 1.5,
  },

  ai: {
    maxShootersByDifficulty: [1, 2, 3, 4],
    reactionTime: 0.55,
    searchDuration: 12,
    investigateTime: 6,
    coverRecheck: 4,
    flankChance: 0.35,
    peekInterval: [1.2, 2.6] as [number, number],
    burstLength: [2, 5] as [number, number],
  },

  /** The Ch4 jeep. Arcade handling: easy to drive with one thumb. */
  vehicle: {
    accel: 9,
    brake: 18,
    drag: 0.12,
    boostSpeed: 1.3,
    steerRate: 9,
    hp: 100,
    crashDamage: 22,
    crashSlow: 0.35,
    halfWidth: 1.0,
    halfLength: 2.1,
    height: 1.6,
    seatHeight: 1.1,
    gunnerWeave: 2.2,
  },

  pursuer: {
    fireInterval: [1.1, 2.0] as [number, number],
    hitChance: 0.35,
    damage: 7,
    catchUp: 1.8,
  },

  searchlight: {
    /** Seconds in the beam before the alarm goes off. */
    alarmTime: 1.2,
    decay: 0.6,
  },
} as const;

export type Tuning = typeof TUNING;
