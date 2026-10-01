--!strict
-- Client-side shared state: the player's profile, the current ride and the
-- delivery job. Other client modules read this and listen for changes.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

export type Profile = {
	coins: number,
	bikes: { [string]: boolean },
	colors: { [string]: boolean },
	cosmetics: { [string]: boolean },
	worn: { [string]: boolean },
	bike: string,
	color: string,
	landmarks: { [string]: boolean },
	found: number,
	totalLandmarks: number,
	landmarkList: { { id: string, name: string, city: string } },
	deliveries: number,
	metres: number,
	passes: { [string]: boolean },
}

export type Delivery = {
	item: string,
	shop: string,
	to: Vector3,
	limit: number,
	started: number,
	metres: number,
}

export type Ride = {
	onBike: boolean,
	model: Model?,
	speed: number, -- m/s
	stamina: number,
	steer: number,
	lean: number,
	crank: number,
	wheel: number,
	boosting: boolean,
	pos: Vector3, -- ground point under the bike
	yaw: number,
}

local State = {}

State.player = Players.LocalPlayer
State.remotes = ReplicatedStorage:WaitForChild("Remotes") :: Folder
State.profile = nil :: Profile?
State.profileChanged = Instance.new("BindableEvent")
State.delivery = nil :: Delivery?
State.deliveryChanged = Instance.new("BindableEvent")
State.ride = {
	onBike = false,
	model = nil,
	speed = 0,
	stamina = 1,
	steer = 0,
	lean = 0,
	crank = 0,
	wheel = 0,
	boosting = false,
	pos = Vector3.zero,
	yaw = 0,
} :: Ride
State.cameraMode = "chase" -- "chase" | "first"
State.night = false
State.rain = false
-- mobile buttons write these; the bike controller reads them
State.touchBoost = false

function State.remote(name: string): RemoteEvent
	return State.remotes:WaitForChild(name) :: RemoteEvent
end

function State.func(name: string): RemoteFunction
	return State.remotes:WaitForChild(name) :: RemoteFunction
end

function State.setProfile(p: Profile?)
	if p then
		State.profile = p
		State.profileChanged:Fire(p)
	end
end

function State.city(): string
	local c = State.player:GetAttribute("City")
	return if type(c) == "string" then c else "hub"
end

--- Is this a phone or tablet (no keyboard)?
function State.isTouch(): boolean
	local UserInputService = game:GetService("UserInputService")
	return UserInputService.TouchEnabled and not UserInputService.KeyboardEnabled
end

return State
