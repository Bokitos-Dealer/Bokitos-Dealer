--!strict
-- Bike the World: server start-up. Builds the hub and the cities, sets up
-- remotes, players, portals, the bike shop, weather and the day/night cycle.

local CollectionService = game:GetService("CollectionService")
local Lighting = game:GetService("Lighting")
local PhysicsService = game:GetService("PhysicsService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

-- characters spawn once the hub is built and the save file is loaded
Players.CharacterAutoLoads = false

-- Remotes first, so client scripts can wait for them
local remotes = Instance.new("Folder")
remotes.Name = "Remotes"
for _, name in {
	"Profile", "Toast", "Coins", "Landmark", "Teleport", "Delivery", "OpenShop", "BellRang",
	"Bell", "CollectCoin", "ToggleBike", "GoToCity", "CancelDelivery",
} do
	local ev = Instance.new("RemoteEvent")
	ev.Name = name
	ev.Parent = remotes
end
for _, name in { "Buy", "Equip", "GetProfile" } do
	local fn = Instance.new("RemoteFunction")
	fn.Name = name
	fn.Parent = remotes
end
remotes.Parent = ReplicatedStorage

local function remote(name: string): RemoteEvent
	return remotes:FindFirstChild(name) :: RemoteEvent
end
local function func(name: string): RemoteFunction
	return remotes:FindFirstChild(name) :: RemoteFunction
end

-- Riders don't bump into the world or each other: the client steers the bike
-- around walls itself, which feels much smoother than physics collisions.
pcall(function()
	PhysicsService:RegisterCollisionGroup("Riders")
end)
PhysicsService:CollisionGroupSetCollidable("Riders", "Default", false)
PhysicsService:CollisionGroupSetCollidable("Riders", "Riders", false)

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Hub = require(Shared.Cities.Hub)
local Materializer = require(script.Parent.Materializer)
local DataService = require(script.Parent.DataService)
local Worlds = require(script.Parent.Worlds)
local BikeService = require(script.Parent.BikeService)
local ShopService = require(script.Parent.ShopService)
local RewardService = require(script.Parent.RewardService)

BikeService.remotes = remotes

local function toast(player: Player, text: string, kind: string?)
	remote("Toast"):FireClient(player, text, kind or "info")
end
RewardService.init(remotes, toast)

-- Sky and light ------------------------------------------------------------------
local function ensure(className: string, parent: Instance): Instance
	local found = parent:FindFirstChildOfClass(className)
	if found then
		return found
	end
	local made = Instance.new(className)
	made.Parent = parent
	return made
end

do
	local atmo = ensure("Atmosphere", Lighting) :: Atmosphere
	atmo.Density = 0.28
	atmo.Offset = 0.1
	atmo.Color = Color3.fromRGB(199, 214, 230)
	atmo.Decay = Color3.fromRGB(106, 120, 140)
	atmo.Glare = 0.2
	atmo.Haze = 1.2
	local bloom = ensure("BloomEffect", Lighting) :: BloomEffect
	bloom.Intensity = 0.6
	bloom.Size = 24
	bloom.Threshold = 1.6
	local cc = ensure("ColorCorrectionEffect", Lighting) :: ColorCorrectionEffect
	cc.Saturation = 0.12
	cc.Contrast = 0.04
	ensure("Sky", Lighting)
	local terrain = Workspace.Terrain
	terrain.WaterColor = Color3.fromRGB(52, 92, 96)
	terrain.WaterReflectance = 0.6
	terrain.WaterTransparency = 0.35
	terrain.WaterWaveSize = 0.08
	terrain.WaterWaveSpeed = 6
	local clouds = ensure("Clouds", terrain) :: Clouds
	clouds.Cover = 0.55
	clouds.Density = 0.5
	-- colours of the real cities' ground: pavements, squares, parks and water beds
	terrain:SetMaterialColor(Enum.Material.Pavement, Color3.fromRGB(168, 163, 154))
	terrain:SetMaterialColor(Enum.Material.Cobblestone, Color3.fromRGB(140, 132, 122))
	terrain:SetMaterialColor(Enum.Material.Grass, Color3.fromRGB(96, 142, 62))
	terrain:SetMaterialColor(Enum.Material.LeafyGrass, Color3.fromRGB(78, 120, 52))
	terrain:SetMaterialColor(Enum.Material.Sand, Color3.fromRGB(206, 190, 150))
	terrain:SetMaterialColor(Enum.Material.Mud, Color3.fromRGB(58, 50, 40))
end

-- Day and night: one day takes Config.DayLengthMinutes; nights go twice as
-- fast so there is more daylight to ride in.
RunService.Heartbeat:Connect(function(dt: number)
	local hoursPerSecond = 24 / (Config.DayLengthMinutes * 60)
	local t = Lighting.ClockTime
	local night = t < 6 or t > 19
	Lighting.ClockTime = (t + dt * hoursPerSecond * (if night then 2 else 1)) % 24
end)

-- Rain comes and goes per city (the client shows it and makes streets slippery)
task.spawn(function()
	while true do
		for _, c in Config.Cities do
			Workspace:SetAttribute("Rain_" .. c.id, math.random() < c.rainChance)
		end
		task.wait(math.random(180, 360))
	end
end)

-- The world ---------------------------------------------------------------------
local worldFolder = Instance.new("Folder")
worldFolder.Name = "World"
worldFolder.Parent = Workspace

local portalList: { BasePart } = {}

local function setupKiosk(part: BasePart)
	local prompt = Instance.new("ProximityPrompt")
	prompt.ActionText = "Open the Bike Shop"
	prompt.ObjectText = "Bike Shop"
	prompt.KeyboardKeyCode = Enum.KeyCode.E
	prompt.MaxActivationDistance = 30
	prompt.RequiresLineOfSight = false
	prompt.HoldDuration = 0
	prompt.Parent = part
	prompt.Triggered:Connect(function(player)
		remote("OpenShop"):FireClient(player)
	end)
end

local function buildWorld(id: string, b: any, origin: Vector3, name: string)
	local built = Materializer.build(b, origin, name, worldFolder)
	Worlds.fill(id, b)
	RewardService.spawnCoins(id, origin, b.coins, built.folder)
	RewardService.spawnShopMarkers(Worlds.list[id], built.folder)
	for _, p in built.portals do
		table.insert(portalList, p)
	end
	for _, k in built.kiosks do
		setupKiosk(k)
	end
	Worlds.list[id].ready = true
	return built
end

-- the hub first, so players can start straight away
local portalCities = {}
for _, c in Config.Cities do
	table.insert(portalCities, {
		id = c.id,
		name = c.name,
		col = bit32.bor(
			bit32.lshift(math.floor(c.color.R * 255 + 0.5), 16),
			bit32.lshift(math.floor(c.color.G * 255 + 0.5), 8),
			math.floor(c.color.B * 255 + 0.5)
		),
	})
end
local hubList = Hub.generate(portalCities)
buildWorld("hub", hubList, Config.HubOrigin, "Hub")

local spawnLocation = Instance.new("SpawnLocation")
spawnLocation.Name = "HubSpawn"
spawnLocation.Anchored = true
spawnLocation.CanCollide = false
spawnLocation.CanQuery = false
spawnLocation.Transparency = 1
spawnLocation.Size = Vector3.new(6, 1, 6)
spawnLocation.Duration = 0
spawnLocation.Neutral = true
spawnLocation.CFrame = Worlds.list.hub.spawn
spawnLocation.Parent = Workspace
local spawnDecal = spawnLocation:FindFirstChildOfClass("Decal")
if spawnDecal then
	spawnDecal:Destroy()
end

-- then the cities, one after another
task.spawn(function()
	for _, c in Config.Cities do
		local t0 = os.clock()
		local ok, err = pcall(function()
			local mod = Shared:WaitForChild("Cities"):FindFirstChild(c.module)
			if not mod then
				error("no city module " .. c.module)
			end
			local gen = require(mod :: ModuleScript) :: any
			buildWorld(c.id, gen.generate(), c.origin, c.name)
		end)
		if ok then
			print(string.format("[Bike the World] %s ready in %.1fs", c.name, os.clock() - t0))
			for _, player in Players:GetPlayers() do
				toast(player, c.name .. " is ready! Ride through its portal.", "info")
				DataService.touch(player) -- sends the new landmark list
			end
		else
			warn("[Bike the World] could not build " .. c.name .. ": " .. tostring(err))
		end
	end
end)

-- Portals: checked by position, which works with streaming and fast bikes
local lastPortal: { [Player]: number } = {}
task.spawn(function()
	while true do
		task.wait(0.15)
		for _, player in Players:GetPlayers() do
			local char = player.Character
			local hrp = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
			if hrp and os.clock() - (lastPortal[player] or 0) > 3 then
				for _, p in portalList do
					local lp = p.CFrame:PointToObjectSpace(hrp.Position)
					if math.abs(lp.X) < p.Size.X / 2 and math.abs(lp.Z) < 6 and lp.Y > -p.Size.Y / 2 - 6 and lp.Y < p.Size.Y / 2 then
						lastPortal[player] = os.clock()
						local city = p:GetAttribute("City")
						if type(city) == "string" then
							local w = Worlds.list[city]
							if w and w.ready then
								BikeService.goTo(player, city)
								remote("Toast"):FireClient(player, "Welcome to " .. w.name .. "!", "city")
							else
								toast(player, "This city is still being built. Try again in a moment!", "info")
							end
						end
						break
					end
				end
			end
		end
	end
end)

-- Players ----------------------------------------------------------------------------
local function snapshot(player: Player): { [string]: any }?
	local profile = DataService.get(player)
	if not profile then
		return nil
	end
	local passes = {}
	for key: string in Config.GamePasses do
		passes[key] = ShopService.hasPass(player, key)
	end
	local found = 0
	for _ in profile.landmarks do
		found += 1
	end
	local total = 0
	local list = {}
	for _, w in Worlds.list do
		total += #w.landmarks
		for _, l in w.landmarks do
			table.insert(list, { id = l.id, name = l.name, city = w.id })
		end
	end
	return {
		coins = profile.coins,
		bikes = profile.bikes,
		colors = profile.colors,
		cosmetics = profile.cosmetics,
		worn = profile.worn,
		bike = profile.bike,
		color = profile.color,
		landmarks = profile.landmarks,
		found = found,
		totalLandmarks = total,
		landmarkList = list,
		deliveries = profile.deliveries,
		metres = profile.metres,
		passes = passes,
	}
end

local function setStat(player: Player, name: string, value: number)
	local stats = player:FindFirstChild("leaderstats")
	local v = stats and stats:FindFirstChild(name)
	if v and v:IsA("IntValue") then
		v.Value = value
	end
end

DataService.changed.Event:Connect(function(player: Player)
	local snap = snapshot(player)
	if not snap then
		return
	end
	setStat(player, "Coins", snap.coins)
	setStat(player, "Landmarks", snap.found)
	remote("Profile"):FireClient(player, snap)
end)

-- LoadCharacterAsync is the new name of LoadCharacter; use whichever exists
local function spawnCharacter(player: Player)
	local ok = pcall(function()
		player:LoadCharacterAsync()
	end)
	if not ok and player.Parent then
		(player :: any):LoadCharacter()
	end
end

local function onPlayerAdded(player: Player)
	local stats = Instance.new("Folder")
	stats.Name = "leaderstats"
	for _, name in { "Coins", "Landmarks" } do
		local v = Instance.new("IntValue")
		v.Name = name
		v.Parent = stats
	end
	stats.Parent = player
	player:SetAttribute("City", "hub")

	DataService.load(player)
	if not player.Parent then
		return
	end
	BikeService.onPlayer(player)
	RewardService.onPlayer(player)
	ShopService.onJoin(player, toast)
	DataService.touch(player)

	player.CharacterAdded:Connect(function(char)
		local hum = char:WaitForChild("Humanoid", 10) :: Humanoid?
		if hum then
			hum.Died:Connect(function()
				task.wait(3)
				if player.Parent then
					spawnCharacter(player)
				end
			end)
		end
	end)
	spawnCharacter(player)
	task.delay(4, function()
		if player.Parent then
			toast(player, "Welcome to " .. Config.GameName .. "! Ride through a portal to visit a city.", "info")
			RewardService.dailyBonus(player)
		end
	end)
end

Players.PlayerAdded:Connect(onPlayerAdded)
for _, player in Players:GetPlayers() do
	task.spawn(onPlayerAdded, player)
end

Players.PlayerRemoving:Connect(function(player)
	lastPortal[player] = nil
	DataService.release(player)
end)

-- Remote handlers ----------------------------------------------------------------------
local busy: { [Player]: number } = {}
local function throttle(player: Player, gap: number): boolean
	local now = os.clock()
	if now - (busy[player] or 0) < gap then
		return false
	end
	busy[player] = now
	return true
end
Players.PlayerRemoving:Connect(function(player)
	busy[player] = nil
end)

func("GetProfile").OnServerInvoke = function(player)
	return snapshot(player)
end

func("Buy").OnServerInvoke = function(player, kind, id)
	if type(kind) ~= "string" or type(id) ~= "string" then
		return false, "Oops!"
	end
	if not throttle(player, 0.3) then
		return false, "One moment..."
	end
	return ShopService.buy(player, kind, id)
end

func("Equip").OnServerInvoke = function(player, kind, id)
	if type(kind) ~= "string" or type(id) ~= "string" then
		return false, "Oops!"
	end
	if not throttle(player, 0.3) then
		return false, "One moment..."
	end
	return ShopService.equip(player, kind, id)
end

remote("CollectCoin").OnServerEvent:Connect(function(player, id)
	RewardService.collectCoin(player, id)
end)

remote("CancelDelivery").OnServerEvent:Connect(function(player)
	RewardService.cancelJob(player)
end)

local lastToggle: { [Player]: number } = {}
remote("ToggleBike").OnServerEvent:Connect(function(player)
	if os.clock() - (lastToggle[player] or 0) < 1 then
		return
	end
	lastToggle[player] = os.clock()
	BikeService.toggle(player)
end)

local lastTravel: { [Player]: number } = {}
remote("GoToCity").OnServerEvent:Connect(function(player, id)
	if type(id) ~= "string" or not Worlds.list[id] then
		return
	end
	if os.clock() - (lastTravel[player] or 0) < 3 then
		return
	end
	lastTravel[player] = os.clock()
	if not Worlds.list[id].ready then
		toast(player, "This city is still being built. Try again in a moment!", "info")
		return
	end
	if BikeService.goTo(player, id) then
		toast(player, "Welcome to " .. Worlds.list[id].name .. "!", "city")
	end
end)

local lastBell: { [Player]: number } = {}
remote("Bell").OnServerEvent:Connect(function(player)
	if os.clock() - (lastBell[player] or 0) < 0.35 then
		return
	end
	lastBell[player] = os.clock()
	local bike = BikeService.bikes[player]
	if not bike then
		return
	end
	for _, other in Players:GetPlayers() do
		if other ~= player then
			remote("BellRang"):FireClient(other, bike)
		end
	end
end)

Players.PlayerRemoving:Connect(function(player)
	lastToggle[player] = nil
	lastTravel[player] = nil
	lastBell[player] = nil
end)

-- If someone hops off the saddle (e.g. by jumping) the bike goes away; the
-- "Bike" button brings it back.
RunService.Heartbeat:Connect(function()
	for player, bike in BikeService.bikes do
		local seat = bike:FindFirstChild("Saddle") :: Seat?
		if seat and not seat.Occupant and bike:GetAttribute("Seated") then
			BikeService.toggle(player)
		elseif seat and seat.Occupant then
			bike:SetAttribute("Seated", true)
		end
	end
end)

-- tagged so other scripts can find the hub spawn if they need it
CollectionService:AddTag(spawnLocation, "HubSpawn")
