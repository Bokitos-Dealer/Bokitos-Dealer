--!strict
-- Rides the player's bike. The server gives the bike to this client (network
-- ownership); every frame we run the bike physics, follow the ground with
-- raycasts, slide along walls, and move the bike's rigid align targets.

local ContextActionService = game:GetService("ContextActionService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local BikePhysics = require(Shared.BikePhysics)
local BikeModel = require(Shared.BikeModel)
local State = require(script.Parent.State)
local Sfx = require(script.Parent.Sfx)

local M = Config.M
local GRAVITY = 9.81 * M * 2 -- studs/s^2 (a bit stronger than real, feels snappier)
local STEP_UP = 1.6 -- highest kerb (studs) you can ride up
local SPHERE_R = 1.1
local SPHERE_Y = 2.4

local player = State.player

local BikeController = {}
BikeController.splashed = Instance.new("BindableEvent")
BikeController.bumped = Instance.new("BindableEvent")

-- the ride ---------------------------------------------------------------------
local model: Model? = nil
local root: BasePart? = nil
local alignPos: AlignPosition? = nil
local alignRot: AlignOrientation? = nil
local params: BikePhysics.Params = { topSpeed = 7.5, power = 1, handling = 1, wheel = 0.35 }
local state = BikePhysics.newState()
local pos = Vector3.zero -- ground point under the bike
local yaw = 0
local pitch = 0
local vy = 0
local holdUntil = 0 -- wait for the ground to stream in until this time
local splashing = false
local safe: { { pos: Vector3, yaw: number } } = {}
local lastSafe = 0

-- input
local boostKey = false
local triggerGas = 0
local triggerBrake = 0
local lastBell = 0

local controls: any = nil
local function getControls(): any
	if controls then
		return controls
	end
	local ok, result = pcall(function()
		local ps = player:WaitForChild("PlayerScripts")
		local pm = require(ps:WaitForChild("PlayerModule") :: ModuleScript) :: any
		return pm:GetControls()
	end)
	if ok then
		controls = result
	end
	return controls
end

-- raycasts ignore bikes, characters and the city traffic
local groundParams = RaycastParams.new()
groundParams.FilterType = Enum.RaycastFilterType.Exclude
groundParams.IgnoreWater = false
local wallParams = RaycastParams.new()
wallParams.FilterType = Enum.RaycastFilterType.Exclude
wallParams.IgnoreWater = true

local function refreshFilter()
	local list: { Instance } = {}
	for _, name in { "Bikes", "Traffic", "LocalEffects" } do
		local f = Workspace:FindFirstChild(name)
		if f then
			table.insert(list, f)
		end
	end
	for _, p in Players:GetPlayers() do
		if p.Character then
			table.insert(list, p.Character)
		end
	end
	groundParams.FilterDescendantsInstances = list
	wallParams.FilterDescendantsInstances = list
end

local function groundAt(p: Vector3, fromY: number): RaycastResult?
	return Workspace:Raycast(Vector3.new(p.X, fromY, p.Z), Vector3.new(0, -80, 0), groundParams)
end

local function isWater(hit: RaycastResult?): boolean
	return hit ~= nil and hit.Material == Enum.Material.Water
end

local function bikeDef(id: any): Config.BikeDef
	for _, b in Config.Bikes do
		if b.id == id then
			return b
		end
	end
	return Config.Bikes[1]
end

local function poseCFrame(): CFrame
	return CFrame.new(pos + Vector3.new(0, BikeModel.RootHeight, 0))
		* CFrame.Angles(0, yaw, 0)
		* CFrame.Angles(pitch, 0, 0)
		* CFrame.Angles(0, 0, -state.lean)
end

--- Put the bike somewhere (a city spawn, or back on the road after a splash).
function BikeController.teleport(p: Vector3, newYaw: number, keepSafe: boolean?)
	pos = p
	yaw = newYaw
	pitch = 0
	vy = 0
	state.speed = 0
	state.lean = 0
	state.steer = 0
	holdUntil = os.clock() + 8
	if not keepSafe then
		table.clear(safe)
	end
	local r = root
	if r then
		local cf = poseCFrame()
		r.CFrame = cf -- moves the whole bike and the rider with it
		r.AssemblyLinearVelocity = Vector3.zero
		r.AssemblyAngularVelocity = Vector3.zero
		if alignPos then
			alignPos.Position = cf.Position
		end
		if alignRot then
			alignRot.CFrame = cf
		end
	end
end

--- Back to the last safe spot on the road (also used by the "I'm stuck" button).
function BikeController.unstuck()
	local s = safe[math.max(1, #safe - 4)]
	if s then
		BikeController.teleport(s.pos, s.yaw, true)
	end
end

local function splash(waterY: number)
	if splashing then
		return
	end
	splashing = true
	state.speed = 0
	local r = root
	Sfx.play("Splash", r, 0.9)
	BikeController.splashed:Fire(Vector3.new(pos.X, waterY, pos.Z))
	task.delay(1.2, function()
		splashing = false
		if not model then
			return
		end
		local s = safe[math.max(1, #safe - 4)]
		if s then
			BikeController.teleport(s.pos, s.yaw, true)
		else
			BikeController.teleport(pos + Vector3.new(0, 20, 0), yaw, true)
		end
	end)
end

-- the physics step ----------------------------------------------------------------
local function step(dt: number)
	local r, ap, ao = root, alignPos, alignRot
	if not model or not r or not ap or not ao then
		return
	end
	if splashing then
		-- sink slowly while the splash plays
		pos -= Vector3.new(0, 4 * dt, 0)
		local cf = poseCFrame()
		ap.Position = cf.Position
		ao.CFrame = cf
		return
	end
	dt = math.min(dt, 1 / 20)

	-- input: the default controls give us the thumbstick / WASD / gamepad stick
	local mv = Vector3.zero
	local c = controls -- loaded in init(), never waited for here
	if c then
		local ok, v = pcall(function()
			return c:GetMoveVector()
		end)
		if ok and typeof(v) == "Vector3" then
			mv = v
		end
	end
	local throttle = math.max(math.clamp(-mv.Z, 0, 1), triggerGas)
	local brake = math.max(math.clamp(mv.Z, 0, 1), triggerBrake)
	local steer = math.clamp(mv.X, -1, 1)
	if UserInputService:GetFocusedTextBox() then
		throttle, brake, steer = 0, 0, 0
	end
	local boost = boostKey or State.touchBoost

	-- what are we riding on?
	local fwd = Vector3.new(-math.sin(yaw), 0, -math.cos(yaw))
	local here = groundAt(pos, pos.Y + 1.8)
	local onGround = here ~= nil and not isWater(here) and pos.Y - here.Position.Y < 0.35
	local crr = 0.008
	local slope = 0
	if here and onGround then
		crr = BikePhysics.Surfaces[here.Material.Name] or 0.008
		local f = groundAt(pos + fwd * 1.6, pos.Y + 1.8)
		local b = groundAt(pos - fwd * 1.6, pos.Y + 1.8)
		if f and b and not isWater(f) and not isWater(b) then
			slope = math.clamp((f.Position.Y - b.Position.Y) / 3.2, -0.35, 0.35)
		end
	end
	BikePhysics.step(state, params, {
		throttle = if onGround then throttle else 0,
		brake = brake,
		steer = steer,
		boost = boost,
	}, {
		crr = if onGround then crr else 0,
		slope = if onGround then slope else 0,
		grip = if State.rain then 0.75 else 1,
	}, 0, dt)
	yaw += state.yawRate * dt
	fwd = Vector3.new(-math.sin(yaw), 0, -math.cos(yaw))

	-- move, sliding along walls
	local d = fwd * state.speed * M * dt
	local move = d
	if d.Magnitude > 1e-4 then
		local center = pos + Vector3.new(0, SPHERE_Y, 0)
		local hit = Workspace:Spherecast(center, SPHERE_R, d, wallParams)
		if hit and hit.Normal.Y < 0.55 then
			local n = Vector3.new(hit.Normal.X, 0, hit.Normal.Z)
			if n.Magnitude > 1e-3 then
				n = n.Unit
				local dir = d.Unit
				move = dir * math.max(0, hit.Distance - 0.05)
				local rest = d - move
				local slide = rest - n * rest:Dot(n)
				if slide.Magnitude > 1e-4 and not Workspace:Spherecast(center + move, SPHERE_R, slide, wallParams) then
					move += slide
				end
				local into = -dir:Dot(n) -- 1 = straight into the wall
				if into > 0.2 then
					local before = math.abs(state.speed)
					state.speed *= math.clamp(1.15 - into, 0, 1)
					if into > 0.6 and before > 3 then
						Sfx.play("Bump", r, 0.5)
						BikeController.bumped:Fire(before)
					end
				end
			end
		end
	end

	-- follow the ground
	local newPos = pos + move
	local y = pos.Y
	local g = groundAt(newPos, pos.Y + 1.8)
	if g then
		local gy = g.Position.Y
		if isWater(g) then
			vy -= GRAVITY * dt
			y += vy * dt
			if y < gy - 1.5 then
				pos = Vector3.new(newPos.X, y, newPos.Z)
				splash(gy)
				return
			end
		elseif gy > y + STEP_UP then
			-- too high to ride onto: treat it like a wall
			newPos = pos
			state.speed = 0
		elseif gy >= y - 0.05 then
			y = if gy - y > 0.25 then y + (gy - y) * math.min(1, dt * 18) else gy
			vy = 0
			holdUntil = 0
		elseif vy >= -2 and y - gy < 0.15 + math.abs(state.speed) * M * dt * 0.7 then
			-- riding down a slope: stay on it
			y = gy
			vy = 0
		else
			vy -= GRAVITY * dt
			y = math.max(gy, y + vy * dt)
			if y <= gy + 1e-3 then
				vy = 0
			end
		end
		pitch += (math.atan(slope) - pitch) * math.min(1, dt * 10)
	elseif os.clock() > holdUntil then
		-- nothing below at all
		vy -= GRAVITY * dt
		y += vy * dt
		if y < -150 then
			BikeController.unstuck()
			return
		end
	end
	pos = Vector3.new(newPos.X, y, newPos.Z)

	-- remember safe spots to come back to after a splash
	if onGround and os.clock() - lastSafe > 0.4 then
		lastSafe = os.clock()
		table.insert(safe, { pos = pos, yaw = yaw })
		if #safe > 15 then
			table.remove(safe, 1)
		end
	end

	local cf = poseCFrame()
	ap.Position = cf.Position
	ao.CFrame = cf

	local ride = State.ride
	ride.speed = state.speed
	ride.stamina = state.stamina
	ride.steer = state.steer
	ride.lean = state.lean
	ride.crank = state.crank
	ride.wheel = state.wheel
	ride.boosting = boost and state.stamina > 0.02 and throttle > 0
	ride.pos = pos
	ride.yaw = yaw
end

-- actions while riding ------------------------------------------------------------------
local function ringBell()
	if os.clock() - lastBell < 0.35 then
		return
	end
	lastBell = os.clock()
	local m = model
	local bell = m and m:FindFirstChild("Bell", true) :: BasePart?
	Sfx.bell(bell)
	State.remote("Bell"):FireServer()
end
BikeController.ringBell = ringBell

local function onAction(name: string, inputState: Enum.UserInputState, _input: InputObject): Enum.ContextActionResult
	if name == "BikeBell" then
		if inputState == Enum.UserInputState.Begin then
			ringBell()
		end
	elseif name == "BikeBoost" then
		boostKey = inputState == Enum.UserInputState.Begin or inputState == Enum.UserInputState.Change
	elseif name == "BikeCamera" then
		if inputState == Enum.UserInputState.Begin then
			State.cameraMode = if State.cameraMode == "chase" then "first" else "chase"
		end
	end
	return Enum.ContextActionResult.Sink
end

local function setJump(enabled: boolean)
	local char = player.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	if hum then
		hum:SetStateEnabled(Enum.HumanoidStateType.Jumping, enabled)
	end
end

local function bindActions()
	local high = Enum.ContextActionPriority.High.Value + 10
	-- Space rings the bell instead of jumping off the bike
	ContextActionService:BindActionAtPriority("BikeBell", onAction, false, high, Enum.KeyCode.Space, Enum.KeyCode.B, Enum.KeyCode.ButtonY)
	ContextActionService:BindActionAtPriority("BikeBoost", onAction, false, high, Enum.KeyCode.LeftShift, Enum.KeyCode.RightShift, Enum.KeyCode.ButtonX)
	ContextActionService:BindActionAtPriority("BikeCamera", onAction, false, high, Enum.KeyCode.C, Enum.KeyCode.ButtonR3)
end

local function unbindActions()
	for _, name in { "BikeBell", "BikeBoost", "BikeCamera" } do
		ContextActionService:UnbindAction(name)
	end
	boostKey = false
end

-- attaching to the bike the server gave us -------------------------------------------
local function detach()
	model, root, alignPos, alignRot = nil, nil, nil, nil
	splashing = false
	unbindActions()
	setJump(true)
	local ride = State.ride
	ride.onBike = false
	ride.model = nil
	ride.speed = 0
	ride.boosting = false
end

local function attach(m: Model)
	local r = m:WaitForChild("Root", 10) :: BasePart?
	if not r then
		return
	end
	local ap = r:WaitForChild("DrivePosition", 10) :: AlignPosition?
	local ao = r:WaitForChild("DriveOrientation", 10) :: AlignOrientation?
	local ref = player:FindFirstChild("Bike") :: ObjectValue?
	if not ap or not ao or not ref or ref.Value ~= m then
		return
	end
	model, root, alignPos, alignRot = m, r, ap, ao
	local def = bikeDef(m:GetAttribute("BikeId"))
	params = { topSpeed = def.topSpeed, power = def.power, handling = def.handling, wheel = def.wheel }
	local keepStamina = state.stamina
	state = BikePhysics.newState()
	state.stamina = keepStamina
	local cf = r.CFrame
	pos = cf.Position - Vector3.new(0, BikeModel.RootHeight, 0)
	local lv = cf.LookVector
	yaw = math.atan2(-lv.X, -lv.Z)
	pitch, vy = 0, 0
	holdUntil = os.clock() + 4
	table.clear(safe)
	refreshFilter()
	bindActions()
	setJump(false)
	local ride = State.ride
	ride.onBike = true
	ride.model = m
	ride.pos = pos
	ride.yaw = yaw
end

function BikeController.init()
	task.spawn(getControls)
	local ref = player:WaitForChild("Bike") :: ObjectValue
	local function changed()
		local v = ref.Value
		detach()
		if v and v:IsA("Model") then
			task.spawn(attach, v)
		end
	end
	ref.Changed:Connect(changed)
	changed()

	player.CharacterAdded:Connect(function()
		if model then
			setJump(false)
		end
	end)

	-- gamepad triggers for pedalling and braking
	UserInputService.InputChanged:Connect(function(input)
		if input.KeyCode == Enum.KeyCode.ButtonR2 then
			triggerGas = input.Position.Z
		elseif input.KeyCode == Enum.KeyCode.ButtonL2 then
			triggerBrake = input.Position.Z
		end
	end)
	UserInputService.InputEnded:Connect(function(input)
		if input.KeyCode == Enum.KeyCode.ButtonR2 then
			triggerGas = 0
		elseif input.KeyCode == Enum.KeyCode.ButtonL2 then
			triggerBrake = 0
		end
	end)

	State.remote("Teleport").OnClientEvent:Connect(function(cf: CFrame)
		local lv = cf.LookVector
		BikeController.teleport(cf.Position, math.atan2(-lv.X, -lv.Z))
	end)

	RunService.PreSimulation:Connect(step)
	task.spawn(function()
		while true do
			task.wait(1)
			refreshFilter()
		end
	end)
end

return BikeController
