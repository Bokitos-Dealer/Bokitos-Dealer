--!strict
-- The shop: bikes, colours and extras for coins, and the Robux items.

local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Config = require(Shared.Config)
local State = require(script.Parent.State)
local Ui = require(script.Parent.Ui)
local Sfx = require(script.Parent.Sfx)

local C = Ui.Colors
local player = Players.LocalPlayer

local ShopUI = {}

local win: Frame
local content: Frame
local tabButtons: { [string]: TextButton } = {}
local current = "bikes"
local toast: (string, string?) -> () = function() end
local priceCache: { [number]: number } = {}

local COSMETIC_ICONS: { [string]: string } = {
	helmet = "⛑️",
	flowers = "💐",
	streamers = "🎏",
	rainbow = "🌈",
	puppy = "🐶",
}
local PASS_ICONS: { [string]: string } = {
	DoubleCoins = "💰",
	GoldenBike = "🏆",
	RainbowTrail = "🌈",
	Puppy = "🐶",
}

local function priceOf(id: number, infoType: Enum.InfoType): number?
	if priceCache[id] then
		return priceCache[id]
	end
	local ok, info = pcall(function()
		return MarketplaceService:GetProductInfoAsync(id, infoType)
	end)
	if not ok then
		ok, info = pcall(function()
			return (MarketplaceService :: any):GetProductInfo(id, infoType)
		end)
	end
	if ok and type(info) == "table" and type(info.PriceInRobux) == "number" then
		priceCache[id] = info.PriceInRobux
		return info.PriceInRobux
	end
	return nil
end

local function card(order: number, accent: Color3): Frame
	local f = Ui.new("Frame", { BackgroundColor3 = C.panel, LayoutOrder = order }) :: Frame
	Ui.corner(f, 16)
	Ui.stroke(f, accent, 3)
	return f
end

local function title(f: Frame, text: string, y: number)
	Ui.label({ Position = UDim2.fromOffset(8, y), Size = UDim2.new(1, -16, 0, 28), Text = text, TextColor3 = C.ink, TextStrokeTransparency = 1, MaxTextSize = 24, Parent = f })
end

local function desc(f: Frame, text: string, y: number, h: number?)
	Ui.label({
		Position = UDim2.fromOffset(10, y),
		Size = UDim2.new(1, -20, 0, h or 34),
		Text = text,
		TextColor3 = Color3.fromRGB(90, 96, 115),
		TextStrokeTransparency = 1,
		TextWrapped = true,
		Font = Enum.Font.GothamMedium,
		MaxTextSize = 14,
		Parent = f,
	})
end

local function actionButton(f: Frame, text: string, color: Color3, onClick: (() -> ())?): TextButton
	local b = Ui.button(text, color, { AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.new(0.5, 0, 1, -10), Size = UDim2.new(1, -24, 0, 40), MaxTextSize = 22, Parent = f })
	if onClick then
		b.Activated:Connect(onClick)
	else
		b.AutoButtonColor = false
	end
	return b
end

local function statBar(f: Frame, y: number, label: string, value: number, color: Color3)
	Ui.label({ Position = UDim2.fromOffset(10, y), Size = UDim2.fromOffset(70, 16), Text = label, TextColor3 = C.ink, TextStrokeTransparency = 1, TextXAlignment = Enum.TextXAlignment.Left, Font = Enum.Font.GothamBold, MaxTextSize = 13, Parent = f })
	local back = Ui.new("Frame", { Position = UDim2.fromOffset(80, y + 3), Size = UDim2.new(1, -92, 0, 10), BackgroundColor3 = Color3.fromRGB(225, 229, 238), Parent = f })
	Ui.corner(back, 5)
	local fill = Ui.new("Frame", { Size = UDim2.fromScale(math.clamp(value, 0.05, 1), 1), BackgroundColor3 = color, Parent = back })
	Ui.corner(fill, 5)
end

-- talking to the server ------------------------------------------------------------
local function buy(kind: string, id: string)
	local ok, msg = State.func("Buy"):InvokeServer(kind, id)
	toast(tostring(msg), if ok then "good" else "bad")
	if ok then
		Sfx.play("Purchase")
		State.func("Equip"):InvokeServer(kind, id)
	end
end

local function equip(kind: string, id: string)
	local ok, msg = State.func("Equip"):InvokeServer(kind, id)
	if not ok then
		toast(tostring(msg), "bad")
	end
end

