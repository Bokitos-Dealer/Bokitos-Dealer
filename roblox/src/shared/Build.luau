--!strict
-- A "build list": plain data describing a city (no Roblox instances).
-- City generators fill it in; the server's Materializer turns it into parts,
-- terrain water and lights. Being plain data means generators can be unit
-- tested with the standalone Luau runtime.
--
-- All coordinates are studs, relative to the city origin.
-- Rotation convention matches CFrame.Angles(0, yaw, 0): local +X maps to
-- (cos yaw, 0, -sin yaw) and local +Z maps to (sin yaw, 0, cos yaw).

export type Prim = {
	k: string, -- "box" | "wedge" | "cyl" | "ball" | "cwedge"
	x: number, y: number, z: number,
	sx: number, sy: number, sz: number,
	yaw: number, pitch: number, roll: number,
	mat: string,
	col: number, -- 0xRRGGBB
	coll: boolean,
	shadow: boolean,
	tag: string?,
	transp: number,
	refl: number,
	light: { range: number, brightness: number, col: number }?,
	group: string?, -- parts with a group go in their own model (landmarks)
}

export type Opts = {
	yaw: number?, pitch: number?, roll: number?,
	mat: string?, col: number?, coll: boolean?, shadow: boolean?,
	tag: string?, transp: number?, refl: number?, group: string?,
}

export type Landmark = { id: string, name: string, x: number, y: number, z: number, radius: number, fact: string }
export type Lane = { kind: string, pts: { { number } }, loop: boolean? } -- kind: "bike" | "walk" | "car" | "boat"
export type Spot = { x: number, y: number, z: number, yaw: number?, label: string? }
export type Portal = { id: string, x: number, y: number, z: number, yaw: number }
export type Sign = { x: number, y: number, z: number, yaw: number, w: number, h: number, text: string, col: number, bg: number }

local Build = {}
Build.__index = Build

export type BuildList = typeof(setmetatable({} :: {
	prims: { Prim },
	water: { { number } }, -- {x,y,z,sx,sy,sz,yaw}
	ground: { { any } }, -- terrain fills: {mat,x,y,z,sx,sy,sz,yaw}
	landmarks: { Landmark },
	coins: { Spot },
	lanes: { Lane },
	doors: { Spot },
	shops: { Spot },
	signs: { Sign },
	spawn: Spot,
	portals: { Portal },
}, Build))

function Build.new(): BuildList
	local self = setmetatable({
		prims = {},
		water = {},
		ground = {},
		landmarks = {},
		coins = {},
		lanes = {},
		doors = {},
		shops = {},
		signs = {},
		spawn = { x = 0, y = 4, z = 0, yaw = 0 },
		portals = {},
	}, Build)
	return self
end

local function add(self: BuildList, k: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, o: Opts?): Prim
	local op: Opts = o or {}
	local p: Prim = {
		k = k,
		x = x, y = y, z = z,
		sx = sx, sy = sy, sz = sz,
		yaw = op.yaw or 0, pitch = op.pitch or 0, roll = op.roll or 0,
		mat = op.mat or "SmoothPlastic",
		col = op.col or 0xcccccc,
		coll = if op.coll == nil then true else op.coll,
		shadow = if op.shadow == nil then true else op.shadow,
		tag = op.tag,
		transp = op.transp or 0,
		refl = op.refl or 0,
		group = op.group,
	}
	table.insert(self.prims, p)
	return p
end

function Build.box(self: BuildList, x: number, y: number, z: number, sx: number, sy: number, sz: number, o: Opts?): Prim
	return add(self, "box", x, y, z, sx, sy, sz, o)
end
function Build.wedge(self: BuildList, x: number, y: number, z: number, sx: number, sy: number, sz: number, o: Opts?): Prim
	return add(self, "wedge", x, y, z, sx, sy, sz, o)
end
function Build.cwedge(self: BuildList, x: number, y: number, z: number, sx: number, sy: number, sz: number, o: Opts?): Prim
	return add(self, "cwedge", x, y, z, sx, sy, sz, o)
end
-- Cylinder along its local X axis.
function Build.cyl(self: BuildList, x: number, y: number, z: number, length: number, radius: number, o: Opts?): Prim
	return add(self, "cyl", x, y, z, length, radius * 2, radius * 2, o)
end
function Build.ball(self: BuildList, x: number, y: number, z: number, radius: number, o: Opts?): Prim
	return add(self, "ball", x, y, z, radius * 2, radius * 2, radius * 2, o)
end

