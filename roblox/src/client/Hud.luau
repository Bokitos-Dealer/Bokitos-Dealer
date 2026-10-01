--!strict
-- The on-screen display: coins, landmarks, speed and boost, messages, the
-- landmark card, the delivery panel with its arrow, and the big buttons.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Config = require(Shared.Config)
local State = require(script.Parent.State)
local Ui = require(script.Parent.Ui)
local Sfx = require(script.Parent.Sfx)

local C = Ui.Colors

local Hud = {}

export type Callbacks = {
	shop: () -> (),
	travel: () -> (),
	bike: () -> (),
	camera: () -> (),
	bell: () -> (),
}

local gui: ScreenGui
local coinLabel: TextLabel
local coinPill: Frame
local landmarkLabel: TextLabel
local toastList: Frame
local speedLabel: TextLabel
local speedFrame: Frame
local staminaFill: Frame
local deliveryFrame: Frame
local deliveryTitle: TextLabel
local deliveryInfo: TextLabel
local deliveryArrow: TextLabel
local banner: TextLabel
local splashLabel: TextLabel
local mobileButtons: Frame
local helpLabel: TextLabel

local shownCoins = 0
local targetCoins = 0

local CITY_FLAGS: { [string]: string } = {
	hub = "🌍",
	amsterdam = "🇳🇱",
	paris = "🇫🇷",
	newyork = "🇺🇸",
}
Hud.flags = CITY_FLAGS

local function cityName(id: string): string
	if id == "hub" then
		return "World Bike Hub"
	end
	for _, c in Config.Cities do
		if c.id == id then
			return c.name
		end
	end
	return id
end
Hud.cityName = cityName

--- A message that pops in at the top and fades away.
function Hud.toast(text: string, kind: string?)
	local color = if kind == "good" then C.green elseif kind == "bad" then C.red elseif kind == "city" then C.blue else C.panelDark
	local f = Ui.new("Frame", {
		Size = UDim2.new(1, 0, 0, 44),
		BackgroundColor3 = color,
		BackgroundTransparency = 0.1,
		Parent = toastList,
	}) :: Frame
	Ui.corner(f, 12)
	Ui.stroke(f, Color3.fromRGB(20, 24, 40), 2)
	Ui.label({ Size = UDim2.fromScale(1, 1), Text = text, MaxTextSize = 24, TextStrokeTransparency = 0.8, Parent = f })
	Ui.pad(f, 6)
	Ui.pop(f, 1.1)
	task.delay(4, function()
		Ui.tween(f, 0.4, { BackgroundTransparency = 1 })
		for _, d in f:GetDescendants() do
			if d:IsA("TextLabel") then
				Ui.tween(d, 0.4, { TextTransparency = 1, TextStrokeTransparency = 1 })
			elseif d:IsA("UIStroke") then
				Ui.tween(d, 0.4, { Transparency = 1 })
			end
		end
		task.wait(0.45)
		f:Destroy()
	end)
	-- keep at most 4 messages
	local frames = {}
	for _, ch in toastList:GetChildren() do
		if ch:IsA("Frame") then
			table.insert(frames, ch)
		end
	end
	if #frames > 4 then
		frames[1]:Destroy()
	end
end

--- "+5" flying up from the coin counter.
function Hud.coins(amount: number, reason: string?)
	local big = reason == "landmark" or reason == "delivery" or reason == "daily"
	local l = Ui.label({
		AnchorPoint = Vector2.new(0, 0.5),
		Position = UDim2.new(0, 190, 0, 30),
		Size = UDim2.fromOffset(160, if big then 50 else 34),
		Text = "+" .. amount .. " 🪙",
		TextColor3 = C.gold,
		TextStrokeTransparency = 0,
		TextXAlignment = Enum.TextXAlignment.Left,
		MaxTextSize = if big then 44 else 30,
		Parent = gui,
	})
	Ui.tween(l, 1.2, { Position = UDim2.new(0, 190, 0, -10), TextTransparency = 1, TextStrokeTransparency = 1 })
	task.delay(1.3, function()
		l:Destroy()
	end)
	if reason ~= "coin" then
		Sfx.play("Coin", nil, 0.5, 0.8)
	end
