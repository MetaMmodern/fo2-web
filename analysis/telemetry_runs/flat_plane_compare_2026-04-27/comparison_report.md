# Flat Plane Telemetry Comparison

## Inputs And Sampling

- Original run: `489` samples over `48.8s`, roughly 100 ms sampling.
- Web run: `2373` samples over `39.53s`, per rendered frame.
- Original left steering/yaw is negative in this run; web left steering/yaw is positive, so steering/yaw comparisons below use absolute values.
- Original run includes an initial brake/reverse blip and a brief accidental reverse during the braking step.
- Copied web run logs `camera_fov` in degrees; future web CSVs were patched to log radians in `camera_fov` and degrees in `web_camera_fov_degrees`.

## Headline Metrics

| Metric | Original | Web | Read |
| --- | ---: | ---: | --- |
| Max planar speed | `23.91 m/s` | `18.83 m/s` | Web is about `21%` slower at peak. |
| P95 planar speed | `21.28 m/s` | `17.38 m/s` | Web is about `18%` slower in high-speed sections. |
| Max yaw rate abs | `2.07 rad/s` | `2.45 rad/s` | Web can spike higher. |
| P95 yaw rate abs | `1.11 rad/s` | `0.94 rad/s` | Web usually yaws slightly less, except spikes. |
| Avg throttle command | `0.268` | `0.356` | Web run spent proportionally more time on throttle. |
| Avg brake command | `0.085` | `0.016` | Original includes extra brake/reverse blip and stronger braking window. |
| Avg handbrake command | `0.052` | `0.047` | Similar. |
| Avg abs steer command | `0.098` | `0.127` | Web run held steering proportionally longer. |

## Segment Comparison

| Segment | Original | Web | Read |
| --- | --- | --- | --- |
| First full throttle | `4.3s`, `0 -> 22.44 m/s` | `5.45s`, `0.01 -> 18.81 m/s` | Web acceleration/top-end is noticeably weaker. |
| Second full throttle | `3.5s`, `0 -> 19.18 m/s` | `3.88s`, `0 -> 17.17 m/s` | Web still slower, but closer. |
| Third full throttle | `4.6s`, `0 -> 23.63 m/s` | `4.2s`, `0 -> 17.33 m/s` | Web loses the most here, likely due pre-slide/steer context or lower drive/top speed. |
| Brake | `1.1s`, `19.22 -> 5.06 m/s` | `0.63s`, `6.95 -> 1.65 m/s` | Not directly comparable because web started braking much slower. Need a controlled brake-only retest or normalize by speed. |
| Hard steer, no handbrake | `3.0s`, `18.45 -> 5.47 m/s`, avg yaw `0.969` | `3.05s`, `16.24 -> 0 m/s`, avg yaw `0.850` | Web bleeds speed too aggressively during steering. |
| Hard steer + handbrake | `2.1s`, `19.84 -> 0.33 m/s`, avg yaw `1.137` | `1.83s`, `16.37 -> 0.01 m/s`, avg yaw `0.604` | Web handbrake slide stops too quickly and rotates less on average. |
| Camera cycle | Original camera mode logging was active almost the full run | Web camera cycle was `3.9s` stationary | Need a camera-specific comparison pass if camera tuning is next. |

## Body And Slip Signals

- Original body roll during hard steer is large: avg roll `3.83deg` without handbrake, `7.86deg` with handbrake.
- Web body roll is almost absent: avg roll around `0.01-0.02deg` in the same phases.
- Original pitch during braking/steering is visible: brake avg pitch `2.0deg`, handbrake steer avg pitch `1.75deg`.
- Web pitch is nearly absent: `0.01-0.03deg`.
- Web slip telemetry is populated and useful: hard steer avg lateral slip around `0.151`, handbrake steer around `0.136`.
- Original slip candidates are not equivalent to web slip fields yet, so slip comparison should use behavior proxies: speed bleed, yaw rate, roll/pitch, and path curvature.

## Tuning Implications

1. Increase web straight-line acceleration/top speed or reduce high-speed drag/rolling losses.
2. Reduce speed bleed during hard steering and handbrake slides.
3. Increase sustained handbrake yaw authority; web has a high peak yaw spike but lower average yaw.
4. Add or strengthen chassis roll/pitch dynamics. This is the biggest visible missing “feel” signal from this comparison.
5. Keep using wheel spin and web slip fields for web-internal tuning, but compare against original through motion outcomes until original tire slip is confirmed.

## First Tuning Follow-Up

- New web run copied as `web_port_after_tune_flat_plane.csv`.
- Straight-line max speed improved from `18.83 m/s` to `19.47 m/s`, still below original `23.91 m/s`.
- Handbrake average yaw improved from `0.604 rad/s` to `1.006 rad/s`, closer to original `1.137 rad/s`.
- A regression appeared: straight full-throttle on flat ground developed right/body roll up to about `-2deg`, while original straight throttle stays essentially flat around `-0.003deg`.
- The roll bug was patched by gating roll torque so tiny lateral numerical noise cannot accumulate lean unless there is real steering, lateral speed, or lateral acceleration.

