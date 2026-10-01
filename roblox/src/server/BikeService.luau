--!strict
-- Gives every player a bike, sits them on it and moves them between cities.

local Players = game:GetService("Players")
local Workspace = game:GetService("Workspace")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Config = require(Shared.Config)
local BikeModel = require(Shared.BikeModel)
local DataService = require(script.Parent.DataService)
local Worlds = require(script.Parent.Worlds)

local BikeService = {}
BikeService.bikes = {} :: { [Player]: Model }
BikeService.hasPass = function(_player: Player, _key: string): boolean
	return false
end
BikeService.remotes = nil :: Folder?

local bikesFolder = Instance.new("Folder")
bikesFolder.Name = "Bikes"
bikesFolder.Parent = Workspace

local wantsBike: { [Player]: boolean } = {}

local function setGroup(model: Instance, group: string)
	for _, d in model:GetDescendants() do
		if d:IsA("BasePart") then
			d.CollisionGroup = group
		end
	end
end

function BikeService.bikeDef(id: string): Config.BikeDef
	for _, b in Config.Bikes do
		if b.id == id then
			return b
		end
	end
	return Config.Bikes[1]
end

local function colorOf(id: string): Color3
	for _, c in Config.Colors do
		if c.id == id then
			return c.color
		end
	end
	return Config.Colors[1].color
end

function BikeService.ownsBike(player: Player, def: Config.BikeDef): boolean
	local profile = DataService.get(player)
	if def.gamePass then
		return BikeService.hasPass(player, def.gamePass)
	end
	return profile ~= nil and profile.bikes[def.id] == true
end

--- The bike the player has equipped (or the free one if they lost it).
function BikeService.chosenDef(player: Player): Config.BikeDef
	local profile = DataService.get(player)
	local def = BikeService.bikeDef(if profile then profile.bike else "city")
	if not BikeService.ownsBike(player, def) then
		def = Config.Bikes[1]
	end
	return def
end

function BikeService.lookFor(player: Player): BikeModel.Look
	local profile = DataService.get(player)
	local def = BikeService.chosenDef(player)
	local cosmetics: { [string]: boolean } = {}
	if profile then
		for id, on in profile.worn do
			if on then
				cosmetics[id] = true
			end
		end
	end
	-- pass cosmetics are only shown while owned
	for _, c in Config.Cosmetics do
		if c.gamePass and cosmetics[c.id] and not BikeService.hasPass(player, c.gamePass) then
			cosmetics[c.id] = nil
		end
	end
	local gold = def.id == "golden"
	return {
		style = def.style,
		color = if gold then def.color elseif profile then colorOf(profile.color) else def.color,
		wheel = def.wheel,
		cosmetics = cosmetics,
		gold = gold,
	}
end

function BikeService.removeBike(player: Player)
	local old = BikeService.bikes[player]
	BikeService.bikes[player] = nil
	local char = player.Character
	if char then
		local hum = char:FindFirstChildOfClass("Humanoid")
		if hum and hum.SeatPart then
			hum.Sit = false
		end
		setGroup(char, "Default")
		local helmet = char:FindFirstChild("BikeHelmet")
		if helmet then
			helmet:Destroy()
		end
	end
	if old then
		old:Destroy()
	end
	player:SetAttribute("OnBike", false)
	local ref = player:FindFirstChild("Bike")
	if ref and ref:IsA("ObjectValue") then
		ref.Value = nil
	end
end

