--!strict
-- The shop: buy bikes, colours and cosmetics with coins; Game Passes and
-- coin packs with Robux.

local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Config = require(Shared.Config)
local DataService = require(script.Parent.DataService)
local BikeService = require(script.Parent.BikeService)

local ShopService = {}
local passes: { [Player]: { [string]: boolean } } = {}
local toast: (Player, string, string?) -> () = function() end

function ShopService.hasPass(player: Player, key: string): boolean
	local p = passes[player]
	return p ~= nil and p[key] == true
end
BikeService.hasPass = ShopService.hasPass

local function passKeyById(id: number): string?
	for key, def in Config.GamePasses do
		if def.id ~= 0 and def.id == id then
			return key
		end
	end
	return nil
end

--- Give the items that come with a pass.
local function grantPass(player: Player, key: string)
	passes[player] = passes[player] or {}
	passes[player][key] = true
	local profile = DataService.get(player)
	if not profile then
		return
	end
	if key == "GoldenBike" then
		profile.bikes.golden = true
	end
	for _, c in Config.Cosmetics do
		if c.gamePass == key then
			profile.cosmetics[c.id] = true
		end
	end
	DataService.touch(player)
end

function ShopService.onJoin(player: Player, sendToast: (Player, string, string?) -> ())
	toast = sendToast
	passes[player] = {}
	for key, def in Config.GamePasses do
		if def.id ~= 0 then
			local ok, owns = pcall(function()
				return MarketplaceService:UserOwnsGamePassAsync(player.UserId, def.id)
			end)
			if ok and owns then
				grantPass(player, key)
			end
		end
	end
end

Players.PlayerRemoving:Connect(function(player)
	passes[player] = nil
end)

local function findItem(kind: string, id: string): any
	local list = if kind == "bike" then Config.Bikes elseif kind == "color" then Config.Colors elseif kind == "cosmetic" then Config.Cosmetics else nil
	if not list then
		return nil
	end
	for _, item in list :: { any } do
		if item.id == id then
			return item
		end
	end
	return nil
end

local function owned(profile: DataService.Profile, kind: string, id: string): boolean
	if kind == "bike" then
		return profile.bikes[id] == true
	elseif kind == "color" then
		return profile.colors[id] == true
	end
	return profile.cosmetics[id] == true
end

--- Buy an item with coins. Returns (ok, message).
function ShopService.buy(player: Player, kind: string, id: string): (boolean, string)
	local profile = DataService.get(player)
	local item = findItem(kind, id)
	if not profile or not item then
		return false, "That item does not exist."
	end
	if item.gamePass then
		return false, "This one is bought with Robux."
	end
	if owned(profile, kind, id) then
		return false, "You already have it."
	end
	if profile.coins < item.price then
		return false, string.format("You need %d more coins.", item.price - profile.coins)
	end
	profile.coins -= item.price
	if kind == "bike" then
		profile.bikes[id] = true
	elseif kind == "color" then
		profile.colors[id] = true
	else
		profile.cosmetics[id] = true
	end
	DataService.touch(player)
	task.spawn(DataService.save, player)
	return true, "Bought " .. item.name .. "!"
end

--- Equip a bike/colour or toggle a cosmetic. Returns (ok, message).
function ShopService.equip(player: Player, kind: string, id: string): (boolean, string)
	local profile = DataService.get(player)
	local item = findItem(kind, id)
	if not profile or not item then
		return false, "That item does not exist."
	end
	local has = owned(profile, kind, id)
	if item.gamePass then
		has = ShopService.hasPass(player, item.gamePass)
	end
	if not has then
		return false, "You don't own that yet."
	end
	if kind == "bike" then
		profile.bike = id
	elseif kind == "color" then
		profile.color = id
	else
		profile.worn[id] = not profile.worn[id]
	end
	DataService.touch(player)
	if BikeService.bikes[player] then
		BikeService.spawnBike(player)
	end
	return true, "Equipped " .. item.name .. "."
end

-- Robux: Game Passes ----------------------------------------------------------
MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player, passId, purchased)
	if not purchased then
		return
	end
	local key = passKeyById(passId)
	if key then
		grantPass(player, key)
		toast(player, "Thank you! " .. Config.GamePasses[key].name .. " unlocked.", "good")
		if BikeService.bikes[player] then
			BikeService.spawnBike(player)
		end
	end
end)

-- Robux: Developer Products (coin packs) ---------------------------------------
-- ProcessReceipt must be safe to call more than once for the same purchase:
-- we remember receipt ids in the save file and only grant each one once.
MarketplaceService.ProcessReceipt = function(info)
	local player = Players:GetPlayerByUserId(info.PlayerId)
	if not player then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	local profile = DataService.get(player)
	if not profile then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	local receipt = tostring(info.PurchaseId)
	if table.find(profile.receipts, receipt) then
		return Enum.ProductPurchaseDecision.PurchaseGranted
	end
	local pack = nil
	for _, p in Config.Products do
		if p.id ~= 0 and p.id == info.ProductId then
			pack = p
		end
	end
	if not pack then
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	profile.coins += pack.coins
	table.insert(profile.receipts, receipt)
	while #profile.receipts > 60 do
		table.remove(profile.receipts, 1)
	end
	if not DataService.save(player) then
		-- undo so Roblox retries later, and the coins are never lost
		profile.coins -= pack.coins
		table.remove(profile.receipts)
		return Enum.ProductPurchaseDecision.NotProcessedYet
	end
	DataService.touch(player)
	toast(player, string.format("Thank you! +%d coins.", pack.coins), "good")
	return Enum.ProductPurchaseDecision.PurchaseGranted
end

return ShopService
