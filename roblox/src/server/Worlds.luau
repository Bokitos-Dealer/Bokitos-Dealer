--!strict
-- Server registry of the hub and the cities: where they are and what is in
-- them (landmarks, shops, delivery doors), all in world coordinates.

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Config = require(Shared.Config)

export type Spot = { pos: Vector3, label: string? }
export type LandmarkW = { id: string, name: string, pos: Vector3, radius: number, fact: string }
export type World = {
	id: string,
	name: string,
	origin: Vector3,
	ready: boolean,
	spawn: CFrame,
	landmarks: { LandmarkW },
	shops: { Spot },
	doors: { Spot },
	food: { string },
}

local Worlds = {}
Worlds.list = {} :: { [string]: World }

local function add(id: string, name: string, origin: Vector3, food: { string })
	Worlds.list[id] = {
		id = id,
		name = name,
		origin = origin,
		ready = false,
		spawn = CFrame.new(origin + Vector3.new(0, 5, 0)),
		landmarks = {},
		shops = {},
		doors = {},
		food = food,
	}
end

add("hub", "World Bike Hub", Config.HubOrigin, {})
for _, c in Config.Cities do
	add(c.id, c.name, c.origin, c.food)
end

--- Fill a world's data from its build list.
function Worlds.fill(id: string, b: any)
	local w = Worlds.list[id]
	local o = w.origin
	w.spawn = CFrame.new(o + Vector3.new(b.spawn.x, b.spawn.y, b.spawn.z)) * CFrame.Angles(0, b.spawn.yaw or 0, 0)
	for _, l in b.landmarks do
		table.insert(w.landmarks, { id = id .. ":" .. l.id, name = l.name, pos = o + Vector3.new(l.x, l.y, l.z), radius = l.radius, fact = l.fact })
	end
	for _, s in b.shops do
		table.insert(w.shops, { pos = o + Vector3.new(s.x, s.y, s.z), label = s.label })
	end
	for _, d in b.doors do
		table.insert(w.doors, { pos = o + Vector3.new(d.x, d.y, d.z) })
	end
end

--- Which world is this position in?
function Worlds.at(pos: Vector3): World?
	local best: World? = nil
	local bestD = math.huge
	for _, w in Worlds.list do
		local d = (Vector3.new(pos.X, 0, pos.Z) - Vector3.new(w.origin.X, 0, w.origin.Z)).Magnitude
		if d < bestD then
			bestD = d
			best = w
		end
	end
	if bestD < 4000 then
		return best
	end
	return nil
end

return Worlds
