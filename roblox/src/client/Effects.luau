--!strict
-- Local eye candy and pick-ups: street lights and glowing windows at night,
-- the sparkling Eiffel Tower, windmill sails, carousels, spinning coins
-- (and collecting them), rain, delivery markers and splashes.

local CollectionService = game:GetService("CollectionService")
local Lighting = game:GetService("Lighting")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local State = require(script.Parent.State)
local Sfx = require(script.Parent.Sfx)

local Effects = {}

local player = Players.LocalPlayer
local localFolder = Instance.new("Folder")
localFolder.Name = "LocalEffects"
localFolder.Parent = Workspace

-- Night lights ------------------------------------------------------------------------
local WINDOW_GLOW = { Color3.fromRGB(255, 214, 140), Color3.fromRGB(255, 196, 120), Color3.fromRGB(255, 230, 170) }

type Orig = { color: Color3, material: Enum.Material, transparency: number }
local orig: { [BasePart]: Orig } = {}
local pending: { BasePart } = {}

local function remember(p: BasePart): Orig
	local o = orig[p]
	if not o then
		o = { color = p.Color, material = p.Material, transparency = p.Transparency }
		orig[p] = o
	end
	return o :: Orig
end

local function applyNight(p: BasePart)
	if not p.Parent then
		return
	end
	local night = State.night
	local o = remember(p)
	if CollectionService:HasTag(p, "NightWindow") then
		if night then
			p.Material = Enum.Material.Neon
			p.Color = WINDOW_GLOW[(#p.Name + math.floor(p.Position.X)) % #WINDOW_GLOW + 1]
		else
			p.Material = o.material
			p.Color = o.color
		end
	elseif CollectionService:HasTag(p, "StreetLight") or CollectionService:HasTag(p, "BridgeBulb") then
		p.Material = if night then Enum.Material.Neon else o.material
		local light = p:FindFirstChildOfClass("PointLight")
		if light then
			light.Enabled = night
		end
	elseif CollectionService:HasTag(p, "Sparkle") then
		p.Transparency = if night then 0 else 1
	end
end

local NIGHT_TAGS = { "NightWindow", "StreetLight", "BridgeBulb", "Sparkle" }

local function queueAll()
	for _, tag in NIGHT_TAGS do
		for _, inst in CollectionService:GetTagged(tag) do
			if inst:IsA("BasePart") then
				table.insert(pending, inst)
			end
		end
	end
end

-- Moving things (sails, carousels, sparkles, beacons) --------------------------------------
local sails: { [BasePart]: Vector3 } = {} -- part -> hub position
local spinners: { [BasePart]: boolean } = {}
local sparkles: { [BasePart]: boolean } = {}
local beacons: { [BasePart]: boolean } = {}
local lights: { [BasePart]: number } = {} -- traffic light part -> 1 red, 2 amber, 3 green
local billboards: { [BasePart]: number } = {}

-- Coins -------------------------------------------------------------------------------
type Coin = { base: Vector3, id: string, phase: number }
local coins: { [BasePart]: Coin } = {}
local hiddenUntil: { [string]: number } = {}
local COIN_RESPAWN = 40

local function addCoin(inst: Instance)
	if not inst:IsA("BasePart") then
		return
	end
	local id = inst:GetAttribute("Id")
	if type(id) ~= "string" then
		return
	end
	coins[inst] = { base = inst.Position, id = id, phase = (inst.Position.X + inst.Position.Z) * 0.37 }
	local hide = hiddenUntil[id]
	inst.Transparency = if hide and hide > os.clock() then 1 else 0
end

local function collectorPos(): Vector3?
	local ride = State.ride
	if ride.onBike then
		return ride.pos + Vector3.new(0, 2.5, 0)
	end
	local char = player.Character
	local hrp = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
	return if hrp then hrp.Position else nil
end

local coinParts: { BasePart } = {}
local coinCFrames: { CFrame } = {}

local function updateCoins()
	local t = os.clock()
	local cam = Workspace.CurrentCamera.CFrame.Position
	local me = collectorPos()
	table.clear(coinParts)
	table.clear(coinCFrames)
	for part, c in coins do
		if not part.Parent then
			coins[part] = nil
			continue
		end
		local hide = hiddenUntil[c.id]
		if hide then
			if hide > t then
				continue
			end
			hiddenUntil[c.id] = nil
			part.Transparency = 0
		end
		if me and (c.base - me).Magnitude < 6 then
			hiddenUntil[c.id] = t + COIN_RESPAWN
			part.Transparency = 1
			Sfx.play("Coin", nil, 0.5, 0.95 + math.random() * 0.1)
			State.remote("CollectCoin"):FireServer(c.id)
			continue
		end
		if (c.base - cam).Magnitude < 250 then
			table.insert(coinParts, part)
			table.insert(coinCFrames, CFrame.new(c.base + Vector3.new(0, math.sin(t * 2 + c.phase) * 0.35, 0)) * CFrame.Angles(0, t * 3 + c.phase, 0))
		end
	end
	if #coinParts > 0 then
		Workspace:BulkMoveTo(coinParts, coinCFrames, Enum.BulkMoveMode.FireCFrameChanged)
	end
end

-- Rain ------------------------------------------------------------------------------------
local rainPart: Part? = nil
local rainEmitter: ParticleEmitter? = nil

local function makeRain()
	local p = Instance.new("Part")
	p.Name = "Rain"
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.Transparency = 1
	p.Size = Vector3.new(160, 1, 160)
	p.Parent = localFolder
	local e = Instance.new("ParticleEmitter")
	e.EmissionDirection = Enum.NormalId.Bottom
	e.Rate = 0
	e.Lifetime = NumberRange.new(0.9, 1.1)
	e.Speed = NumberRange.new(90, 110)
	e.Size = NumberSequence.new(0.12)
	e.Transparency = NumberSequence.new(0.35)
	e.Color = ColorSequence.new(Color3.fromRGB(190, 205, 225))
	e.LightInfluence = 1
	e.Orientation = Enum.ParticleOrientation.VelocityParallel
	e.Parent = p
	rainPart = p
	rainEmitter = e
end

local function updateRain(dt: number)
	local city = State.city()
	local raining = Workspace:GetAttribute("Rain_" .. city) == true
	State.rain = raining
	local e = rainEmitter
	local p = rainPart
	if not e or not p then
		return
	end
	local target = if raining then 900 else 0
	e.Rate += (target - e.Rate) * math.min(1, dt * 0.8)
	if e.Rate < 5 then
		e.Rate = 0
	end
	e.Enabled = e.Rate > 0
	p.CFrame = CFrame.new(Workspace.CurrentCamera.CFrame.Position + Vector3.new(0, 45, 0))
	local atmo = Lighting:FindFirstChildOfClass("Atmosphere")
	if atmo then
		local want = if raining then 0.42 else 0.28
		atmo.Density += (want - atmo.Density) * math.min(1, dt * 0.3)
	end
	local clouds = Workspace.Terrain:FindFirstChildOfClass("Clouds")
	if clouds then
		local want = if raining then 0.9 else 0.55
		clouds.Cover += (want - clouds.Cover) * math.min(1, dt * 0.3)
	end
end

-- Delivery marker ---------------------------------------------------------------------
local marker: Part? = nil

local function updateDeliveryMarker()
	if marker then
		marker:Destroy()
		marker = nil
	end
	local d = State.delivery
	if not d then
		return
	end
	local p = Instance.new("Part")
	p.Name = "DeliveryMarker"
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.CastShadow = false
	p.Material = Enum.Material.Neon
	p.Color = Color3.fromRGB(255, 200, 40)
	p.Transparency = 0.35
	p.Shape = Enum.PartType.Cylinder
	p.Size = Vector3.new(70, 4, 4)
	p.CFrame = CFrame.new(d.to + Vector3.new(0, 35, 0)) * CFrame.Angles(0, 0, math.pi / 2)
	local gui = Instance.new("BillboardGui")
	gui.Size = UDim2.fromOffset(200, 60)
	gui.StudsOffsetWorldSpace = Vector3.new(0, -26, 0)
	gui.AlwaysOnTop = true
	gui.Parent = p
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.FredokaOne
	label.TextScaled = true
	label.TextColor3 = Color3.new(1, 1, 1)
	label.TextStrokeTransparency = 0.2
	label.Text = "📦 Deliver here!"
	label.Parent = gui
	p.Parent = localFolder
	marker = p
end

-- Splash ------------------------------------------------------------------------------
local function splashAt(at: Vector3)
	local p = Instance.new("Part")
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.Transparency = 1
	p.Size = Vector3.new(4, 0.2, 4)
	p.CFrame = CFrame.new(at)
	p.Parent = localFolder
	local e = Instance.new("ParticleEmitter")
	e.EmissionDirection = Enum.NormalId.Top
	e.SpreadAngle = Vector2.new(35, 35)
	e.Speed = NumberRange.new(18, 30)
	e.Acceleration = Vector3.new(0, -60, 0)
	e.Lifetime = NumberRange.new(0.6, 1)
	e.Size = NumberSequence.new(0.6, 0.1)
	e.Color = ColorSequence.new(Color3.fromRGB(210, 235, 255))
	e.Transparency = NumberSequence.new(0.2, 1)
	e.Rate = 0
	e.Parent = p
	e:Emit(60)
	task.delay(2, function()
		p:Destroy()
	end)
end
Effects.splashAt = splashAt

-- Main loop ---------------------------------------------------------------------------------
local function onRender(dt: number)
	local t = os.clock()
	-- day / night
	local clock = Lighting.ClockTime
	local night = clock >= 18.25 or clock < 6.25
	if night ~= State.night then
		State.night = night
		queueAll()
	end
	for _ = 1, 400 do
		local p = table.remove(pending)
		if not p then
			break
		end
		applyNight(p)
	end
	-- windmill sails turn around their hub
	for part, hub in sails do
		if not part.Parent then
			sails[part] = nil
			continue
		end
		local axis = part.CFrame.ZVector
		part.CFrame = CFrame.new(hub) * CFrame.fromAxisAngle(axis, dt * 0.6) * CFrame.new(-hub) * part.CFrame
	end
	for part in spinners do
		if not part.Parent then
			spinners[part] = nil
			continue
		end
		part.CFrame *= CFrame.Angles(dt * 0.7, 0, 0)
	end
	if night then
		for part in sparkles do
			if part.Parent then
				part.Transparency = if math.random() < 0.35 then 0 else 0.9
			else
				sparkles[part] = nil
			end
		end
	end
	local blink = night and (t % 1.5) < 0.6
	for part in beacons do
		if part.Parent then
			part.Transparency = if night and not blink then 0.8 else 0
		else
			beacons[part] = nil
		end
	end
	-- traffic lights: green 12 s, amber 3 s, red 15 s (each crossing a bit different)
	for part, which in lights do
		if not part.Parent then
			lights[part] = nil
			continue
		end
		local phase = (t + (part.Position.X + part.Position.Z) * 0.05) % 30
		local on = if phase < 12 then 3 elseif phase < 15 then 2 else 1
		part.Transparency = if on == which then 0 else 0.75
	end
	-- neon billboards slowly change colour
	for part, seed in billboards do
		if not part.Parent then
			billboards[part] = nil
			continue
		end
		if math.floor(t * 2 + seed) % 7 == 0 then
			part.Color = Color3.fromHSV(((t * 0.05) + seed * 0.13) % 1, 0.75, 1)
		end
	end
	for _, ring in CollectionService:GetTagged("ShopMarker") do
		if ring:IsA("BasePart") then
			ring.Transparency = 0.45 + math.sin(t * 3) * 0.15
		end
	end
	updateCoins()
	updateRain(dt)
	if marker then
		marker.Transparency = 0.3 + math.sin(t * 4) * 0.15
	end
end

local function watch(tag: string, added: (Instance) -> ())
	for _, inst in CollectionService:GetTagged(tag) do
		task.spawn(added, inst)
	end
	CollectionService:GetInstanceAddedSignal(tag):Connect(added)
end

function Effects.init(onSplash: RBXScriptSignal?)
	makeRain()
	for _, tag in NIGHT_TAGS do
		watch(tag, function(inst)
			if inst:IsA("BasePart") then
				remember(inst)
				if State.night or tag == "Sparkle" then
					table.insert(pending, inst)
				end
			end
		end)
		CollectionService:GetInstanceRemovedSignal(tag):Connect(function(inst)
			if inst:IsA("BasePart") then
				orig[inst] = nil
			end
		end)
	end
	watch("Sail", function(inst)
		if inst:IsA("BasePart") then
			sails[inst] = inst.Position - inst.CFrame.UpVector * (inst.Size.Y / 2)
		end
	end)
	watch("Spin", function(inst)
		if inst:IsA("BasePart") then
			spinners[inst] = true
		end
	end)
	watch("Sparkle", function(inst)
		if inst:IsA("BasePart") then
			sparkles[inst] = true
		end
	end)
	watch("NightBeacon", function(inst)
		if inst:IsA("BasePart") then
			beacons[inst] = true
		end
	end)
	watch("Beacon", function(inst)
		if inst:IsA("BasePart") then
			beacons[inst] = true
		end
	end)
	for i = 1, 3 do
		watch("TrafficLight" .. i, function(inst)
			if inst:IsA("BasePart") then
				lights[inst] = i
				inst.Transparency = 0.75
			end
		end)
	end
	watch("Billboard", function(inst)
		if inst:IsA("BasePart") then
			billboards[inst] = math.random() * 10
		end
	end)
	watch("Coin", addCoin)
	State.deliveryChanged.Event:Connect(updateDeliveryMarker)
	if onSplash then
		onSplash:Connect(function(at: Vector3)
			splashAt(at)
		end)
	end
	RunService.RenderStepped:Connect(onRender)
end

return Effects
