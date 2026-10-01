--!strict
-- Everything that earns coins: spinning street coins, kilometres ridden,
-- discovering landmarks, delivery jobs and the daily bonus. The server checks
-- every reward, so a player can't simply tell it "give me coins".

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Config = require(Shared.Config)
local DataService = require(script.Parent.DataService)
local BikeService = require(script.Parent.BikeService)
local Worlds = require(script.Parent.Worlds)

local M = Config.M
local R = Config.Rewards

local RewardService = {}

local remotes: Folder? = nil
local toast: (Player, string, string?) -> () = function() end

local COIN_RESPAWN = 40 -- seconds before a coin comes back (per player)
local COIN_REACH = 26 -- studs; generous because of network delay
local SHOP_REACH = 7 * M
local DOOR_REACH = 7 * M
local MAX_SPEED = 22 * M -- studs per second; faster means a teleport

local coinPos: { [string]: Vector3 } = {}
local collected: { [Player]: { [string]: number } } = {}
local coinBudget: { [Player]: number } = {}

type Job = {
	world: string,
	item: string,
	shop: string,
	from: Vector3,
	to: Vector3,
	started: number,
	limit: number,
}

type Track = {
	last: Vector3?,
	world: string?,
	metres: number,
	job: Job?,
	nextJob: number,
}
local tracks: { [Player]: Track } = {}

local function fire(name: string, player: Player, ...: any)
	local r = remotes
	if r then
		local ev = r:FindFirstChild(name)
		if ev and ev:IsA("RemoteEvent") then
			ev:FireClient(player, ...)
		end
	end
end

function RewardService.init(remoteFolder: Folder, sendToast: (Player, string, string?) -> ())
	remotes = remoteFolder
	toast = sendToast
end

--- Add earned coins (doubled with the 2x Coins pass). Returns the amount.
function RewardService.give(player: Player, amount: number, reason: string?): number
	local profile = DataService.get(player)
	if not profile or amount <= 0 then
		return 0
	end
	if BikeService.hasPass(player, "DoubleCoins") then
		amount *= 2
	end
	amount = math.floor(amount + 0.5)
	profile.coins += amount
	profile.totalCoins += amount
	DataService.touch(player)
	fire("Coins", player, amount, reason or "")
	return amount
end

-- Coins ----------------------------------------------------------------------

--- Create the spinning coins of a world. `spots` are relative to `origin`.
function RewardService.spawnCoins(worldId: string, origin: Vector3, spots: { any }, parent: Instance)
	local folder = Instance.new("Folder")
	folder.Name = "Coins"
	for i, s in spots do
		local id = worldId .. ":" .. i
		local pos = origin + Vector3.new(s.x, s.y, s.z)
		coinPos[id] = pos
		local coin = Instance.new("Part")
		coin.Name = "Coin"
		coin.Shape = Enum.PartType.Cylinder
		coin.Size = Vector3.new(0.35, 2.6, 2.6)
		coin.CFrame = CFrame.new(pos)
		coin.Color = Color3.fromRGB(255, 200, 40)
		coin.Material = Enum.Material.Neon
		coin.Anchored = true
		coin.CanCollide = false
		coin.CanQuery = false
		coin.CanTouch = false
		coin.CastShadow = false
		coin:SetAttribute("Id", id)
		CollectionService:AddTag(coin, "Coin")
		coin.Parent = folder
	end
	folder.Parent = parent
end

local function playerPos(player: Player): Vector3?
	local bike = BikeService.bikes[player]
	if bike and bike.PrimaryPart then
		return bike.PrimaryPart.Position
	end
	local char = player.Character
	local hrp = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
	return if hrp then hrp.Position else nil
end

--- The client says it rode through a coin; check it really did.
function RewardService.collectCoin(player: Player, id: any)
	if type(id) ~= "string" then
		return
	end
	local pos = coinPos[id]
	local at = playerPos(player)
	if not pos or not at then
		return
	end
	if (pos - at).Magnitude > COIN_REACH then
		return
	end
	-- at most ~8 coins a second
	local budget = coinBudget[player] or 0
	if budget >= 8 then
		return
	end
	coinBudget[player] = budget + 1
	local mine = collected[player]
	if not mine then
		mine = {}
		collected[player] = mine
	end
	local now = os.clock()
	local last = mine[id]
	if last and now - last < COIN_RESPAWN - 2 then
		return
	end
	mine[id] = now
	RewardService.give(player, R.CoinPickup, "coin")