function BikeService.spawnBike(player: Player, at: CFrame?)
	local char = player.Character
	if not char then
		return
	end
	local hum = char:FindFirstChildOfClass("Humanoid")
	local hrp = char:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not hum or not hrp or hum.Health <= 0 then
		return
	end
	BikeService.removeBike(player)
	local origin: CFrame
	if at then
		origin = at
	else
		local params = RaycastParams.new()
		params.FilterType = Enum.RaycastFilterType.Exclude
		params.FilterDescendantsInstances = { char, bikesFolder }
		local pos = hrp.Position
		local hit = Workspace:Raycast(pos + Vector3.new(0, 4, 0), Vector3.new(0, -40, 0), params)
		local groundY = if hit then hit.Position.Y else pos.Y - 3
		local look = hrp.CFrame.LookVector
		origin = CFrame.new(pos.X, groundY, pos.Z) * CFrame.Angles(0, math.atan2(-look.X, -look.Z), 0)
	end
	local model = BikeModel.build(BikeService.lookFor(player), origin, nil)
	model.Name = player.Name .. "_Bike"
	model:SetAttribute("Owner", player.UserId)
	model:SetAttribute("BikeId", BikeService.chosenDef(player).id)
	-- always streamed to its rider, streamed as one piece to everyone else
	model.ModelStreamingMode = Enum.ModelStreamingMode.PersistentPerPlayer
	local root = model.PrimaryPart :: BasePart
	-- the client drives the bike by moving these rigid targets
	local att = Instance.new("Attachment")
	att.Name = "Drive"
	att.Parent = root
	local ap = Instance.new("AlignPosition")
	ap.Name = "DrivePosition"
	ap.Mode = Enum.PositionAlignmentMode.OneAttachment
	ap.Attachment0 = att
	ap.RigidityEnabled = true
	ap.Position = root.Position
	ap.Parent = root
	local ao = Instance.new("AlignOrientation")
	ao.Name = "DriveOrientation"
	ao.Mode = Enum.OrientationAlignmentMode.OneAttachment
	ao.Attachment0 = att
	ao.RigidityEnabled = true
	ao.CFrame = root.CFrame
	ao.Parent = root
	setGroup(model, "Riders")
	model.Parent = bikesFolder
	pcall(function()
		model:AddPersistentPlayer(player)
	end)
	pcall(function()
		root:SetNetworkOwner(player)
	end)
	-- sit down
	hrp.CFrame = origin * CFrame.new(0, 4, 0)
	local seat = model:FindFirstChild("Saddle") :: Seat
	seat:Sit(hum)
	setGroup(char, "Riders")
	-- accessories that load later must not bump into the city either
	local added = char.DescendantAdded:Connect(function(d)
		if d:IsA("BasePart") and BikeService.bikes[player] == model then
			d.CollisionGroup = "Riders"
		end
	end)
	model.Destroying:Connect(function()
		added:Disconnect()
	end)
	-- helmet
	local profile = DataService.get(player)
	local head = char:FindFirstChild("Head") :: BasePart?
	if profile and profile.worn.helmet and head then
		local h = Instance.new("Part")
		h.Name = "BikeHelmet"
		h.Shape = Enum.PartType.Ball
		h.Size = Vector3.new(1.5, 1.5, 1.5)
		h.Color = Color3.fromRGB(255, 120, 40)
		h.Material = Enum.Material.SmoothPlastic
		h.CanCollide = false
		h.CanQuery = false
		h.Massless = true
		h.CFrame = head.CFrame * CFrame.new(0, 0.3, 0)
		local w = Instance.new("WeldConstraint")
		w.Part0 = head
		w.Part1 = h
		w.Parent = h
		h.Parent = char
	end
	BikeService.bikes[player] = model
	player:SetAttribute("OnBike", true)
	local ref = player:FindFirstChild("Bike")
	if ref and ref:IsA("ObjectValue") then
		ref.Value = model
	end
end

function BikeService.toggle(player: Player)
	if BikeService.bikes[player] then
		wantsBike[player] = false
		BikeService.removeBike(player)
	else
		wantsBike[player] = true
		BikeService.spawnBike(player)
	end
end

--- Teleport a player to the hub or a city.
function BikeService.goTo(player: Player, worldId: string)
	local w = Worlds.list[worldId]
	if not w or not w.ready then
		return false
	end
	pcall(function()
		player:RequestStreamAroundAsync(w.spawn.Position, 10)
	end)
	player:SetAttribute("City", worldId)
	local remotes = BikeService.remotes
	if BikeService.bikes[player] and remotes then
		(remotes:FindFirstChild("Teleport") :: RemoteEvent):FireClient(player, w.spawn)
	else
		local char = player.Character
		if char then
			char:PivotTo(w.spawn * CFrame.new(0, 3, 0))
		end
	end
	return true
end

function BikeService.onPlayer(player: Player)
	wantsBike[player] = true
	local ref = Instance.new("ObjectValue")
	ref.Name = "Bike"
	ref.Parent = player
	player.CharacterAdded:Connect(function(char)
		local hum = char:WaitForChild("Humanoid", 10) :: Humanoid?
		char:WaitForChild("HumanoidRootPart", 10)
		if not hum then
			return
		end
		hum.Died:Connect(function()
			BikeService.removeBike(player)
		end)
		task.wait(0.6)
		player:SetAttribute("City", "hub")
		if wantsBike[player] ~= false then
			BikeService.spawnBike(player)
		end
	end)
end

Players.PlayerRemoving:Connect(function(player)
	BikeService.removeBike(player)
	wantsBike[player] = nil
end)

return BikeService
