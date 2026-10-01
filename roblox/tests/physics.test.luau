-- Unit tests for the bike physics.
local BP = require(shared.BikePhysics)
local failures = 0
local function check(cond: boolean, msg: string)
	print((if cond then "  ok   " else "  FAIL ") .. msg)
	if not cond then
		failures += 1
	end
end
local city = { topSpeed = 7.5, power = 1.0, handling = 1.0, wheel = 0.355 }
local flat = { crr = BP.Surfaces.Asphalt, slope = 0, grip = 1 }
local function ride(params, input, ground, wind, seconds, s)
	s = s or BP.newState()
	for _ = 1, math.floor(seconds * 60) do
		BP.step(s, params, input, ground, wind, 1 / 60)
	end
	return s
end
local go = { throttle = 1, brake = 0, steer = 0, boost = false }
local s = ride(city, go, flat, 0, 4)
print(string.format("  after 4 s: %.1f km/h", s.speed * 3.6))
check(s.speed > 4, "accelerates to cycling speed within 4 s")
s = ride(city, go, flat, 0, 30)
print(string.format("  cruising: %.1f km/h", s.speed * 3.6))
check(math.abs(s.speed - 7.5) < 0.6, "cruises near the bike's top speed")
local boosted = ride(city, { throttle = 1, brake = 0, steer = 0, boost = true }, flat, 0, 5, ride(city, go, flat, 0, 30))
print(string.format("  boosted: %.1f km/h, stamina %.2f", boosted.speed * 3.6, boosted.stamina))
check(boosted.speed > s.speed + 0.5, "boost makes you faster")
check(boosted.stamina < 1, "boost uses stamina")
local headwind = ride(city, go, flat, 6, 30)
print(string.format("  into a 6 m/s headwind: %.1f km/h", headwind.speed * 3.6))
check(headwind.speed < s.speed - 1, "headwind slows you down")
local cobbles = ride(city, go, { crr = BP.Surfaces.Cobblestone, slope = 0, grip = 1 }, 0, 30)
check(cobbles.speed < s.speed, "cobblestones are slower than asphalt")
local hill = ride(city, go, { crr = BP.Surfaces.Asphalt, slope = 0.08, grip = 1 }, 0, 30)
print(string.format("  up an 8%% bridge: %.1f km/h", hill.speed * 3.6))
check(hill.speed < s.speed * 0.7, "uphill is slower")
local coast = ride(city, { throttle = 0, brake = 0, steer = 0, boost = false }, { crr = 0.005, slope = -0.06, grip = 1 }, 0, 6)
check(coast.speed > 3, "you roll down a bridge without pedalling")
local stop = ride(city, { throttle = 0, brake = 1, steer = 0, boost = false }, flat, 0, 2.5, ride(city, go, flat, 0, 30))
check(stop.speed <= 0.2, "brakes stop the bike within 2.5 s")
local back = ride(city, { throttle = 0, brake = 1, steer = 0, boost = false }, flat, 0, 2)
check(back.speed < 0, "holding the brake when stopped walks the bike backwards")
local turn = ride(city, { throttle = 1, brake = 0, steer = 1, boost = false }, flat, 0, 3)
check(turn.yawRate < 0, "steering right turns right (negative yaw rate)")
check(turn.lean > 0.05, "the bike leans into the turn")
local spin = ride(city, { throttle = 0, brake = 0, steer = -1, boost = false }, flat, 0, 0.5)
check(spin.yawRate > 0.5, "you can turn on the spot when stopped")
local racer = ride({ topSpeed = 10.5, power = 1.35, handling = 0.95, wheel = 0.34 }, go, flat, 0, 30)
check(racer.speed > s.speed + 2, "the racing bike is faster")
print(if failures == 0 then "ALL PHYSICS TESTS PASSED" else ("FAILURES: " .. failures))