end

--- The "you found a landmark" card.
function Hud.landmark(info: { [string]: any })
	Sfx.play("Landmark", nil, 0.8)
	local card = Ui.new("Frame", {
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 70),
		Size = UDim2.new(0.9, 0, 0, 210),
		BackgroundColor3 = C.panel,
		Parent = gui,
	}) :: Frame
	Ui.new("UISizeConstraint", { MaxSize = Vector2.new(520, 260), Parent = card })
	Ui.corner(card, 20)
	Ui.stroke(card, C.gold, 5)
	Ui.pad(card, 14)
	Ui.label({ Size = UDim2.new(1, 0, 0, 30), Text = "📍 New landmark found!", TextColor3 = C.orange, TextStrokeTransparency = 1, MaxTextSize = 26, Parent = card })
	Ui.label({ Position = UDim2.new(0, 0, 0, 32), Size = UDim2.new(1, 0, 0, 44), Text = tostring(info.name), TextColor3 = C.ink, TextStrokeTransparency = 1, MaxTextSize = 40, Parent = card })
	Ui.label({
		Position = UDim2.new(0, 0, 0, 80),
		Size = UDim2.new(1, 0, 0, 70),
		Text = tostring(info.fact),
		TextColor3 = C.ink,
		TextStrokeTransparency = 1,
		TextWrapped = true,
		Font = Enum.Font.GothamMedium,
		MaxTextSize = 20,
		Parent = card,
	})
	Ui.label({
		Position = UDim2.new(0, 0, 1, -34),
		Size = UDim2.new(0.6, 0, 0, 34),
		Text = string.format("+%d 🪙   (%d found)", info.coins or 0, info.found or 0),
		TextColor3 = C.orange,
		TextStrokeTransparency = 1,
		TextXAlignment = Enum.TextXAlignment.Left,
		MaxTextSize = 26,
		Parent = card,
	})
	local ok = Ui.button("Cool!", C.green, { AnchorPoint = Vector2.new(1, 1), Position = UDim2.new(1, 0, 1, 0), Size = UDim2.fromOffset(110, 40), Parent = card })
	ok.Activated:Connect(function()
		card:Destroy()
	end)
	Ui.pop(card, 0.6)
	task.delay(10, function()
		if card.Parent then
			card:Destroy()
		end
	end)
end

function Hud.splash()
	splashLabel.Visible = true
	splashLabel.TextTransparency = 0
	splashLabel.TextStrokeTransparency = 0
	Ui.pop(splashLabel, 1.6)
	task.delay(0.9, function()
		Ui.tween(splashLabel, 0.4, { TextTransparency = 1, TextStrokeTransparency = 1 })
	end)
end

local function showBanner(id: string)
	banner.Text = (CITY_FLAGS[id] or "") .. "  " .. string.upper(cityName(id))
	banner.TextTransparency = 0
	banner.TextStrokeTransparency = 0
	Ui.pop(banner, 1.3)
	task.delay(3, function()
		Ui.tween(banner, 0.8, { TextTransparency = 1, TextStrokeTransparency = 1 })
	end)
end

--- Delivery messages from the server.
function Hud.delivery(data: { [string]: any })
	if data.state == "start" then
		State.delivery = {
			item = data.item,
			shop = data.shop,
			to = data.to,
			limit = data.limit,
			started = os.clock(),
			metres = data.metres,
		}
		Hud.toast("📦 Order! Bring " .. tostring(data.item) .. " to the glowing marker.", "good")
	elseif data.state == "done" then
		State.delivery = nil
		local msg = if data.fast then "Super fast delivery! +" else "Delivered! +"
		Hud.toast("🎉 " .. msg .. tostring(data.coins) .. " coins", "good")
	else
		State.delivery = nil
		Hud.toast("Delivery cancelled.", "info")
	end
	State.deliveryChanged:Fire()
