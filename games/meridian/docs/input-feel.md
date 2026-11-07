# Input feel

How Meridian makes aiming and looking feel good on a phone, a controller and a mouse.
Each part starts with a plain explanation, then gives the maths, then names the code and the
numbers to tune (`src/config/tuning.ts`).

## The big idea: one game, many hands

Every device is turned into the same simple "intents" before the game sees it: *move this way*,
*turn the camera this much*, *jump was pressed*. That is the `InputFrame` (`src/input/actions.ts`).
The game never asks "was it a mouse?" except in the few places where a device really needs
different help (aim assist goes easy on mice, because a mouse is already precise).

```
mouse  ─┐
stick  ─┼─► InputManager.poll() ─► InputFrame { move, look, gyro, buttons, device }
touch  ─┤                                    │
gyro   ─┘                                    ▼
                         GameSim: aim assist ─► zoom matching ─► camera
```

The phone's motion sensor (gyro) gets its own lane, `frame.gyro`, so aim-assist friction and the
look-sensitivity slider never bend it. A physical turn should stay a physical turn.

## 1. Zoom-matched aiming

**Plain words:** when you zoom in, the world on screen gets bigger, so the same thumb movement
would whip the view much further. The game slows aiming down by exactly the right amount for the
zoom, so the same hand movement moves the picture the same amount whether you're at the hip, on the
shoulder, or in a sniper scope.

**Maths** (`zoomLookScale` in `src/sim/player/CameraRig.ts`). With vertical fields of view in radians:

- match at the crosshair (coefficient `c = 0`): `scale = tan(fovZoom / 2) / tan(fovHip / 2)`
- match a point further out: `scale = atan(c · tan(fovZoom / 2)) / atan(c · tan(fovHip / 2))`

`c` is that point as a share of half the screen height: 0 = crosshair, 1.33 = edge of a 4:3
picture, 1.78 = side edge of a 16:9 screen. It's the **Zoom sensitivity match** slider.

| View | FOV | Old flat multiplier | Matched (c = 0) |
|---|---|---|---|
| Hip | 1.05 rad | 1 | 1 |
| Shoulder aim | ×0.72 | 0.7 | 0.684 |
| Scope | ×0.32 | 0.7 (far too fast) | 0.292 |

The **Aim sensitivity** slider now multiplies on top of this (1 = matched). Settings from before
version 6 are rescaled (`old / 0.7`), so nobody's shoulder aim changes.

## 2. Aim assist (`src/sim/combat/aimAssist.ts`)

**Plain words:** thumbs are less exact than a mouse, so the game helps a little. It slows the camera
as the crosshair passes an enemy, follows them a little when they run while you are steering, and
nudges a shot that only just misses. On High it also eases onto an enemy when you start aiming. A
mouse gets no slow-down or following (that just feels muddy on a mouse). Mice only get help on
High, which players choose as an accessibility setting.

**Picking a target.** Only enemies in plain sight count (a line-of-sight ray). Each one is checked with
the dot product of the view direction `f` and the direction to the enemy `t`: `cos θ = f · t`. Anything
past `maxAngle` is ignored. Every zone is measured in **target sizes**,
`size = max(minZone, atan(radius / distance))`, so far enemies get small zones and close ones big zones.
The lowest score wins:

```
score = weightAngle · θ / size + weightDistance · distance / maxRange
```

**Friction** (the slow-down). With `x = θ / (size · zone)`, which is 0 at the enemy's centre and 1 at
the zone's edge:

```
look speed × 1 − α · (e^(−k·x) − e^(−k)) / (1 − e^(−k))      for x < 1, else × 1
```

That gives `1 − α` at the centre and rises smoothly to exactly 1 at the edge, so there's no jolt. The
old version was a hard step.

**Tracking.** Each tick, if the same enemy is picked and the player is steering (moving the look
stick, swiping, tilting or walking), the camera adds `track · (1 − x) · Δangle`, a share of how far
the enemy moved across the view since the last tick. Each tick's step is capped, and tracking never
aims for an idle player.

**Snap (High).** When aim starts within `snapZone`, the camera turns a share `dt / timeLeft` of the
remaining gap each tick. It lands on the enemy exactly when `snapTime` (0.12 s) runs out, even if the
enemy moves meanwhile.

**Magnetism.** A shot that would already hit the body is left alone (headshots stay headshots). A
near miss within `magnetZone` target sizes is bent onto the enemy.

Tune: `TUNING.aimAssist`.

## 3. Motion-sensor aiming (`src/input/Gyro.ts`)

**Plain words:** turn your phone and the camera turns with it, like looking through a window. At
sensitivity 1, turning the phone 10° turns the camera 10°. This is called the *Natural Sensitivity
Scale*.

- The phone's **rotation speed** (`devicemotion.rotationRate`, °/s) is multiplied by time and added
  straight to the camera, like mouse movement. It isn't treated like a joystick, because a joystick
  adds speed curves and a top speed.
- **Landscape both ways:** the screen's right and up directions are worked out from
  `screen.orientation.angle`, so the controls stay correct when you flip the phone over. (The old
  version used tilt angles and went backwards when the phone was flipped.)
- **Player space:** "turn left" means turning around the real world's up direction, which comes from
  gravity. `yaw = −(ω · up)`, boosted ×1.41 but never more than the turn left over after pitch is
  taken out. Holding the phone upright or tipped back both feel right.
- **Calibration:** while the phone is still for 0.6 s, its tiny resting drift is learned and taken away.
- **Tightening:** turns slower than `tightenRate` are scaled by `rate / tightenRate`, which hides hand
  tremor.
- Modes: Off / While aiming / Always. Browsers can't read the gyro inside a game controller, so this
  always uses the phone's own sensor. A phone clipped to a controller can use **Always** together with
  flick stick.

Tune: `TUNING.gyro`.

## 4. Controller look stick (`src/input/LookShaping.ts`)

- **Outer deadzone:** many sticks never reach 1.0. Anything past 0.92 counts as fully pushed, so
  the top turn speed can actually be reached.
- **Response curve** (worked out on the stick's distance from centre, so diagonals aren't slower):
  Linear `m`, Dynamic `m²` (default), Precise `m³`.
- **Turn boost:** hold the stick fully over for 0.2 s and the turn speed rises smoothly to ×1.6
  over 0.35 s. It resets the moment you ease off.
- **Flick stick** (optional): push the right stick any way and the view turns to face that way in
  0.1 s. Roll the stick around its edge to keep turning. Push down to turn around. Up and down aiming
  comes from motion aiming.

Tune: `TUNING.stick`.

## 5. Touch (`src/input/TouchControls.ts`)

- **Fixed or floating stick.** Floating appears under your thumb. Fixed always sits in the same
  spot, so your thumb can find it without looking.
- **Swipe acceleration:** `gain = 1 + accel · clamp(fingerSpeed / 1.5 px·ms⁻¹, 0, 1)`. Slow drags
  follow your finger exactly, and quick swipes turn further.
- **Aim + Fire button** (optional): aims when you touch it, fires 100 ms later (after the aim and any
  snap settle), and looks around while you drag it. It sits inward from the screen edge, so your thumb
  still has room to swipe outward.

## Tests

`tests/unit/inputFeel.test.ts` checks every formula above: the zoom ratios, the smooth friction,
target picking, mouse fairness, the eased snap, tracking gating, the gyro's 1:1 turn and orientation
flip, drift removal, stick curves, turn boost, flick stick, swipe acceleration and the settings upgrade.