## Instability Follow-Up

- New unstable web run copied as `web_port_instability_latest.csv`.
- The failure happens on flat-road straight throttle with no steering or handbrake:
  - wheel contacts start dropping at about `1.88s`
  - pitch crosses about `-2.96deg` while speed is only `2.34 m/s`
  - roll crosses `-10deg` by about `3.33s`
  - roll later reaches approximately `±180deg`
- This points to a self-excited chassis/suspension loop rather than driver input.
- The emergency ground-clearance clamp was too aggressive: it used the full rotated chassis vertical extent, so small pitch/roll forced the chassis upward, unloaded the wheel rays, and amplified pogo/rollover behavior.
- The clamp has been reduced to an emergency center-height rescue only; it no longer tries to keep the full rotated box above ground.

## Clearance Fix Follow-Up

- New web run copied as `web_port_after_clearance_fix.csv`.
- Rollover/pogo is fixed in this run: wheel contacts remain `4` throughout the straight acceleration segment.
- Straight-line speed improved to about `21.1 m/s`, closer to original `22.4-23.6 m/s` straight-throttle segments but still low.
- A smaller straight-line roll drift remains: roll steadily reaches about `-3deg` by `10s` on flat ground with zero steering and zero yaw.
- Suspension/load telemetry shows the left wheels unloading as speed rises while the right wheels stay loaded, despite symmetric source data.
- A straight-line-only roll stabilizer was tried and rejected.

## Rejected Straight-Line Stabilizer

- New failed run copied as `web_port_bad_stabilizer_transition.csv`.
- The stabilizer is conceptually wrong because it splits the vehicle into mode-specific physics instead of fixing the unified chassis/wheel model.
- The CSV confirms the failure: roll reaches about `-92deg`, contacts drop to `0`, and the car tumbles even with near-zero logged steering.
- The stabilizer has been removed from `physicsRapier.js`.
- The remaining issue should be fixed at the source of the left/right load asymmetry or raycast-vehicle setup, not by conditional roll correction.

## Chassis Collision Follow-Up

- The rendered car root was subtracting `bodyOffset` in world axes instead of rotated local axes. When the chassis rolled or inverted, the visual body could be pushed through the floor even if the physics body was not in the same place. `syncCarRootFromBody` now rotates the local visual offset by the chassis quaternion.
- The previous Rapier setup also allowed the full main chassis box to collide with the static track while the raycast vehicle controller was independently supporting the chassis through suspension rays. This can create fake flat-ground side loading and roll drift because the floor contact solver and suspension solver fight each other.
- The main chassis box now collides with props only. Static track/body recovery is handled by a separate crash shell around roof, sides, and bumpers, so wheels/suspension support normal driving while the body can still catch the world when overturned or in a side/roof impact.
- This should be validated with both `car_1` and `car_10`: straight full throttle on flat ground should keep roll near zero and wheel contacts at `4`; if overturned, the visible body should rest on the track instead of sinking below it.

## Rigid-Body Frame Follow-Up

- The remaining roof-sinking and easy rollover pointed to a coordinate-frame mismatch, not only missing colliders.
- `visualRideHeight` must remain a world-up ride-height compensation so tires, not the body shell, define the upright resting height. The incorrect part was mixing that compensation with unrotated body offsets. Wheel anchors keep the ride-height compensation; rendering now subtracts rotated `bodyOffset` and then applies ride height in world Y.
- The DB `CenterOfMass` values are authored in car/model local coordinates, not in the Rapier rigid-body frame. For example, `car_10` has `CenterOfMass = {0, 0.05, 0.15}` while its `CollisionFull` center is about `y=0.67`. The COM is now converted into body-local coordinates by subtracting `bodyOffset` before passing it to Rapier mass properties.
- This should materially improve rollover resistance because car COM is now below the collision center as authored, instead of being treated as only slightly below/near the rigid-body origin.

## Contact Alignment Follow-Up

