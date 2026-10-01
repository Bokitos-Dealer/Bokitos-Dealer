--!strict
-- Saves coins, bikes, cosmetics and discovered landmarks with DataStores.
-- In Studio, turn on "Enable Studio Access to API Services" (Game Settings >
-- Security) to test saving; without it the game still works, it just
-- doesn't remember anything.

local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Config = require(Shared.Config)

export type Profile = {
	coins: number,
	totalCoins: number,
	bikes: { [string]: boolean },
	colors: { [string]: boolean },
	cosmetics: { [string]: boolean },
	worn: { [string]: boolean },
	bike: string,
	color: string,
	landmarks: { [string]: boolean },
	deliveries: number,
	metres: number,
	lastDaily: number,
	receipts: { string },
}

local DataService = {}
DataService.profiles = {} :: { [Player]: Profile }
DataService.changed = Instance.new("BindableEvent")

local store: DataStore? = nil
local ok = pcall(function()
	store = DataStoreService:GetDataStore(Config.DataStoreName)
end)
if not ok then
	warn("[Bike the World] DataStores unavailable: progress will not be saved in this session.")
end

local function default(): Profile
	return {
		coins = 0,
		totalCoins = 0,
		bikes = { city = true },
		colors = { black = true, red = true },
		cosmetics = {},
		worn = {},
		bike = "city",
		color = "black",
		landmarks = {},
		deliveries = 0,
		metres = 0,
		lastDaily = 0,
		receipts = {},
	}
end

--- Fill in any fields missing from older saves.
local function reconcile(data: any): Profile
	local p = default()
	if type(data) ~= "table" then
		return p
	end
	for k, v in data do
		if (p :: any)[k] ~= nil and type(v) == type((p :: any)[k]) then
			(p :: any)[k] = v
		end
	end
	p.bikes.city = true
	p.colors.black = true
	p.colors.red = true
	return p
end

local function key(player: Player): string
	return "u_" .. player.UserId
end

function DataService.load(player: Player): Profile
	local data = nil
	local s = store
	if s then
		for attempt = 1, 3 do
			local okLoad, result = pcall(function()
				return s:GetAsync(key(player))
			end)
			if okLoad then
				data = result
				break
			end
			warn("[Bike the World] load failed (" .. attempt .. "): " .. tostring(result))
			task.wait(attempt)
		end
	end
	local profile = reconcile(data)
	DataService.profiles[player] = profile
	return profile
end

function DataService.save(player: Player): boolean
	local profile = DataService.profiles[player]
	local s = store
	if not profile or not s then
		return false
	end
	for attempt = 1, 3 do
		local okSave, err = pcall(function()
			s:UpdateAsync(key(player), function()
				return profile
			end)
		end)
		if okSave then
			return true
		end
		warn("[Bike the World] save failed (" .. attempt .. "): " .. tostring(err))
		task.wait(attempt)
	end
	return false
end

function DataService.get(player: Player): Profile?
	return DataService.profiles[player]
end

--- Tell listeners (leaderstats, the player's UI) that a profile changed.
function DataService.touch(player: Player)
	DataService.changed:Fire(player)
end

function DataService.release(player: Player)
	DataService.save(player)
	DataService.profiles[player] = nil
end

-- autosave every two minutes and when the server shuts down
task.spawn(function()
	while true do
		task.wait(120)
		for _, player in Players:GetPlayers() do
			task.spawn(DataService.save, player)
		end
	end
end)

game:BindToClose(function()
	if RunService:IsStudio() and not store then
		return
	end
	local pending = 0
	for _, player in Players:GetPlayers() do
		pending += 1
		task.spawn(function()
			DataService.save(player)
			pending -= 1
		end)
	end
	local t = os.clock()
	while pending > 0 and os.clock() - t < 25 do
		task.wait(0.1)
	end
end)

return DataService
