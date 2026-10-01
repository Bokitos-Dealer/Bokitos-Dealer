--!strict
-- Camera while riding: a smooth chase camera (drag or right-click to look
-- around, scroll or pinch to zoom) or a first-person view over the
-- handlebars. Press C (or the camera button) to switch.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local Workspace = game:GetService("Workspace")

local State = require(script.Parent.State)

local BikeCamera = {}

local player = State.player
local active = false
local camYaw = 0
local orbit = 0
local orbitPitch = 0
local zoom = 17
local lastLook = 0
local dragging = false
local lastPan: Vector2? = nil
local shake = 0
local hidden = false

local camParams = RaycastParams.new()
camParams.FilterType = Enum.RaycastFilterType.Exclude
camParams.IgnoreWater = true

local function angleLerp(a: number, b: number, t: number): number
	local d = (b - a + math.pi) % (2 * math.pi) - math.pi
	return a + d * t
end

local function setCharacterHidden(hide: boolean)
	if hidden == hide then
		return
	end
	hidden = hide
	local char = player.Character
	if not char then
		return
	end
	for _, d in char:GetDescendants() do
		if d:IsA("BasePart") or d:IsA("Decal") then
			d.LocalTransparencyModifier = if hide then 1 else 0
		end
	end
end

--- A little shake when you bump into something.
function BikeCamera.bump(strength: number)
	shake = math.max(shake, math.clamp(strength / 10, 0.1, 0.5))
end

local function update(dt: number)
	local camera = Workspace.CurrentCamera
	local ride = State.ride
	local m = ride.model
	local r = m and m.PrimaryPart
	if not ride.onBike or not r then
		if active then
			active = false
			setCharacterHidden(false)
			camera.CameraType = Enum.CameraType.Custom
			local char = player.Character
			local hum = char and char:FindFirstChildOfClass("Humanoid")
			if hum then
				camera.CameraSubject = hum
			end
			camera.FieldOfView = 70
		end
		return
	end
	if not active then
		active = true
		camera.CameraType = Enum.CameraType.Scriptable
		camYaw = ride.yaw
		orbit, orbitPitch = 0, 0
	end
	local ignore: { Instance } = { r }
	if m then
		table.insert(ignore, m)
	end
	if player.Character then
		table.insert(ignore, player.Character)
	end
	local traffic = Workspace:FindFirstChild("Traffic")
	if traffic then
		table.insert(ignore, traffic)
	end
	camParams.FilterDescendantsInstances = ignore

	-- swing back behind the bike when the player stops looking around
	if os.clock() - lastLook > 1.6 and not dragging then
		local k = 1 - math.exp(-3 * dt)
		orbit += (0 - orbit) * k
		orbitPitch += (0 - orbitPitch) * k
	end
	-- right thumbstick looks around
	for _, input: InputObject in UserInputService:GetGamepadState(Enum.UserInputType.Gamepad1) do
		if input.KeyCode == Enum.KeyCode.Thumbstick2 and input.Position.Magnitude > 0.2 then
			orbit -= input.Position.X * 2.5 * dt
			orbitPitch = math.clamp(orbitPitch - input.Position.Y * 1.5 * dt, -0.25, 0.9)
			lastLook = os.clock()
		end
	end

	local speed = math.abs(ride.speed)
	local shakeOffset = Vector3.zero
	if shake > 0.01 then
		shakeOffset = Vector3.new(math.random() - 0.5, math.random() - 0.5, 0) * shake
		shake *= math.exp(-8 * dt)
	end

	if State.cameraMode == "first" then
		setCharacterHidden(true)
		local cf = CFrame.new(r.Position)
			* CFrame.Angles(0, ride.yaw, 0)
			* CFrame.Angles(0, 0, -ride.lean * 0.5)
			* CFrame.new(0, 4.4, 0.7)
			* CFrame.Angles(-0.2 - orbitPitch * 0.6, orbit, 0)
		camera.CFrame = cf * CFrame.new(shakeOffset)
		camera.FieldOfView = 76 + math.min(speed, 14) * 0.7
	else
		setCharacterHidden(false)
		camYaw = angleLerp(camYaw, ride.yaw, 1 - math.exp(-4 * dt))
		local target = r.Position + Vector3.new(0, 3.4, 0)
		local yawC = camYaw + orbit
		local pitchC = 0.26 + orbitPitch
		local dist = zoom + math.min(speed, 12) * 0.25
		local camPos = target + (CFrame.Angles(0, yawC, 0) * CFrame.Angles(-pitchC, 0, 0)):VectorToWorldSpace(Vector3.new(0, 0, dist))
		local hit = Workspace:Raycast(target, camPos - target, camParams)
		if hit then
			camPos = hit.Position + (target - camPos).Unit * 0.8
		end
		camera.CFrame = CFrame.lookAt(camPos, target) * CFrame.new(shakeOffset)
		camera.FieldOfView = 70 + math.min(speed, 14) * 0.8
	end
end

function BikeCamera.init()
	UserInputService.InputBegan:Connect(function(input, processed)
		if processed then
			return
		end
		if input.UserInputType == Enum.UserInputType.MouseButton2 and State.ride.onBike then
			dragging = true
			UserInputService.MouseBehavior = Enum.MouseBehavior.LockCurrentPosition
		end
	end)
	UserInputService.InputEnded:Connect(function(input)
		if input.UserInputType == Enum.UserInputType.MouseButton2 and dragging then
			dragging = false
			lastLook = os.clock()
			UserInputService.MouseBehavior = Enum.MouseBehavior.Default
		end
	end)
	UserInputService.InputChanged:Connect(function(input: InputObject, processed: boolean)
		if not State.ride.onBike then
			return
		end
		if input.UserInputType == Enum.UserInputType.MouseMovement and dragging then
			orbit -= input.Delta.X * 0.008
			orbitPitch = math.clamp(orbitPitch + input.Delta.Y * 0.006, -0.25, 0.9)
			lastLook = os.clock()
		elseif input.UserInputType == Enum.UserInputType.MouseWheel and not processed then
			zoom = math.clamp(zoom - input.Position.Z * 2, 8, 40)
		end
	end)
	-- touch: drag on the screen to look around, pinch to zoom
	UserInputService.TouchPan:Connect(function(_touches: { Vector2 }, translation: Vector2, _velocity: Vector2, inputState: Enum.UserInputState, processed: boolean)
		if processed or not State.ride.onBike then
			lastPan = nil
			return
		end
		if inputState == Enum.UserInputState.Begin or lastPan == nil then
			lastPan = translation
			return
		end
		local last = lastPan :: Vector2
		local delta = translation - last
		lastPan = translation
		orbit -= delta.X * 0.01
		orbitPitch = math.clamp(orbitPitch + delta.Y * 0.006, -0.25, 0.9)
		lastLook = os.clock()
		if inputState == Enum.UserInputState.End then
			lastPan = nil
		end
	end)
	local pinchStart = zoom
	UserInputService.TouchPinch:Connect(function(_touches: { Vector2 }, scale: number, _velocity: number, inputState: Enum.UserInputState, processed: boolean)
		if processed or not State.ride.onBike then
			return
		end
		if inputState == Enum.UserInputState.Begin then
			pinchStart = zoom
		end
		zoom = math.clamp(pinchStart / math.max(scale, 0.1), 8, 40)
	end)
	RunService:BindToRenderStep("BikeCamera", Enum.RenderPriority.Camera.Value + 1, update)
	Players.LocalPlayer.CharacterAdded:Connect(function()
		hidden = false
	end)
end

return BikeCamera