end

-- Shops and deliveries ---------------------------------------------------------

local SHOP_ICONS: { [string]: string } = {
	["Café"] = "☕",
	["Flower Market"] = "🌷",
	["Boulangerie"] = "🥐",
	["Pizza Place"] = "🍕",
	["Bagel Shop"] = "🥯",
	["Hot Dog Cart"] = "🌭",
}

--- Glowing rings where you pick up delivery orders.
function RewardService.spawnShopMarkers(world: Worlds.World, parent: Instance)
	local folder = Instance.new("Folder")
	folder.Name = "ShopMarkers"
	for _, s in world.shops do
		local ring = Instance.new("Part")
		ring.Name = "ShopMarker"
		ring.Shape = Enum.PartType.Cylinder
		ring.Size = Vector3.new(0.3, SHOP_REACH * 1.6, SHOP_REACH * 1.6)
		ring.CFrame = CFrame.new(s.pos + Vector3.new(0, 0.2, 0)) * CFrame.Angles(0, 0, math.pi / 2)
		ring.Color = Color3.fromRGB(60, 200, 120)
		ring.Material = Enum.Material.Neon
		ring.Transparency = 0.45
		ring.Anchored = true
		ring.CanCollide = false
		ring.CanQuery = false
		ring.CanTouch = false
		ring.CastShadow = false
		CollectionService:AddTag(ring, "ShopMarker")
		local gui = Instance.new("BillboardGui")
		gui.Size = UDim2.fromOffset(220, 70)
		gui.StudsOffsetWorldSpace = Vector3.new(0, 9, 0)
		gui.MaxDistance = 260
		gui.AlwaysOnTop = false
		gui.Parent = ring
		local label = Instance.new("TextLabel")
		label.Size = UDim2.fromScale(1, 1)
		label.BackgroundTransparency = 1
		label.Font = Enum.Font.FredokaOne
		label.TextScaled = true
		label.TextColor3 = Color3.new(1, 1, 1)
		label.TextStrokeTransparency = 0.3
		label.Text = (SHOP_ICONS[s.label or ""] or "📦") .. " " .. (s.label or "Shop") .. "\nRide here to deliver!"
		label.Parent = gui
		ring.Parent = folder
	end
	folder.Parent = parent
end

local function flat(a: Vector3, b: Vector3): number
	return Vector2.new(a.X - b.X, a.Z - b.Z).Magnitude
end

