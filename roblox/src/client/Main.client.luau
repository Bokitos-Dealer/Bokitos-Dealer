--!strict
-- Bike the World: client start-up. Wires the HUD, menus, the bike and the
-- city effects to the server's messages.

local Client = script.Parent
local State = require(Client:WaitForChild("State"))
local Hud = require(Client:WaitForChild("Hud"))
local ShopUI = require(Client:WaitForChild("ShopUI"))
local TravelUI = require(Client:WaitForChild("TravelUI"))
local BikeController = require(Client:WaitForChild("BikeController"))
local BikeCamera = require(Client:WaitForChild("BikeCamera"))
local Animator = require(Client:WaitForChild("Animator"))
local Effects = require(Client:WaitForChild("Effects"))
local Traffic = require(Client:WaitForChild("Traffic"))
local Sfx = require(Client:WaitForChild("Sfx"))

Hud.init({
	shop = function()
		ShopUI.toggle()
	end,
	travel = function()
		TravelUI.toggle()
	end,
	bike = function()
		State.remote("ToggleBike"):FireServer()
	end,
	camera = function()
		State.cameraMode = if State.cameraMode == "chase" then "first" else "chase"
	end,
	bell = function()
		BikeController.ringBell()
	end,
})
ShopUI.init(Hud.toast)
TravelUI.init(function()
	if State.ride.onBike then
		BikeController.unstuck()
	else
		State.remote("GoToCity"):FireServer(State.city())
	end
end)
BikeController.init()
BikeCamera.init()
Animator.init()
Effects.init(BikeController.splashed.Event)
Traffic.init()

BikeController.splashed.Event:Connect(function()
	Hud.splash()
end)
BikeController.bumped.Event:Connect(function(speed: number)
	BikeCamera.bump(speed)
end)

-- messages from the server
State.remote("Profile").OnClientEvent:Connect(function(p)
	State.setProfile(p)
end)
State.remote("Toast").OnClientEvent:Connect(function(text: string, kind: string?)
	Hud.toast(text, kind)
end)
State.remote("Coins").OnClientEvent:Connect(function(amount: number, reason: string?)
	Hud.coins(amount, reason)
end)
State.remote("Landmark").OnClientEvent:Connect(function(info)
	Hud.landmark(info)
end)
State.remote("Delivery").OnClientEvent:Connect(function(data)
	Hud.delivery(data)
end)
State.remote("OpenShop").OnClientEvent:Connect(function()
	ShopUI.open()
end)
State.remote("BellRang").OnClientEvent:Connect(function(bike: Instance?)
	local bell = bike and bike:FindFirstChild("Bell", true)
	if bell and bell:IsA("BasePart") then
		Sfx.bell(bell)
	end
end)

-- first profile
task.spawn(function()
	for _ = 1, 20 do
		local ok, p = pcall(function()
			return State.func("GetProfile"):InvokeServer()
		end)
		if ok and p then
			State.setProfile(p)
			return
		end
		task.wait(1)
	end
end)