- New run copied as `web_port_contact_fixed_right_tilt.csv`.
- Tire rendering now follows Rapier wheel contact data (`wheelContactPoint + wheelContactNormal * tireRadius`) instead of guessed mesh compression, which fixed the visible half-sunk tire issue.
- The same CSV shows the physical suspension is still wrong: at idle, `wheelSuspensionLength` candidates are negative (`~ -0.128m` front, `~ -0.043m` rear), so the vehicle starts over-compressed and bouncy before it accelerates.
- Right-roll starts with no steering: roll crosses `-1deg` around `2.39s`, `-5deg` around `3.01s`, and `-10deg` around `5.16s`, all with `steer=0`, `throttle=1`, and `4` wheel contacts.
- Left wheels unload while right wheels remain highly loaded; by about `6.0s`, left loads are nearly zero while right loads are around `4800-5400`.
- Rapier suspension rest length had incorrectly used `RestLength - DefaultCompression`. This made the spring too short. Rapier now receives FO2 `RestLength` directly; `DefaultCompression` remains available only as a nominal/visual loaded-pose value.
- Follow-up HUD isolation showed the right-roll failure is tied to the `Aero drag` toggle. In code that toggle also gated rolling resistance, so rolling resistance has been temporarily removed from the centered chassis-force path. It should later be reintroduced per-wheel rather than as a single chassis force.
- Wheel visuals briefly followed Rapier contact points in full XYZ, which fixed tire-ground alignment but made tires drift rearward with the moving contact patch. Visual wheel X/Z are now kept on the authored axle; only visual Y follows contact height.

## Headless Tilt Repro Harness

- Added `npm run physics:tilt` / `node tools/rapier-tilt-repro.mjs`.
- The harness imports the same `createDrivingSimulation` implementation through temporary `.mjs` copies, creates a synthetic flat webtest plane, builds minimal car wheel placeholders from `CollisionFull` and tire DB values, runs full-throttle straight-line scenarios, and reports max roll, wheel-contact count, and left/right suspension load bias.
- It runs isolation variants (`all_on`, `aero_off`, `lateral_off`, `downforce_off`, `drive_off`) so tilt regressions can be reproduced before asking for a manual browser test.
- Harness execution in Codex shell requires prepending Node path:
  - `$env:PATH = "C:\Users\just me\AppData\Roaming\fnm\aliases\default;$env:PATH"`

## Aero Path Fix Follow-Up (Headless Verified)

- Harness is now executable by prepending Node path in shell:
  - `$env:PATH = "C:\Users\just me\AppData\Roaming\fnm\aliases\default;$env:PATH"; node tools/rapier-tilt-repro.mjs`
- Confirmed culprit: chassis-applied longitudinal aero/rolling drag path was the source of flat-road right-roll instability in raycast vehicle mode.
- Fix applied in `physicsRapier.js`:
  - removed longitudinal drag from central chassis force path (lateral drag remains lateral-only),
  - replaced longitudinal aero speed limiting with symmetric driven-wheel taper (`computeDriveAeroLimitScale`) applied inside drivetrain force calculation.
- 8-second harness results after fix:
  - `car_1`: all scenarios pass tilt criteria; `all_on` max roll `0.113deg`, max speed `23.79 m/s`.
  - `car_10`: all scenarios pass tilt criteria; `all_on` max roll `1.35deg`, max speed `24.35 m/s`.
- 20-second stress run:
  - `all_on` remains stable for both cars.
  - `aero_off` can fail late at very high speeds (`~49-51 m/s`) due to contact drop, expected because top-speed limiting is intentionally disabled in that isolation mode.

## Gear Regression Follow-Up

- A regression was introduced by an overly aggressive drivetrain aero taper (`DRIVE_AERO_LIMIT_KPH=92` with force dropping to zero near the limit), which could hold gameplay around second gear.
- Taper retuned:
  - `DRIVE_AERO_LIMIT_KPH` increased to `220`.
  - New late-start smooth taper with floor (`1.0 -> 0.35`) instead of hard drop to zero.
- Harness long-run false failures were due to cars exiting the synthetic `1000x1000` plane at high speed, not a physics rollover. Plane size in `tools/rapier-tilt-repro.mjs` was increased to `6000x6000` for stress checks.
- Updated 20-second headless run after retune:
  - `car_1`: `all_on` pass, max speed `52.06 m/s`, max roll `0.113deg`.
  - `car_10`: `all_on` pass, max speed `53.38 m/s`, max roll `1.35deg`.
- Result: right-tilt instability remains fixed in the harness, and the speed/gear clamp regression is removed.

## Drift/Twitch Metric Loop

- Added a dedicated comparison script: `tools/telemetry-drift-twitch-report.mjs`.
- Purpose: quantify the two remaining feel mismatches in one pass:
  - handbrake drift behavior,
  - high-speed steering twitch.
- Initial run on baseline pair (`original_flat_plane.csv` vs `web_port_flat_plane.csv`) reports:
  - handbrake yaw-rate average is higher in web (`+79.6%`) and deceleration is much stronger (`+110.9%`), indicating handbrake phase is too grabby.
  - high-speed yaw jerk p95 is higher in web (`+46.6%`), matching the observed twitch.
  - steer-state lag proxy is also higher in web (`+173.8%`), suggesting steering filter/limit interaction needs tuning with speed.