local function startJob(player: Player, t: Track, world: Worlds.World, shop: Worlds.Spot)
	if #world.doors == 0 or #world.food == 0 then
		return
	end
	-- pick a door that is a nice ride away (not too close, not too far)
	local best: Vector3? = nil
	for _ = 1, 30 do
		local d = world.doors[math.random(1, #world.doors)].pos
		local dist = flat(d, shop.pos)
		if dist > 90 * M and dist < 380 * M then
			best = d
			break
		end
		if not best or math.abs(dist - 200 * M) < math.abs(flat(best, shop.pos) - 200 * M) then
			best = d
		end
	end
	local to = best :: Vector3
	local dist = flat(to, shop.pos)
	local item = world.food[math.random(1, #world.food)]
	-- about 4.5 m/s average plus a little extra, so kids can make it
	local limit = math.floor(dist / (4.5 * M) + 25)
	t.job = {
		world = world.id,
		item = item,
		shop = shop.label or "Shop",
		from = shop.pos,
		to = to,
		started = os.clock(),
		limit = limit,
	}
	fire("Delivery", player, {
		state = "start",
		item = item,
		shop = shop.label or "Shop",
		to = to,
		limit = limit,
		metres = math.floor(dist / M),
	})
end

local function finishJob(player: Player, t: Track)
	local job = t.job :: Job
	t.job = nil
	t.nextJob = os.clock() + 4
	local used = os.clock() - job.started
	local bonus = 0
	if used < job.limit then
		bonus = R.DeliveryTimeBonus * (1 - used / job.limit) + R.DeliveryTimeBonus * 0.25
	end
	local profile = DataService.get(player)
	if profile then
		profile.deliveries += 1
	end
	local got = RewardService.give(player, R.DeliveryBase + bonus, "delivery")
	fire("Delivery", player, { state = "done", item = job.item, coins = got, fast = used < job.limit })
end

function RewardService.cancelJob(player: Player)
	local t = tracks[player]
	if t and t.job then
		t.job = nil
		t.nextJob = os.clock() + 6
		fire("Delivery", player, { state = "cancel" })
	end
end

-- Landmarks and distance ---------------------------------------------------------

local function checkLandmarks(player: Player, world: Worlds.World, pos: Vector3)
	local profile = DataService.get(player)
	if not profile then
		return
	end
	for _, l in world.landmarks do
		if not profile.landmarks[l.id] and flat(pos, l.pos) < l.radius then
			profile.landmarks[l.id] = true
			local got = RewardService.give(player, R.Landmark, "landmark")
			local total = 0
			for _ in profile.landmarks do
				total += 1
			end
			fire("Landmark", player, { id = l.id, name = l.name, fact = l.fact, coins = got, found = total })
			task.spawn(DataService.save, player)
		end
	end
end

local function update(player: Player, t: Track, dt: number)
	local pos = playerPos(player)
	if not pos then
		t.last = nil
		return
	end
	local worldId = player:GetAttribute("City")
	local world = if type(worldId) == "string" then Worlds.list[worldId] else nil
	if not world or not world.ready then
		t.last = nil
		return
	end
	if t.world ~= world.id then
		-- changed city: drop the old order and don't count the jump
		if t.job then
			RewardService.cancelJob(player)
		end
		t.world = world.id
		t.last = nil
	end
	-- distance ridden (only on the bike, ignoring teleports)
	local onBike = if BikeService.bikes[player] then true else false
	local last = t.last
	if onBike and last then
		local d = flat(pos, last)
		if d < MAX_SPEED * dt * 1.5 then
			t.metres += d / M
		end
	end
	t.last = pos
	if t.metres >= 1 then
		local whole = math.floor(t.metres)
		t.metres -= whole
		local profile = DataService.get(player)
		if profile then
			local before = math.floor(profile.metres * R.PerKilometre / 1000)
			profile.metres += whole
			local after = math.floor(profile.metres * R.PerKilometre / 1000)
			if after > before then
				RewardService.give(player, after - before, "ride")
			end
		end
	end
	checkLandmarks(player, world, pos)
	-- deliveries
	local job = t.job
	if job then
		if flat(pos, job.to) < DOOR_REACH and math.abs(pos.Y - job.to.Y) < 30 then
			finishJob(player, t)
		end
	elseif os.clock() > t.nextJob then
		for _, s in world.shops do
			if flat(pos, s.pos) < SHOP_REACH and math.abs(pos.Y - s.pos.Y) < 20 then
				startJob(player, t, world, s)
				break
			end
		end
	end
end

--- Once a day: free coins for coming back.
function RewardService.dailyBonus(player: Player)
	local profile = DataService.get(player)
	if not profile then
		return
	end
	local today = math.floor(os.time() / 86400)
	if math.floor(profile.lastDaily / 86400) < today then
		profile.lastDaily = os.time()
		local got = RewardService.give(player, R.DailyBonus, "daily")
		toast(player, string.format("Daily bonus: +%d coins! Come back tomorrow for more.", got), "good")
	end
end

function RewardService.onPlayer(player: Player)
	tracks[player] = { metres = 0, nextJob = 0 }
	collected[player] = {}
end

Players.PlayerRemoving:Connect(function(player)
	tracks[player] = nil
	collected[player] = nil
	coinBudget[player] = nil
end)

task.spawn(function()
	local STEP = 0.25
	local sinceBudget = 0
	while true do
		local dt = task.wait(STEP)
		sinceBudget += dt
		if sinceBudget >= 1 then
			sinceBudget = 0
			table.clear(coinBudget)
		end
		for player, t in tracks do
			local ok, err = pcall(function()
				update(player, t, dt)
			end)
			if not ok then
				warn("[Bike the World] reward update failed: " .. tostring(err))
			end
		end
	end
end)

return RewardService
