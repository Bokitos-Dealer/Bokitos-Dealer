--!strict
-- Bike physics, tuned for fun but based on real cycling forces:
-- pedal power, rolling resistance (depends on the street surface), air drag
-- (including head/tail wind), hills and brakes. Units: metres and seconds.
-- Pure Luau, so it can be unit tested outside Roblox.

local BikePhysics = {}

export type Params = {
	topSpeed: number, -- m/s on flat ground without wind or boost
	power: number, -- acceleration multiplier
	handling: number, -- steering multiplier
	wheel: number, -- wheel radius (m)
}

export type State = {
	speed: number, -- m/s, negative = walking the bike backwards
	steer: number, -- steering angle (rad)
	lean: number, -- lean angle (rad)
	stamina: number, -- 0..1 for the boost
	crank: number, -- pedal crank angle (rad)
	wheel: number, -- wheel rotation (rad)
	yawRate: number,
}

export type Input = {
	throttle: number, -- 0..1
	brake: number, -- 0..1
	steer: number, -- -1 (left) .. 1 (right)
	boost: boolean,
}

export type Ground = {
	crr: number, -- rolling resistance coefficient
	slope: number, -- rise over run along the direction of travel
	grip: number, -- 0..1
}

local MASS = 90
local G = 9.81
local BASE_POWER = 230 -- watts: a keen rider (snappy for a game)
local WHEELBASE = 1.1
local REF_CRR = 0.006

BikePhysics.Surfaces = {
	Asphalt = 0.005,
	SmoothPlastic = 0.005,
	Pavement = 0.008,
	Concrete = 0.007,
	Brick = 0.010,
	Cobblestone = 0.016,
	Granite = 0.009,
	Limestone = 0.009,
	Slate = 0.01,
	Wood = 0.009,
	WoodPlanks = 0.01,
	Marble = 0.007,
	Metal = 0.007,
	Sand = 0.03,
	Grass = 0.028,
	LeafyGrass = 0.03,
	Ground = 0.025,
	Mud = 0.045,
}

function BikePhysics.newState(): State
	return { speed = 0, steer = 0, lean = 0, stamina = 1, crank = 0, wheel = 0, yawRate = 0 }
end

--- Air-drag coefficient that makes `topSpeed` the cruising speed on flat ground.
local function dragK(p: Params): number
	local v = p.topSpeed
	local power = BASE_POWER * p.power
	return math.max(0.05, (power - REF_CRR * MASS * G * v) / (v * v * v))
end

local function approach(cur: number, target: number, rate: number, dt: number): number
	return cur + (target - cur) * (1 - math.exp(-rate * dt))
end

--- Advance the bike by dt seconds. `headwind` is the wind speed blowing
--- against you (m/s, negative = tailwind). Returns the new state (mutated).
function BikePhysics.step(s: State, p: Params, input: Input, ground: Ground, headwind: number, dt: number): State
	local boosting = input.boost and s.stamina > 0.02 and input.throttle > 0
	local power = BASE_POWER * p.power * (if boosting then 1.65 else 1)
	local v = s.speed

	-- forces along the direction of travel
	local drive = 0
	if input.throttle > 0 and v >= -0.05 then
		local maxForce = 190 * p.power * (if boosting then 1.4 else 1)
		drive = math.min(power / math.max(v, 1.2), maxForce) * input.throttle
	end
	local k = dragK(p)
	local air = v + headwind
	local fAir = k * air * math.abs(air)
	local fRoll = if math.abs(v) > 0.05 then ground.crr * MASS * G * math.sign(v) else 0
	local fGrav = MASS * G * ground.slope
	local accel = (drive - fAir - fRoll - fGrav) / MASS

	-- brakes (strong and friendly), and walking backwards when stopped
	if input.brake > 0 then
		if v > 0.15 then
			accel -= 5.5 * input.brake * (0.6 + 0.4 * ground.grip)
		elseif v > -1.2 then
			accel = -1.5 * input.brake
		else
			accel = 0
		end
	elseif v < 0 then
		accel = 3 -- stop rolling backwards when the brake is released
	end
	local newV = v + accel * dt
	if input.brake == 0 and v >= 0 and newV < 0 and fGrav <= 0 then
		newV = 0
	end
	if v < 0 and input.brake == 0 then
		newV = math.min(0, newV)
	end
	s.speed = math.clamp(newV, -1.4, 30)

	-- steering: quick at low speed, calmer at high speed
	local maxSteer = 0.65 / (1 + 0.25 * math.abs(s.speed)) * p.handling
	s.steer = approach(s.steer, input.steer * maxSteer, 9, dt)
	if math.abs(s.speed) < 0.6 then
		-- turn on the spot so it is easy to get going again
		s.yawRate = -input.steer * 1.4 * p.handling * (1 - math.abs(s.speed) / 0.6) - s.speed * math.tan(s.steer) / WHEELBASE * (math.abs(s.speed) / 0.6)
	else
		s.yawRate = -s.speed * math.tan(s.steer) / WHEELBASE
	end
	local latAcc = s.speed * -s.yawRate
	s.lean = approach(s.lean, math.clamp(math.atan(latAcc / G), -0.55, 0.55), 6, dt)

	-- stamina for the boost
	if boosting then
		s.stamina = math.max(0, s.stamina - 0.16 * dt)
	else
		s.stamina = math.min(1, s.stamina + 0.1 * dt)
	end

	-- animation
	if input.throttle > 0 and s.speed > 0.05 then
		s.crank += (s.speed / 4.3) * math.pi * 2 * dt
	end
	s.wheel += s.speed * dt / p.wheel
	return s
end

return BikePhysics