local function promptPass(key: string)
	local def = Config.GamePasses[key]
	if not def or def.id == 0 then
		toast("Coming soon!", "info")
		return
	end
	MarketplaceService:PromptGamePassPurchase(player, def.id)
end

local function promptProduct(id: number)
	if id == 0 then
		toast("Coming soon!", "info")
		return
	end
	MarketplaceService:PromptProductPurchase(player, id)
end

--- Text for a Robux button; fills in the real price when Roblox tells us.
local function robuxButton(f: Frame, id: number, infoType: Enum.InfoType, onClick: () -> ()): TextButton
	if id == 0 then
		return actionButton(f, "Coming soon", C.grey, onClick)
	end
	local b = actionButton(f, "⭐ Robux", C.purple, onClick)
	task.spawn(function()
		local price = priceOf(id, infoType)
		if price and b.Parent then
			b.Text = "R$ " .. price
		end
	end)
	return b
end

-- tabs --------------------------------------------------------------------------------
local function renderBikes(grid: ScrollingFrame, p: State.Profile)
	for i, def in Config.Bikes do
		local owned = if def.gamePass then p.passes[def.gamePass] == true else p.bikes[def.id] == true
		local f = card(i, if def.gamePass then C.gold else C.blue)
		local sw = Ui.new("Frame", { Position = UDim2.fromOffset(10, 10), Size = UDim2.fromOffset(36, 36), BackgroundColor3 = def.color, Parent = f })
		Ui.corner(sw, 18)
		Ui.label({ Position = UDim2.fromOffset(10, 10), Size = UDim2.fromOffset(36, 36), Text = "🚲", MaxTextSize = 24, Parent = f })
		Ui.label({ Position = UDim2.fromOffset(52, 12), Size = UDim2.new(1, -60, 0, 30), Text = def.name, TextColor3 = C.ink, TextStrokeTransparency = 1, TextXAlignment = Enum.TextXAlignment.Left, MaxTextSize = 22, Parent = f })
		desc(f, def.description, 50)
		statBar(f, 88, "Speed", (def.topSpeed - 5) / 6.5, C.red)
		statBar(f, 106, "Power", def.power / 1.8, C.orange)
		statBar(f, 124, "Steering", def.handling / 1.35, C.green)
		if owned then
			if p.bike == def.id then
				actionButton(f, "Riding ✓", C.grey, nil)
			else
				actionButton(f, "Ride it!", C.green, function()
					equip("bike", def.id)
				end)
			end
		elseif def.gamePass then
			local gp = def.gamePass :: string
			robuxButton(f, Config.GamePasses[gp].id, Enum.InfoType.GamePass, function()
				promptPass(gp)
			end)
		else
			local afford = p.coins >= def.price
			actionButton(f, "🪙 " .. Ui.commas(def.price), if afford then C.orange else C.grey, function()
				buy("bike", def.id)
			end)
		end
		f.Parent = grid
	end
end

local function renderColors(grid: ScrollingFrame, p: State.Profile)
	for i, def in Config.Colors do
		local owned = p.colors[def.id] == true
		local f = card(i, def.color)
		local sw = Ui.new("Frame", { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 14), Size = UDim2.fromOffset(70, 70), BackgroundColor3 = def.color, Parent = f })
		Ui.corner(sw, 35)
		Ui.stroke(sw, Color3.fromRGB(20, 24, 40), 3)
		title(f, def.name, 90)
		if owned then
			if p.color == def.id then
				actionButton(f, "Using ✓", C.grey, nil)
			else
				actionButton(f, "Paint!", C.green, function()
					equip("color", def.id)
				end)
			end
		else
			actionButton(f, "🪙 " .. def.price, if p.coins >= def.price then C.orange else C.grey, function()
				buy("color", def.id)
			end)
		end
		f.Parent = grid
	end
	desc(Ui.new("Frame", { BackgroundTransparency = 1, LayoutOrder = 99, Parent = grid }), "The Golden Bike always stays gold.", 0, 30)
end