end

local function updateProfile()
	local p = State.profile
	if not p then
		return
	end
	if p.coins > targetCoins then
		Ui.pop(coinPill, 1.15)
	end
	targetCoins = p.coins
	landmarkLabel.Text = string.format("📍 %d / %d", p.found, p.totalLandmarks)
end

local function sideButton(parent: Instance, icon: string, caption: string, color: Color3, order: number, onClick: () -> ())
	local holder = Ui.new("Frame", { Size = UDim2.fromOffset(72, 86), BackgroundTransparency = 1, LayoutOrder = order, Parent = parent })
	local b = Ui.button(icon, color, { Size = UDim2.fromOffset(64, 64), Position = UDim2.fromOffset(4, 0), MaxTextSize = 36, Parent = holder })
	Ui.label({ Position = UDim2.fromOffset(0, 64), Size = UDim2.fromOffset(72, 20), Text = caption, MaxTextSize = 16, TextStrokeTransparency = 0.3, Parent = holder })
	b.Activated:Connect(onClick)
	return b
end

local function onRender()
	-- count coins up smoothly
	if shownCoins ~= targetCoins then
		local diff = targetCoins - shownCoins
		local stepBy = math.max(1, math.floor(math.abs(diff) / 12))
		shownCoins += if diff > 0 then math.min(diff, stepBy) else math.max(diff, -stepBy)
		coinLabel.Text = Ui.commas(shownCoins)
	end
	-- speed and boost
	local ride = State.ride
	speedFrame.Visible = ride.onBike
	mobileButtons.Visible = ride.onBike and State.isTouch()
	if ride.onBike then
		speedLabel.Text = tostring(math.floor(math.abs(ride.speed) * 3.6 + 0.5))
		staminaFill.Size = UDim2.fromScale(math.clamp(ride.stamina, 0, 1), 1)
		staminaFill.BackgroundColor3 = if ride.boosting then C.orange else C.gold
	end
	-- delivery arrow and countdown
	local d = State.delivery
	deliveryFrame.Visible = d ~= nil
	if d then
		local me = ride.pos
		if not ride.onBike then
			local char = Players.LocalPlayer.Character
			local hrp = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
			if hrp then
				me = hrp.Position
			end
		end
		local dir = Vector3.new(d.to.X - me.X, 0, d.to.Z - me.Z)
		local metres = dir.Magnitude / Config.M
		local cam = Workspace.CurrentCamera.CFrame
		local look = Vector3.new(cam.LookVector.X, 0, cam.LookVector.Z)
		local right = Vector3.new(cam.RightVector.X, 0, cam.RightVector.Z)
		if dir.Magnitude > 0.1 and look.Magnitude > 0.01 then
			deliveryArrow.Rotation = math.deg(math.atan2(dir:Dot(right.Unit), dir:Dot(look.Unit)))
		end
		local left = d.limit - (os.clock() - d.started)
		local timeText = if left > 0 then string.format("⏱ %d:%02d", math.floor(left / 60), math.floor(left % 60)) else "Take your time!"
		deliveryTitle.Text = "📦 Bring " .. d.item
		deliveryInfo.Text = string.format("%d m   %s", math.floor(metres), timeText)
	end
end