--- A box between two points on the ground plane (a beam), centred at height y.
function Build.beam(self: BuildList, ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, h: number, o: Opts?): Prim?
	local dx, dy, dz = bx - ax, by - ay, bz - az
	local len = math.sqrt(dx * dx + dy * dy + dz * dz)
	if len < 1e-3 then
		return nil
	end
	local horiz = math.sqrt(dx * dx + dz * dz)
	local op: Opts = table.clone(o or {}) :: Opts
	-- local Z runs along the beam: yaw so that local +Z -> (dx,dz), pitch tilts it
	op.yaw = math.atan2(dx, dz)
	op.pitch = -math.atan2(dy, horiz)
	return add(self, "box", (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2, w, h, len, op)
end

--- Rotate a local offset (lx, lz) by yaw.
function Build.rot(yaw: number, lx: number, lz: number): (number, number)
	local c, s = math.cos(yaw), math.sin(yaw)
	return lx * c + lz * s, -lx * s + lz * c
end

--- Oriented box in a local frame (origin ox,oz; yaw), local position (lx, ly, lz).
function Build.obox(self: BuildList, ox: number, oz: number, yaw: number, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, o: Opts?): Prim
	local wx, wz = Build.rot(yaw, lx, lz)
	local op: Opts = table.clone(o or {}) :: Opts
	op.yaw = yaw + (op.yaw or 0)
	return add(self, "box", ox + wx, ly, oz + wz, sx, sy, sz, op)
end
function Build.owedge(self: BuildList, ox: number, oz: number, yaw: number, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, o: Opts?): Prim
	local wx, wz = Build.rot(yaw, lx, lz)
	local op: Opts = table.clone(o or {}) :: Opts
	op.yaw = yaw + (op.yaw or 0)
	return add(self, "wedge", ox + wx, ly, oz + wz, sx, sy, sz, op)
end

--- Triangular prism (gable / roof): base width w along local X, height h,
--- extruded `depth` along local Z, base at ly. Apex is at local x = 0.
--- Made of two wedges whose tall edges meet at the apex.
function Build.prism(self: BuildList, ox: number, oz: number, yaw: number, lx: number, ly: number, lz: number, w: number, h: number, depth: number, o: Opts?)
	-- A WedgePart is tallest at its local +Z side and slopes down to -Z.
	-- Turning it 90 degrees puts the slope across local X.
	local half = w / 2
	-- left half: tall edge must face +X (towards the apex)
	self:owedge(ox, oz, yaw, lx - half / 2, ly + h / 2, lz, depth, h, half, (function()
		local op: Opts = table.clone(o or {}) :: Opts
		op.yaw = math.pi / 2
		return op
	end)())
	-- right half: tall edge faces -X
	self:owedge(ox, oz, yaw, lx + half / 2, ly + h / 2, lz, depth, h, half, (function()
		local op: Opts = table.clone(o or {}) :: Opts
		op.yaw = -math.pi / 2
		return op
	end)())
end

function Build.addWater(self: BuildList, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number?)
	table.insert(self.water, { x, y, z, sx, sy, sz, yaw or 0 })
end

function Build.light(self: BuildList, p: Prim, range: number, brightness: number, col: number)
	p.light = { range = range, brightness = brightness, col = col }
end

function Build.landmark(self: BuildList, id: string, name: string, x: number, y: number, z: number, radius: number, fact: string)
	table.insert(self.landmarks, { id = id, name = name, x = x, y = y, z = z, radius = radius, fact = fact })
end

function Build.coin(self: BuildList, x: number, y: number, z: number)
	table.insert(self.coins, { x = x, y = y, z = z })
end

function Build.lane(self: BuildList, kind: string, pts: { { number } }, loop: boolean?)
	if #pts >= 2 then
		table.insert(self.lanes, { kind = kind, pts = pts, loop = loop })
	end
end

function Build.door(self: BuildList, x: number, y: number, z: number, yaw: number, label: string?)
	table.insert(self.doors, { x = x, y = y, z = z, yaw = yaw, label = label })
end

function Build.shop(self: BuildList, x: number, y: number, z: number, yaw: number, label: string)
	table.insert(self.shops, { x = x, y = y, z = z, yaw = yaw, label = label })
end

function Build.sign(self: BuildList, x: number, y: number, z: number, yaw: number, w: number, h: number, text: string, col: number?, bg: number?)
	table.insert(self.signs, { x = x, y = y, z = z, yaw = yaw, w = w, h = h, text = text, col = col or 0xffffff, bg = bg or 0x1d3f8f })
end

--- Count primitives (for budgets/tests).
function Build.count(self: BuildList): number
	return #self.prims
end

-- Deterministic random numbers (so every server builds the same city).
export type Rng = { next: (Rng) -> number, range: (Rng, number, number) -> number, int: (Rng, number, number) -> number, pick: <T>(Rng, { T }) -> T, chance: (Rng, number) -> boolean }

function Build.rng(seed: number): Rng
	local state = seed % 2147483647
	if state <= 0 then
		state += 2147483646
	end
	local r = {}
	function r.next(_self: any): number
		state = (state * 48271) % 2147483647
		return (state - 1) / 2147483646
	end
	function r.range(self2: any, a: number, b: number): number
		return a + (b - a) * self2:next()
	end
	function r.int(self2: any, a: number, b: number): number
		return math.floor(a + (b - a + 1) * self2:next())
	end
	function r.pick(self2: any, list: { any }): any
		return list[math.clamp(math.floor(self2:next() * #list) + 1, 1, #list)]
	end
	function r.chance(self2: any, p: number): boolean
		return self2:next() < p
	end
	return (r :: any) :: Rng
end

return Build