local function renderExtras(grid: ScrollingFrame, p: State.Profile)
	for i, def in Config.Cosmetics do
		local owned = if def.gamePass then p.passes[def.gamePass] == true else p.cosmetics[def.id] == true
		local f = card(i, if def.gamePass then C.gold else C.green)
		Ui.label({ AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 10), Size = UDim2.fromOffset(70, 60), Text = COSMETIC_ICONS[def.id] or "🎁", MaxTextSize = 52, Parent = f })
		title(f, def.name, 72)
		desc(f, def.description, 100)
		if owned then
			local wearing = p.worn[def.id] == true
			actionButton(f, if wearing then "Take off" else "Put on!", if wearing then C.grey else C.green, function()
				equip("cosmetic", def.id)
			end)
		elseif def.gamePass then
			local gp = def.gamePass :: string
			robuxButton(f, Config.GamePasses[gp].id, Enum.InfoType.GamePass, function()
				promptPass(gp)
			end)
		else
			actionButton(f, "🪙 " .. def.price, if p.coins >= def.price then C.orange else C.grey, function()
				buy("cosmetic", def.id)
			end)
		end
		f.Parent = grid
	end
end

local function renderRobux(grid: ScrollingFrame, p: State.Profile)
	local order = 0
	local keys = {}
	for key in Config.GamePasses do
		table.insert(keys, key)
	end
	table.sort(keys)
	for _, key in keys do
		local def = Config.GamePasses[key]
		order += 1
		local f = card(order, C.gold)
		Ui.label({ AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 10), Size = UDim2.fromOffset(70, 60), Text = PASS_ICONS[key] or "⭐", MaxTextSize = 52, Parent = f })
		title(f, def.name, 72)
		desc(f, def.description, 100)
		if p.passes[key] then
			actionButton(f, "Owned ✓", C.grey, nil)
		else
			robuxButton(f, def.id, Enum.InfoType.GamePass, function()
				promptPass(key)
			end)
		end
		f.Parent = grid
	end
	for _, prod in Config.Products do
		order += 1
		local f = card(order, C.orange)
		Ui.label({ AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 10), Size = UDim2.fromOffset(70, 60), Text = "🪙", MaxTextSize = 52, Parent = f })
		title(f, Ui.commas(prod.coins) .. " coins", 72)
		desc(f, "A bag of coins for the bike shop.", 100)
		robuxButton(f, prod.id, Enum.InfoType.Product, function()
			promptProduct(prod.id)
		end)
		f.Parent = grid
	end
end

local function render()
	for _, ch in content:GetChildren() do
		if ch.Name == "Grid" then
			ch:Destroy()
		end
	end
	for name, b in tabButtons do
		b.BackgroundColor3 = if name == current then C.blue else C.grey
	end
	local p = State.profile
	if not p then
		return
	end
	local grid = Ui.grid(content, Vector2.new(190, 210))
	grid.Name = "Grid"
	grid.Position = UDim2.fromOffset(0, 54)
	grid.Size = UDim2.new(1, 0, 1, -54)
	if current == "bikes" then
		renderBikes(grid, p)
	elseif current == "colors" then
		renderColors(grid, p)
	elseif current == "extras" then
		renderExtras(grid, p)
	else
		renderRobux(grid, p)
	end
end

function ShopUI.open(tab: string?)
	if tab then
		current = tab
	end
	win.Visible = true
	render()
end

function ShopUI.toggle()
	if win.Visible then
		win.Visible = false
	else
		ShopUI.open()
	end
end

function ShopUI.init(sendToast: (string, string?) -> ())
	toast = sendToast
	local gui = Ui.new("ScreenGui", { Name = "Shop", ResetOnSpawn = false, DisplayOrder = 5, Parent = player:WaitForChild("PlayerGui") })
	win, content = Ui.window(gui, "🛒 Bike Shop", C.green)
	local tabs = Ui.new("Frame", { Size = UDim2.new(1, 0, 0, 46), BackgroundTransparency = 1, Parent = content })
	Ui.new("UIListLayout", { FillDirection = Enum.FillDirection.Horizontal, Padding = UDim.new(0, 8), HorizontalAlignment = Enum.HorizontalAlignment.Center, Parent = tabs })
	for i, t in { { "bikes", "🚲 Bikes" }, { "colors", "🎨 Colours" }, { "extras", "🎁 Extras" }, { "robux", "⭐ Robux" } } do
		local b = Ui.button(t[2], C.grey, { Size = UDim2.new(0.24, -6, 1, 0), LayoutOrder = i, MaxTextSize = 22, Parent = tabs })
		tabButtons[t[1]] = b
		b.Activated:Connect(function()
			current = t[1]
			render()
		end)
	end
	State.profileChanged.Event:Connect(function()
		if win.Visible then
			render()
		end
	end)
end

return ShopUI