- Workflow going forward:
  - run one controlled original+web capture,
  - run `node tools/telemetry-drift-twitch-report.mjs --original=... --web=...`,
  - tune only the subsystem targeted by the highest mismatch metric.

## Autonomous Headless Tuning Loop

- Added deterministic web capture generator: `tools/telemetry-headless-run.mjs`.
- It outputs web CSV from current physics without manual driving, so tuning can iterate against the stored original CSV in-repo.
- Current autonomous pair:
  - original: `original_flat_plane.csv`
  - web: `web_headless_car_1_current.csv`
- Initial headless compare showed:
  - high-speed twitch proxy too high (`yaw_jerk_abs_p95` about `+48%`),
  - handbrake yaw too aggressive (`yaw_rate_abs_avg` about `+67%`).
- Applied tuning:
  - reduced lateral drag tuning scale (`0.95 -> 0.82`),
  - increased rear lateral grip under handbrake (`0.28 -> 0.38` floor),
  - reduced high-speed wheel angle floor (`0.34 -> 0.30`),
  - increased high-speed steering entry/filter rates slightly to avoid excessive lag.
- Comparator fix:
  - `yaw_jerk_abs_p95` is now computed only on high-speed steering rows, not entire run, so handbrake/brake transitions no longer pollute twitch metric.
- Final retained pass (`web_headless_car_1_tune2.csv`):
- Retained tuning state (`web_headless_car_1_retained.csv`):
  - handbrake yaw gap: `+35.4%` (improved),
  - handbrake decel gap: `-8.3%` (slightly soft versus original but still close enough for continued subsystem tuning),
  - high-speed yaw-rate avg gap: `+7.3%`,
  - high-speed yaw-jerk p95 gap: `-5.2%` (at/better than original in this scenario),
  - steer-state lag gap: `+34.5%` (still an open tuning item).
- Rejected micro-pass:
  - `web_headless_car_1_tune4.csv` increased handbrake decel but regressed twitch metrics, so it was discarded.
- Tilt regression check remained green after this tuning (`rapier-tilt-repro` all pass for `car_1` and `car_10`).

## Tire Slip Targeting (New)

- Comparator now includes tire-slip-oriented metrics that are available in both logs:
  - kinematic slip angle proxy (`slip_angle_deg_avg`) derived from velocity projected onto vehicle forward/right axes,
  - wheel spin proxy comparison (`wheel_*_load_or_spin_candidate` in original vs `web_wheel_*_angular_velocity` in web),
  - wheel grip proxy comparison (`wheel_*_tire_force_multiplier_candidate` in original vs `web_wheel_*_forward_impulse` in web).
- New headless outputs for this pass:
  - `web_headless_car_1_slip1.csv` (baseline with new slip metrics),
  - `web_headless_car_1_slip2.csv` / `web_headless_car_1_slip3.csv` (tuning iterations),
  - reports: `headless_compare_car1_slip1.md`, `headless_compare_car1_slip2.md`, `headless_compare_car1_slip3.md`.
- Retained `slip3` direction:
  - handbrake yaw gap improved to about `+30%` (from `+36%` in this new slip loop baseline),
  - handbrake decel gap improved to about `-3.7%` (closer to original),
  - high-speed yaw jerk gap reduced to about `+7.6%` (from `+22%` baseline in this loop).
- Open tire-slip gap:
  - handbrake/high-speed kinematic slip angle in web remains much lower than original (roughly `-55%` to `-78%`), meaning web still rotates more than it translates sideways during drift.
  - next pass should focus on increasing translational side-slip under sustained drift while avoiding renewed rollover/twitch regressions.

## Reverse-To-Forward And Launch Slip Pass

- Player-reported issue confirmed: reverse -> immediate throttle-forward behavior was not native-feel.
- Root cause in web state machine:
  - forward request after reverse could remain in neutral-style gating until low-speed launch conditions were satisfied, delaying forward bite.
- Fix in `src/game/physicsRapier.js`:
  - force first-gear engagement when forward throttle is requested out of reverse/neutral,
  - apply clutch slip scaling as a function of reverse speed so the transition produces counter-slip then catch.
- Launch/drift shaping update in same pass:
  - reduced low-speed donut lateral-loss influence for non-RWD setups to avoid “ironing” sideways starts,
  - strengthened driven-wheel low-speed longitudinal slip phase and added reverse-to-forward traction drop blend.
- Regression checks:
  - `tools/rapier-tilt-repro.mjs` all pass for `car_1` and `car_10`.
- New manual captures imported:
  - `web_port_manual_car1_2026-04-27T205311521Z.csv`
  - `web_port_manual_car10_2026-04-27T205407682Z.csv`
- Manual compare reports generated:
  - `manual_compare_car1_2026-04-27T205311521Z.md`
  - `manual_compare_car10_2026-04-27T205407682Z.md`