function Hud.init(cb: Callbacks)
	gui = Ui.new("ScreenGui", {
		Name = "Hud",
		ResetOnSpawn = false,
		ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
		Parent = Players.LocalPlayer:WaitForChild("PlayerGui"),
	})

	-- coins and landmarks (top left)
	coinPill = Ui.new("Frame", { Position = UDim2.fromOffset(12, 10), Size = UDim2.fromOffset(170, 46), BackgroundColor3 = C.panelDark, BackgroundTransparency = 0.15, Parent = gui })
	Ui.corner(coinPill, 23)
	Ui.stroke(coinPill, C.gold, 3)
	Ui.label({ Position = UDim2.fromOffset(8, 4), Size = UDim2.fromOffset(38, 38), Text = "🪙", Parent = coinPill })
	coinLabel = Ui.label({ Position = UDim2.fromOffset(50, 4), Size = UDim2.new(1, -60, 0, 38), Text = "0", TextXAlignment = Enum.TextXAlignment.Left, TextColor3 = C.gold, MaxTextSize = 30, Parent = coinPill })
	local lmPill = Ui.new("Frame", { Position = UDim2.fromOffset(12, 62), Size = UDim2.fromOffset(130, 34), BackgroundColor3 = C.panelDark, BackgroundTransparency = 0.15, Parent = gui })
	Ui.corner(lmPill, 17)
	landmarkLabel = Ui.label({ Size = UDim2.fromScale(1, 1), Text = "📍 0 / 0", MaxTextSize = 22, Parent = lmPill })

	-- delivery panel
	deliveryFrame = Ui.new("Frame", { Position = UDim2.fromOffset(12, 104), Size = UDim2.fromOffset(250, 96), BackgroundColor3 = C.panel, Visible = false, Parent = gui })
	Ui.corner(deliveryFrame, 16)
	Ui.stroke(deliveryFrame, C.orange, 3)
	deliveryTitle = Ui.label({ Position = UDim2.fromOffset(10, 6), Size = UDim2.new(1, -84, 0, 30), Text = "", TextColor3 = C.ink, TextStrokeTransparency = 1, TextXAlignment = Enum.TextXAlignment.Left, MaxTextSize = 22, Parent = deliveryFrame })
	deliveryInfo = Ui.label({ Position = UDim2.fromOffset(10, 38), Size = UDim2.new(1, -84, 0, 24), Text = "", TextColor3 = C.blue, TextStrokeTransparency = 1, TextXAlignment = Enum.TextXAlignment.Left, MaxTextSize = 20, Parent = deliveryFrame })
	deliveryArrow = Ui.label({ AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.new(1, -40, 0.5, 0), Size = UDim2.fromOffset(60, 60), Text = "⬆", TextColor3 = C.orange, TextStrokeTransparency = 0, MaxTextSize = 56, Parent = deliveryFrame })
	local cancel = Ui.button("Cancel", C.grey, { Position = UDim2.fromOffset(10, 66), Size = UDim2.fromOffset(80, 24), MaxTextSize = 16, Parent = deliveryFrame })
	cancel.Activated:Connect(function()
		State.remote("CancelDelivery"):FireServer()
	end)

	-- messages
	toastList = Ui.new("Frame", { AnchorPoint = Vector2.new(0.5, 0), Position = UDim2.new(0.5, 0, 0, 10), Size = UDim2.new(0.5, 0, 0, 220), BackgroundTransparency = 1, Parent = gui })
	Ui.new("UISizeConstraint", { MaxSize = Vector2.new(560, 220), MinSize = Vector2.new(260, 0), Parent = toastList })
	Ui.new("UIListLayout", { Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder, Parent = toastList })

	banner = Ui.label({ AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.3), Size = UDim2.new(0.8, 0, 0, 80), Text = "", TextTransparency = 1, TextStrokeTransparency = 1, TextColor3 = Color3.new(1, 1, 1), MaxTextSize = 72, Parent = gui })
	splashLabel = Ui.label({ AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.45), Size = UDim2.new(0.8, 0, 0, 90), Text = "SPLASH! 💦", TextColor3 = Color3.fromRGB(120, 200, 255), Visible = false, MaxTextSize = 80, Parent = gui })

	-- speed and boost (bottom centre)
	speedFrame = Ui.new("Frame", { AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.new(0.5, 0, 1, -14), Size = UDim2.fromOffset(190, 74), BackgroundColor3 = C.panelDark, BackgroundTransparency = 0.2, Visible = false, Parent = gui })
	Ui.corner(speedFrame, 18)
	speedLabel = Ui.label({ Position = UDim2.fromOffset(10, 4), Size = UDim2.fromOffset(90, 46), Text = "0", MaxTextSize = 44, TextXAlignment = Enum.TextXAlignment.Right, Parent = speedFrame })
	Ui.label({ Position = UDim2.fromOffset(106, 16), Size = UDim2.fromOffset(70, 26), Text = "km/h", MaxTextSize = 20, TextXAlignment = Enum.TextXAlignment.Left, Parent = speedFrame })
	local bar = Ui.new("Frame", { Position = UDim2.new(0, 34, 1, -18), Size = UDim2.new(1, -46, 0, 10), BackgroundColor3 = Color3.fromRGB(60, 66, 90), Parent = speedFrame })
	Ui.corner(bar, 5)
	staminaFill = Ui.new("Frame", { Size = UDim2.fromScale(1, 1), BackgroundColor3 = C.gold, Parent = bar })
	Ui.corner(staminaFill, 5)
	Ui.label({ Position = UDim2.new(0, 8, 1, -24), Size = UDim2.fromOffset(22, 22), Text = "⚡", Parent = speedFrame })

	-- big menu buttons (right side)
	local side = Ui.new("Frame", { AnchorPoint = Vector2.new(1, 0.5), Position = UDim2.new(1, -8, 0.45, 0), Size = UDim2.fromOffset(72, 4 * 92), BackgroundTransparency = 1, Parent = gui })
	Ui.new("UIListLayout", { Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder, Parent = side })
	sideButton(side, "🛒", "Shop", C.green, 1, cb.shop)
	sideButton(side, "🌍", "Travel", C.blue, 2, cb.travel)
	sideButton(side, "🚲", "Bike", C.orange, 3, cb.bike)
	sideButton(side, "🎥", "Camera", C.purple, 4, cb.camera)

	-- touch buttons while riding
	mobileButtons = Ui.new("Frame", { AnchorPoint = Vector2.new(1, 1), Position = UDim2.new(1, -16, 1, -16), Size = UDim2.fromOffset(200, 110), BackgroundTransparency = 1, Visible = false, Parent = gui })
	local boost = Ui.button("⚡", C.orange, { AnchorPoint = Vector2.new(1, 1), Position = UDim2.fromScale(1, 1), Size = UDim2.fromOffset(100, 100), MaxTextSize = 54, Parent = mobileButtons })
	boost.MouseButton1Down:Connect(function()
		State.touchBoost = true
	end)
	boost.MouseButton1Up:Connect(function()
		State.touchBoost = false
	end)
	boost.MouseLeave:Connect(function()
		State.touchBoost = false
	end)
	local bell = Ui.button("🔔", C.gold, { AnchorPoint = Vector2.new(1, 1), Position = UDim2.new(1, -112, 1, -10), Size = UDim2.fromOffset(76, 76), MaxTextSize = 40, Parent = mobileButtons })
	bell.Activated:Connect(cb.bell)

	-- how to play (keyboard), fades after a while
	if not State.isTouch() then
		helpLabel = Ui.label({
			AnchorPoint = Vector2.new(0.5, 1),
			Position = UDim2.new(0.5, 0, 1, -96),
			Size = UDim2.new(0.8, 0, 0, 26),
			Text = "W / S  pedal & brake   •   A / D  steer   •   Shift  boost   •   Space  bell   •   C  camera",
			MaxTextSize = 20,
			TextStrokeTransparency = 0.3,
			Parent = gui,
		})
		task.delay(60, function()
			Ui.tween(helpLabel, 2, { TextTransparency = 1, TextStrokeTransparency = 1 })
		end)
	end

	State.profileChanged.Event:Connect(updateProfile)
	updateProfile()
	local lastCity = State.city()
	Players.LocalPlayer:GetAttributeChangedSignal("City"):Connect(function()
		local now = State.city()
		if now ~= lastCity then
			lastCity = now
			showBanner(now)
		end
	end)
	RunService.RenderStepped:Connect(onRender)
end

return Hud
