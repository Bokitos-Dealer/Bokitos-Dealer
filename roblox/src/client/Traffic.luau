--!strict
-- City life, made on each player's own computer: cyclists, people walking,
-- cars and boats moving along the lanes that the city generator laid out.
-- Nobody can crash: traffic simply waits when you are in the way.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Config = require(Shared.Config)
local BikeModel = require(Shared.BikeModel)
local State = require(script.Parent.State)
local Sfx = require(script.Parent.Sfx)

local M = Config.M
local player = Players.LocalPlayer

local Traffic = {}

local folder = Instance.new("Folder")
folder.Name = "Traffic"
folder.Parent = Workspace

local groundParams = RaycastParams.new()
groundParams.FilterType = Enum.RaycastFilterType.Include
groundParams.IgnoreWater = true

-- Lanes --------------------------------------------------------------------------------
type Lane = {
	kind: string,
	pts: { Vector3 },
	cum: { number },
	len: number,
	loop: boolean,
	width: number,
	oneway: boolean,
	j0: number,
	j1: number,
}

local laneCache: { [string]: { Lane } } = {}

local function makeLane(kind: string, raw: { { number } }, origin: Vector3, loop: boolean): Lane?
	local pts: { Vector3 } = {}
	for _, p in raw do
		table.insert(pts, origin + Vector3.new(p[1], p[2], p[3]))
	end
	if loop then
		table.insert(pts, pts[1])
	end
	local cum = { 0 }
	for i = 2, #pts do
		cum[i] = cum[i - 1] + (pts[i] - pts[i - 1]).Magnitude
	end
	local len = cum[#cum]
	if len < 10 then
		return nil
	end
	return { kind = kind, pts = pts, cum = cum, len = len, loop = loop, width = 0, oneway = false, j0 = 0, j1 = 0 }
end

-- lanes that meet at each junction (per kind), for turning onto the next street
local junctions: { [string]: { [number]: { Lane } } } = {}
local byKind: { [string]: { Lane } } = {}

local function index(lanes: { Lane })
	table.clear(junctions)
	table.clear(byKind)
	for _, l in lanes do
		local kind = byKind[l.kind]
		if not kind then
			kind = {}
			byKind[l.kind] = kind
		end
		table.insert(kind, l)
		local j = junctions[l.kind]
		if not j then
			j = {}
			junctions[l.kind] = j
		end
		for _, id in { l.j0, l.j1 } do
			if id ~= 0 then
				local list = j[id]
				if not list then
					list = {}
					j[id] = list
				end
				table.insert(list, l)
			end
		end
	end
end

local function lanesFor(city: string): { Lane }
	local cached = laneCache[city]
	if cached then
		return cached
	end
	local lanes: { Lane } = {}
	local ok, err = pcall(function()
		local origin = Config.HubOrigin
		local mod: ModuleScript? = nil
		if city == "hub" then
			mod = Shared.Cities.Hub
		else
			for _, c in Config.Cities do
				if c.id == city then
					origin = c.origin
					mod = Shared.Cities:FindFirstChild(c.module) :: ModuleScript?
				end
			end
		end
		if mod then
			local gen = (require :: any)(mod)
			if gen.lanes then
				-- real cities: lanes come straight from the map data
				local wl = gen.data.meta.waterLevel
				for _, l in gen.lanes() do
					local raw = {}
					for i = 1, #l.xs do
						table.insert(raw, { l.xs[i], (l.y or (wl + 0.2)) + 0.2, l.zs[i] })
					end
					local lane = makeLane(l.kind, raw, origin, false)
					if lane then
						lane.width = l.width
						lane.oneway = l.oneway
						lane.j0 = l.j0
						lane.j1 = l.j1
						table.insert(lanes, lane)
					end
				end
			else
				-- the hub: its generator is quick and deterministic
				local b = gen.generate()
				for _, l in b.lanes do
					local lane = makeLane(l.kind, l.pts, origin, l.loop == true)
					if lane then
						table.insert(lanes, lane)
					end
				end
			end
		end
	end)
	if not ok then
		warn("[Bike the World] traffic lanes failed: " .. tostring(err))
	end
	laneCache[city] = lanes
	return lanes
end

--- Position and direction at distance s along a lane.
local function laneAt(lane: Lane, s: number): (Vector3, Vector3)
	local cum = lane.cum
	local lo, hi = 1, #cum
	while hi - lo > 1 do
		local mid = (lo + hi) // 2
		if cum[mid] <= s then
			lo = mid
		else
			hi = mid
		end
	end
	local a, b = lane.pts[lo], lane.pts[hi]
	local segLen = cum[hi] - cum[lo]
	local t = if segLen > 0 then math.clamp((s - cum[lo]) / segLen, 0, 1) else 0
	local dir = b - a
	local flat = Vector3.new(dir.X, 0, dir.Z)
	return a:Lerp(b, t), if flat.Magnitude > 1e-3 then flat.Unit else Vector3.new(0, 0, -1)
end

-- Looks ---------------------------------------------------------------------------------
local SKIN = { Color3.fromRGB(255, 220, 190), Color3.fromRGB(234, 184, 146), Color3.fromRGB(198, 134, 94), Color3.fromRGB(141, 85, 54), Color3.fromRGB(96, 60, 40) }
local SHIRTS = { Color3.fromRGB(230, 70, 70), Color3.fromRGB(60, 130, 230), Color3.fromRGB(250, 200, 50), Color3.fromRGB(80, 190, 110), Color3.fromRGB(240, 130, 190), Color3.fromRGB(250, 250, 250), Color3.fromRGB(40, 40, 50), Color3.fromRGB(255, 140, 40), Color3.fromRGB(140, 90, 210) }
local PANTS = { Color3.fromRGB(40, 60, 110), Color3.fromRGB(30, 30, 35), Color3.fromRGB(110, 90, 70), Color3.fromRGB(80, 80, 90) }
local HAIR = { Color3.fromRGB(30, 22, 18), Color3.fromRGB(90, 60, 30), Color3.fromRGB(220, 180, 90), Color3.fromRGB(150, 60, 30), Color3.fromRGB(200, 200, 200) }
local BIKE_COLS = { Color3.fromRGB(25, 25, 28), Color3.fromRGB(30, 60, 120), Color3.fromRGB(150, 30, 30), Color3.fromRGB(40, 100, 60), Color3.fromRGB(220, 220, 220), Color3.fromRGB(120, 90, 160), Color3.fromRGB(230, 120, 160) }
local CAR_COLS = { Color3.fromRGB(200, 40, 40), Color3.fromRGB(30, 70, 160), Color3.fromRGB(230, 230, 230), Color3.fromRGB(40, 40, 45), Color3.fromRGB(120, 125, 130), Color3.fromRGB(40, 120, 70) }

local function pick<T>(list: { T }): T
	return list[math.random(1, #list)]
end

local function part(size: Vector3, color: Color3, material: Enum.Material?, shape: Enum.PartType?): BasePart
	local p = Instance.new("Part")
	p.Size = size
	p.Color = color
	p.Material = material or Enum.Material.SmoothPlastic
	if shape then
		p.Shape = shape
	end
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.CastShadow = false
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Parent = folder
	return p
end

--- A limb between two points.
local function limb(a: Vector3, b: Vector3): CFrame
	if (b - a).Magnitude < 1e-3 then
		return CFrame.new(a)
	end
	return CFrame.lookAt((a + b) / 2, b)
end

-- NPC bikes: the normal bike model, taken apart so we can move it cheaply ----------------
type BikeRig = {
	parts: { BasePart },
	body: { number },
	offset: { CFrame },
	c0: { CFrame }, -- rear, crank, steer, front
	grips: { CFrame }, -- in the steer frame
	saddle: Vector3, -- in the ground frame
	style: string,
	rider: { BasePart }, -- torso, head, armL, armR, thighL, shinL, thighR, shinR
	tilt: number,
}

local function rigBike(style: string): BikeRig
	local look: BikeModel.Look = { style = style, color = pick(BIKE_COLS), wheel = if style == "bmx" then 0.26 else 0.34, cosmetics = { flowers = math.random() < 0.15 } }
	local m = BikeModel.build(look, CFrame.new(), nil)
	local root = m.PrimaryPart :: BasePart
	local motors: { [string]: Motor6D } = {}
	local parentOf: { [BasePart]: BasePart } = {}
	for _, d in m:GetDescendants() do
		if d:IsA("Motor6D") then
			motors[d.Name] = d
		elseif d:IsA("WeldConstraint") and d.Part0 and d.Part1 then
			parentOf[d.Part1 :: BasePart] = d.Part0 :: BasePart
		end
	end
	local bodyIndex: { [BasePart]: number } = { [root] = 1 }
	local order = { "RearWheel", "Crank", "SteerJoint", "FrontWheel" }
	local c0: { CFrame } = {}
	for i, name in order do
		local mo = motors[name]
		bodyIndex[mo.Part1 :: BasePart] = i + 1
		c0[i] = mo.C0
	end
	local rig: BikeRig = { parts = {}, body = {}, offset = {}, c0 = c0, grips = {}, saddle = Vector3.new(0, 3.3, 0), style = style, rider = {}, tilt = 0.35 }
	local steerPart = motors.SteerJoint.Part1 :: BasePart
	for _, d in m:GetDescendants() do
		if d:IsA("BasePart") and d ~= root then
			local q: BasePart? = d
			while q and not bodyIndex[q] do
				q = parentOf[q]
			end
			if q then
				table.insert(rig.parts, d)
				table.insert(rig.body, bodyIndex[q])
				table.insert(rig.offset, q.CFrame:Inverse() * d.CFrame)
			end
			if d.Name == "GripL" or d.Name == "GripR" then
				table.insert(rig.grips, steerPart.CFrame:Inverse() * d.CFrame)
			elseif d.Name == "Saddle" then
				rig.saddle = d.Position
			end
		end
	end
	-- take it apart: everything anchored, nothing joined
	for _, d in m:GetDescendants() do
		if d:IsA("JointInstance") or d:IsA("WeldConstraint") or d:IsA("Trail") or d:IsA("Attachment") then
			d:Destroy()
		elseif d:IsA("Seat") then
			d.Disabled = true
		end
	end
	for _, p in rig.parts do
		p.Anchored = true
		p.CanQuery = false
		p.CastShadow = false
	end
	root:Destroy()
	m.Parent = folder
	-- a simple rider
	local skin, shirt, pants = pick(SKIN), pick(SHIRTS), pick(PANTS)
	rig.tilt = if style == "racer" then 0.8 elseif style == "bmx" then 0.5 else 0.25
	rig.rider = {
		part(Vector3.new(1.5, 1.8, 0.8), shirt),
		part(Vector3.new(1.15, 1.15, 1.15), skin, nil, Enum.PartType.Ball),
		part(Vector3.new(0.4, 0.4, 2.2), shirt),
		part(Vector3.new(0.4, 0.4, 2.2), shirt),
		part(Vector3.new(0.55, 0.55, 1.55), pants),
		part(Vector3.new(0.45, 0.45, 1.55), pants),
		part(Vector3.new(0.55, 0.55, 1.55), pants),
		part(Vector3.new(0.45, 0.45, 1.55), pants),
		part(Vector3.new(1.2, 0.5, 1.2), if math.random() < 0.4 then pick(SHIRTS) else pick(HAIR)),
	}
	return rig
end

local L1, L2 = 1.55, 1.55 -- thigh and shin length (studs)

local function knee(hip: Vector3, foot: Vector3, fwd: Vector3): Vector3
	local d = foot - hip
	local dist = math.clamp(d.Magnitude, 0.2, L1 + L2 - 0.01)
	local u = d.Unit
	local a = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist)
	local h = math.sqrt(math.max(0, L1 * L1 - a * a))
	-- bend the knee forwards
	local side = u:Cross(fwd)
	local perp = side:Cross(u)
	if perp.Magnitude < 1e-3 then
		perp = fwd
	end
	perp = perp.Unit
	if perp:Dot(fwd) < 0 then
		perp = -perp
	end
	return hip + u * a + perp * h
end

local function poseBike(rig: BikeRig, ground: CFrame, wheel: number, crank: number, steer: number, lean: number, outP: { BasePart }, outC: { CFrame })
	local leaned = ground * CFrame.Angles(0, 0, -lean)
	local rootCF = leaned * CFrame.new(0, BikeModel.RootHeight, 0)
	local steerCF = rootCF * rig.c0[3] * CFrame.Angles(0, -steer, 0)
	local bodies = {
		rootCF,
		rootCF * rig.c0[1] * CFrame.Angles(-wheel, 0, 0),
		rootCF * rig.c0[2] * CFrame.Angles(-crank, 0, 0),
		steerCF,
		steerCF * rig.c0[4] * CFrame.Angles(-wheel, 0, 0),
	}
	for i, p in rig.parts do
		table.insert(outP, p)
		table.insert(outC, bodies[rig.body[i]] * rig.offset[i])
	end
	-- rider
	local r = rig.rider
	local up = Vector3.new(0, math.cos(rig.tilt), -math.sin(rig.tilt))
	local hip = rig.saddle + Vector3.new(0, 0.45, 0.1)
	local shoulder = hip + up * 1.75
	local fwdL = Vector3.new(0, 0, -1)
	local function w(v: Vector3): Vector3
		return leaned:PointToWorldSpace(v)
	end
	local torsoCF = leaned * (CFrame.new(hip + up * 0.9) * CFrame.Angles(-rig.tilt, 0, 0))
	table.insert(outP, r[1])
	table.insert(outC, torsoCF)
	table.insert(outP, r[2])
	table.insert(outC, CFrame.new(w(hip + up * 2.35)))
	table.insert(outP, r[9])
	table.insert(outC, leaned * (CFrame.new(hip + up * 2.75) * CFrame.Angles(-rig.tilt, 0, 0)))
	for k, side in { -1, 1 } do
		local grip = if rig.grips[k] then (steerCF * rig.grips[k]).Position else w(shoulder + Vector3.new(side * 0.6, -0.8, -1))
		local sh = w(shoulder + Vector3.new(side * 0.8, -0.15, 0))
		table.insert(outP, r[2 + k])
		table.insert(outC, limb(sh, grip))
		local h = hip + Vector3.new(side * 0.45, 0, 0)
		local pedal = BikeModel.pedalOffset(rig.style, crank, side) + Vector3.new(0, 0.15, 0)
		local kn = knee(h, pedal, fwdL)
		table.insert(outP, r[3 + k * 2])
		table.insert(outC, limb(w(h), w(kn)))
		table.insert(outP, r[4 + k * 2])
		table.insert(outC, limb(w(kn), w(pedal)))
	end
end

-- Pedestrians, cars and boats ---------------------------------------------------------------
type Static = { parts: { BasePart }, offset: { CFrame } }

local function makeStatic(list: { { any } }): Static
	-- each entry: {size, color, material, local CFrame, shape?}
	local s: Static = { parts = {}, offset = {} }
	for _, e in list do
		local p = part(e[1], e[2], e[3], e[5])
		table.insert(s.parts, p)
		table.insert(s.offset, e[4])
	end
	return s
end

local function makeCar(city: string): Static
	local taxi = city == "newyork" and math.random() < 0.5
	local body = if taxi then Color3.fromRGB(250, 200, 30) else pick(CAR_COLS)
	local glass = Color3.fromRGB(60, 80, 100)
	local list: { { any } } = {
		{ Vector3.new(6, 2, 13), body, Enum.Material.SmoothPlastic, CFrame.new(0, 2, 0) },
		{ Vector3.new(5.6, 1.9, 6.5), glass, Enum.Material.Glass, CFrame.new(0, 3.9, 0.6) },
		{ Vector3.new(5.7, 0.3, 6.2), body, Enum.Material.SmoothPlastic, CFrame.new(0, 4.9, 0.6) },
		{ Vector3.new(0.8, 0.6, 0.2), Color3.fromRGB(255, 250, 220), Enum.Material.Neon, CFrame.new(-2.1, 2.3, -6.5) },
		{ Vector3.new(0.8, 0.6, 0.2), Color3.fromRGB(255, 250, 220), Enum.Material.Neon, CFrame.new(2.1, 2.3, -6.5) },
		{ Vector3.new(0.8, 0.5, 0.2), Color3.fromRGB(200, 20, 20), Enum.Material.Neon, CFrame.new(-2.1, 2.3, 6.5) },
		{ Vector3.new(0.8, 0.5, 0.2), Color3.fromRGB(200, 20, 20), Enum.Material.Neon, CFrame.new(2.1, 2.3, 6.5) },
	}
	for _, x in { -2.8, 2.8 } do
		for _, z in { -4.2, 4.2 } do
			table.insert(list, { Vector3.new(0.8, 2.4, 2.4), Color3.fromRGB(25, 25, 25), Enum.Material.Rubber, CFrame.new(x, 1.2, z), Enum.PartType.Cylinder } :: { any })
		end
	end
	if taxi then
		table.insert(list, { Vector3.new(1.6, 0.6, 0.8), Color3.fromRGB(255, 255, 255), Enum.Material.Neon, CFrame.new(0, 5.35, 0.6) } :: { any })
	end
	return makeStatic(list)
end

local function makeBoat(city: string): Static
	local hull = pick({ Color3.fromRGB(30, 40, 60), Color3.fromRGB(120, 30, 30), Color3.fromRGB(230, 230, 230) })
	if city == "amsterdam" then
		-- a low open canal boat (it has to fit under the bridges) with people on board
		local wood = Color3.fromRGB(110, 80, 55)
		local list: { { any } } = {
			{ Vector3.new(6.5, 1.4, 20), hull, Enum.Material.SmoothPlastic, CFrame.new(0, 0.2, 0) },
			{ Vector3.new(5.6, 0.3, 17), wood, Enum.Material.WoodPlanks, CFrame.new(0, 0.95, 0) },
		}
		for k = -1, 1 do
			table.insert(list, { Vector3.new(1.3, 1.3, 0.9), pick(SHIRTS), Enum.Material.SmoothPlastic, CFrame.new(-1.3, 1.7, k * 5) } :: { any })
			table.insert(list, { Vector3.new(0.9, 0.9, 0.9), pick(SKIN), Enum.Material.SmoothPlastic, CFrame.new(-1.3, 2.7, k * 5), Enum.PartType.Ball } :: { any })
		end
		return makeStatic(list)
	end
	return makeStatic({
		{ Vector3.new(8, 2.4, 34), hull, Enum.Material.SmoothPlastic, CFrame.new(0, 0.6, 0) },
		{ Vector3.new(7, 2.6, 24), Color3.fromRGB(150, 190, 210), Enum.Material.Glass, CFrame.new(0, 3.1, 1) },
		{ Vector3.new(7.2, 0.3, 24.4), Color3.fromRGB(240, 240, 240), Enum.Material.SmoothPlastic, CFrame.new(0, 4.5, 1) },
		{ Vector3.new(0.2, 1.6, 2.4), Color3.fromRGB(230, 60, 50), Enum.Material.Fabric, CFrame.new(0, 2.8, 16) },
	})
end

local function makeTram(): Static
	-- an Amsterdam tram: white and blue, two linked cars
	local white, blue = Color3.fromRGB(236, 236, 232), Color3.fromRGB(30, 70, 150)
	local list: { { any } } = {}
	for _, z in { -8.5, 8.5 } do
		table.insert(list, { Vector3.new(7.2, 8.4, 16.6), white, Enum.Material.SmoothPlastic, CFrame.new(0, 4.9, z) } :: { any })
		table.insert(list, { Vector3.new(7.3, 2.6, 16.4), Color3.fromRGB(40, 50, 60), Enum.Material.Glass, CFrame.new(0, 6.2, z) } :: { any })
		table.insert(list, { Vector3.new(7.3, 0.6, 16.4), blue, Enum.Material.SmoothPlastic, CFrame.new(0, 2.4, z) } :: { any })
		table.insert(list, { Vector3.new(2.4, 1, 5), Color3.fromRGB(60, 60, 60), Enum.Material.Metal, CFrame.new(0, 9.6, z) } :: { any })
	end
	table.insert(list, { Vector3.new(6.6, 2.4, 0.4), Color3.fromRGB(255, 220, 120), Enum.Material.Neon, CFrame.new(0, 7.6, -16.9) } :: { any })
	return makeStatic(list)
end

local function makeWalker(): Static
	local skin, shirt, pants = pick(SKIN), pick(SHIRTS), pick(PANTS)
	return makeStatic({
		{ Vector3.new(1.6, 1.8, 0.8), shirt, Enum.Material.SmoothPlastic, CFrame.new(0, 3.9, 0) },
		{ Vector3.new(1.2, 1.2, 1.2), skin, Enum.Material.SmoothPlastic, CFrame.new(0, 5.4, 0), Enum.PartType.Ball },
		{ Vector3.new(1.25, 0.5, 1.25), pick(HAIR), Enum.Material.SmoothPlastic, CFrame.new(0, 5.85, 0.05) },
		{ Vector3.new(0.6, 2.9, 0.6), pants, Enum.Material.SmoothPlastic, CFrame.new(-0.4, 1.5, 0) }, -- legs swing (index 4, 5)
		{ Vector3.new(0.6, 2.9, 0.6), pants, Enum.Material.SmoothPlastic, CFrame.new(0.4, 1.5, 0) },
		{ Vector3.new(0.45, 1.7, 0.45), shirt, Enum.Material.SmoothPlastic, CFrame.new(-1.05, 3.9, 0) }, -- arms (6, 7)
		{ Vector3.new(0.45, 1.7, 0.45), shirt, Enum.Material.SmoothPlastic, CFrame.new(1.05, 3.9, 0) },
	})
end

-- NPCs ------------------------------------------------------------------------------------------
type Npc = {
	kind: string,
	lane: Lane,
	s: number,
	dir: number,
	speed: number, -- studs/s
	cruise: number,
	y: number,
	yaw: number,
	nextRay: number,
	bike: BikeRig?,
	static: Static?,
	wheel: number,
	crank: number,
	phase: number,
	lastBell: number,
	accum: number,
}

local npcs: { Npc } = {}
local lanes: { Lane } = {}
local currentCity = ""

local COUNTS: { [string]: { [string]: number } } = {
	hub = { bike = 6 },
	amsterdam = { bike = 26, walk = 16, car = 4, boat = 4, tram = 5 },
	paris = { bike = 14, walk = 18, car = 16, boat = 3 },
	newyork = { bike = 10, walk = 22, car = 18 },
}
local SPEEDS: { [string]: { number } } = { bike = { 3.8, 5.5 }, walk = { 1.1, 1.5 }, car = { 7, 9 }, boat = { 2.2, 3 }, tram = { 5.5, 6.5 } }

local function me(): Vector3
	local ride = State.ride
	if ride.onBike then
		return ride.pos
	end
	local char = player.Character
	local hrp = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
	return if hrp then hrp.Position else Workspace.CurrentCamera.CFrame.Position
end

--- Put an NPC somewhere on a lane of its kind, between minR and maxR from `near`.
local function place(n: Npc, near: Vector3, minR: number, maxR: number): boolean
	local candidates = byKind[n.kind]
	if not candidates or #candidates == 0 then
		return false
	end
	for _ = 1, 250 do
		local l = pick(candidates)
		local i = math.random(1, #l.pts)
		local d = (l.pts[i] - near)
		local flat = Vector2.new(d.X, d.Z).Magnitude
		if flat >= minR and flat <= maxR then
			n.lane = l
			n.s = l.cum[i]
			n.dir = if l.oneway or math.random() < 0.5 then 1 else -1
			n.y = l.pts[i].Y
			n.nextRay = 0
			return true
		end
	end
	return false
end

--- At the end of a street: turn onto a street that meets it, or turn round.
local function nextLane(n: Npc, j: number)
	local list = (junctions[n.kind] or {})[j]
	local options = {}
	if list then
		for _, l in list do
			if l ~= n.lane then
				if l.j0 == j then
					table.insert(options, { l, 0, 1 })
				elseif l.j1 == j and not l.oneway then
					table.insert(options, { l, l.len, -1 })
				end
			end
		end
	end
	if #options > 0 then
		local o = pick(options)
		n.lane = o[1]
		n.s = o[2]
		n.dir = o[3]
	else
		n.dir = -n.dir
		n.s = math.clamp(n.s, 0, n.lane.len)
	end
end

local function destroyNpc(n: Npc)
	if n.bike then
		for _, p in n.bike.parts do
			p:Destroy()
		end
		for _, p in n.bike.rider do
			p:Destroy()
		end
	end
	if n.static then
		for _, p in n.static.parts do
			p:Destroy()
		end
	end
end

local function clear()
	for _, n in npcs do
		destroyNpc(n)
	end
	table.clear(npcs)
	folder:ClearAllChildren()
end

local function spawnFor(city: string)
	clear()
	currentCity = city
	lanes = lanesFor(city)
	index(lanes)
	local counts: { [string]: number } = COUNTS[city] or {}
	local near = me()
	for kind, count in counts do
		for _ = 1, count do
			local range = SPEEDS[kind] or { 2, 3 }
			local n: Npc = {
				kind = kind,
				lane = lanes[1],
				s = 0,
				dir = 1,
				speed = 0,
				cruise = (range[1] + math.random() * (range[2] - range[1])) * M,
				y = 0,
				yaw = 0,
				nextRay = 0,
				bike = nil,
				static = nil,
				wheel = 0,
				crank = math.random() * 6,
				phase = math.random() * 6,
				lastBell = 0,
				accum = 0,
			}
			if not lanes[1] or not place(n, near, 0, 380) then
				continue
			end
			n.speed = n.cruise
			if kind == "bike" then
				local style = if city == "amsterdam" then pick({ "city", "city", "city", "cargo", "racer" }) else pick({ "city", "racer", "bmx", "city" })
				n.bike = rigBike(style)
			elseif kind == "car" then
				n.static = makeCar(city)
			elseif kind == "boat" then
				n.static = makeBoat(city)
			elseif kind == "tram" then
				n.static = makeTram()
			else
				n.static = makeWalker()
			end
			table.insert(npcs, n)
		end
	end
end

local outP: { BasePart } = {}
local outC: { CFrame } = {}

local function update(dt: number)
	local city = State.city()
	if city ~= currentCity then
		spawnFor(city)
		return
	end
	if dt <= 0 or #npcs == 0 then
		return
	end
	table.clear(outP)
	table.clear(outC)
	local mePos = me()
	local cam = Workspace.CurrentCamera.CFrame.Position
	local world = Workspace:FindFirstChild("World")
	if world then
		groundParams.FilterDescendantsInstances = { world, Workspace.Terrain }
	end
	local now = os.clock()
	for _, n in npcs do
		local lane = n.lane
		local p, tangent = laneAt(lane, n.s)
		local dist = (Vector2.new(p.X - cam.X, p.Z - cam.Z)).Magnitude
		-- far away ones update less often
		n.accum += dt
		local step = if dist < 260 then 0 elseif dist < 600 then 0.1 else 0.4
		if n.accum < step then
			continue
		end
		local ndt = n.accum
		n.accum = 0
		-- too far from the player: move it somewhere closer
		if (Vector2.new(p.X - mePos.X, p.Z - mePos.Z)).Magnitude > 650 then
			place(n, mePos, 220, 450)
			continue
		end
		-- wait for the player if they are in the way
		local dirVec = tangent * n.dir
		local toMe = Vector3.new(mePos.X - p.X, 0, mePos.Z - p.Z)
		local ahead = toMe:Dot(dirVec)
		local side = (toMe - dirVec * ahead).Magnitude
		local blockAt = if n.kind == "car" then 26 elseif n.kind == "boat" or n.kind == "tram" then 45 else 10
		local target = n.cruise
		if ahead > 0 and ahead < blockAt and side < (if n.kind == "car" then 7 else 4) then
			target = 0
			if n.kind == "bike" and now - n.lastBell > 4 and n.bike then
				n.lastBell = now
				Sfx.bell(n.bike.parts[1])
			end
		end
		n.speed += (target - n.speed) * math.min(1, ndt * 3)
		-- move along the lane
		n.s += n.speed * n.dir * ndt
		if lane.loop then
			n.s %= lane.len
		elseif n.s > lane.len then
			n.s = lane.len
			nextLane(n, lane.j1)
		elseif n.s < 0 then
			n.s = 0
			nextLane(n, lane.j0)
		end
		lane = n.lane
		p, tangent = laneAt(lane, n.s)
		local heading = tangent * n.dir
		local targetYaw = math.atan2(-heading.X, -heading.Z)
		local dy = (targetYaw - n.yaw + math.pi) % (2 * math.pi) - math.pi
		n.yaw += dy * math.min(1, ndt * 6)
		-- keep to the right a little
		local right = Vector3.new(-heading.Z, 0, heading.X)
		local offset = 0
		if n.kind == "car" then
			offset = if lane.oneway then 0 else lane.width / 4
		elseif n.kind == "bike" then
			offset = if lane.width > 4 * M then lane.width / 2 - 1.3 * M else 0.5
		elseif n.kind == "walk" then
			offset = 0.8
		elseif n.kind == "boat" then
			offset = 3
		end
		p += right * offset
		-- find the ground (not for boats)
		if n.kind ~= "boat" and n.kind ~= "tram" and now > n.nextRay then
			n.nextRay = now + (if dist < 260 then 0.12 else 0.5)
			local hit = Workspace:Raycast(Vector3.new(p.X, n.y + 8, p.Z), Vector3.new(0, -30, 0), groundParams)
			if hit then
				n.y = hit.Position.Y
			else
				n.y = p.Y
			end
		elseif n.kind == "boat" or n.kind == "tram" then
			n.y = p.Y - 0.2
		end
		local ground = CFrame.new(p.X, n.y, p.Z) * CFrame.Angles(0, n.yaw, 0)
		if n.bike then
			local sp = n.speed / M
			n.wheel += sp * ndt / 0.34
			if sp > 0.3 then
				n.crank += sp / 4.3 * math.pi * 2 * ndt
			end
			poseBike(n.bike, ground, n.wheel, n.crank, math.clamp(-dy * 2, -0.4, 0.4), math.clamp(-dy * 1.5, -0.3, 0.3), outP, outC)
		elseif n.static then
			local st = n.static
			local swing = 0
			if n.kind == "walk" then
				n.phase += n.speed / M * ndt * 3.2
				swing = math.sin(n.phase) * 0.5 * math.min(1, n.speed / M)
			end
			for i, prt in st.parts do
				local off = st.offset[i]
				if n.kind == "walk" and i >= 4 then
					-- legs and arms swing around the hip/shoulder
					local sgn = if i == 4 or i == 7 then 1 else -1
					local pivotY = if i <= 5 then 2.95 else 4.7
					local o = off.Position
					local pivot = Vector3.new(o.X, pivotY, o.Z)
					off = CFrame.new(pivot) * CFrame.Angles(swing * sgn, 0, 0) * CFrame.new(o - pivot)
				end
				table.insert(outP, prt)
				table.insert(outC, ground * off)
			end
		end
	end
	if #outP > 0 then
		Workspace:BulkMoveTo(outP, outC, Enum.BulkMoveMode.FireCFrameChanged)
	end
end

function Traffic.init()
	RunService.Heartbeat:Connect(update)
end

return Traffic
