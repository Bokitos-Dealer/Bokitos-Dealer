--!strict
-- The travel menu: jump to any city, see which landmarks you have found
-- (your "passport"), or get unstuck.

local Players = game:GetService("Players")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Config = require(Shared.Config)
local State = require(script.Parent.State)
local Ui = require(script.Parent.Ui)

local C = Ui.Colors
local player = Players.LocalPlayer

local TravelUI = {}

local win: Frame
local content: Frame
local unstuck: () -> () = function() end

local FLAGS: { [string]: string } = { hub = "🌍", amsterdam = "🇳🇱", paris = "🇫🇷", newyork = "🇺🇸" }

local function render()
	for _, ch in content:GetChildren() do
		if ch.Name == "Grid" then
			ch:Destroy()
		end
	end
	local p = State.profile
	local grid = Ui.grid(content, Vector2.new(230, 330))
	grid.Name = "Grid"
	grid.Size = UDim2.new(1, 0, 1, -50)
	local worlds = { { id = "hub", name = "World Bike Hub", country = "Practice loop & shop", color = C.green } }
	for _, c in Config.Cities do
		table.insert(worlds, { id = c.id, name = c.name, country = c.country, color = c.color })
	end
	local here = State.city()
	for i, w in worlds do
		local f = Ui.new("Frame", { BackgroundColor3 = C.panel, LayoutOrder = i, Parent = grid }) :: Frame
		Ui.corner(f, 16)
		Ui.stroke(f, w.color, 4)
		Ui.label({ Position = UDim2.fromOffset(8, 8), Size = UDim2.new(1, -16, 0, 44), Text = (FLAGS[w.id] or "🏙️") .. " " .. w.name, TextColor3 = C.ink, TextStrokeTransparency = 1, MaxTextSize = 28, Parent = f })
		Ui.label({ Position = UDim2.fromOffset(8, 50), Size = UDim2.new(1, -16, 0, 20), Text = w.country, TextColor3 = C.grey, TextStrokeTransparency = 1, Font = Enum.Font.GothamBold, MaxTextSize = 15, Parent = f })
		-- passport stamps
		local list = Ui.new("Frame", { Position = UDim2.fromOffset(12, 76), Size = UDim2.new(1, -24, 1, -134), BackgroundTransparency = 1, Parent = f })
		Ui.new("UIListLayout", { Padding = UDim.new(0, 2), Parent = list })
		local found, total = 0, 0
		if p then
			for _, l in p.landmarkList do
				if l.city == w.id then
					total += 1
					local got = p.landmarks[l.id] == true
					if got then
						found += 1
					end
					Ui.label({
						Size = UDim2.new(1, 0, 0, 20),
						Text = if got then "✅ " .. l.name else "❓ ???",
						TextColor3 = if got then C.ink else C.grey,
						TextStrokeTransparency = 1,
						TextXAlignment = Enum.TextXAlignment.Left,
						Font = Enum.Font.GothamBold,
						MaxTextSize = 15,
						Parent = list,
					})
				end
			end
		end
		if total > 0 then
			Ui.label({ AnchorPoint = Vector2.new(0, 1), Position = UDim2.new(0, 12, 1, -56), Size = UDim2.new(1, -24, 0, 20), Text = string.format("📍 %d / %d landmarks", found, total), TextColor3 = C.orange, TextStrokeTransparency = 1, TextXAlignment = Enum.TextXAlignment.Left, MaxTextSize = 17, Parent = f })
		elseif w.id ~= "hub" then
			Ui.label({ Position = UDim2.fromOffset(12, 80), Size = UDim2.new(1, -24, 0, 40), Text = "Being built... 🧱", TextColor3 = C.grey, TextStrokeTransparency = 1, MaxTextSize = 18, Parent = f })
		end
		local isHere = here == w.id
		local b = Ui.button(if isHere then "You are here" else "Go! 🚲", if isHere then C.grey else w.color, {
			AnchorPoint = Vector2.new(0.5, 1),
			Position = UDim2.new(0.5, 0, 1, -10),
			Size = UDim2.new(1, -24, 0, 42),
			MaxTextSize = 24,
			Parent = f,
		})
		if not isHere then
			b.Activated:Connect(function()
				State.remote("GoToCity"):FireServer(w.id)
				win.Visible = false
			end)
		end
	end
end

function TravelUI.toggle()
	win.Visible = not win.Visible
	if win.Visible then
		render()
	end
end

function TravelUI.init(onUnstuck: () -> ())
	unstuck = onUnstuck
	local gui = Ui.new("ScreenGui", { Name = "Travel", ResetOnSpawn = false, DisplayOrder = 5, Parent = player:WaitForChild("PlayerGui") })
	win, content = Ui.window(gui, "🌍 Where do you want to ride?", C.blue)
	Ui.label({
		AnchorPoint = Vector2.new(1, 1),
		Position = UDim2.new(1, 0, 1, -4),
		Size = UDim2.new(0.4, 0, 0, 18),
		Text = "City maps © OpenStreetMap contributors",
		TextColor3 = C.grey,
		TextStrokeTransparency = 1,
		TextXAlignment = Enum.TextXAlignment.Right,
		Font = Enum.Font.GothamMedium,
		MaxTextSize = 13,
		Parent = content,
	})
	local stuck = Ui.button("😵 I'm stuck!", C.orange, { AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.new(0.5, 0, 1, 0), Size = UDim2.fromOffset(200, 42), MaxTextSize = 22, Parent = content })
	stuck.Activated:Connect(function()
		win.Visible = false
		unstuck()
	end)
	State.profileChanged.Event:Connect(function()
		if win.Visible then
			render()
		end
	end)
end

return TravelUI
