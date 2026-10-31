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
  },

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

  aimAssist: {
    low: { snapAngle: 0, slowdownAngle: 0.09, slowdownFactor: 0.65, magnetAngle: 0.025 },
    high: { snapAngle: 0.22, slowdownAngle: 0.14, slowdownFactor: 0.45, magnetAngle: 0.05 },
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
