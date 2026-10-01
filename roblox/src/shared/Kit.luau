--!strict
-- Reusable building and street-furniture generators (pure data).
-- Building frame: origin at the bottom centre of the facade, local -Z points
-- out to the street, the building extends towards local +Z.

local Build = require(script.Parent.Build)

type BuildList = Build.BuildList
type Rng = Build.Rng

local Kit = {}

local M = 3 -- studs per metre

Kit.M = M

local GLASS = 0x26323d
local GLASS_TAG_CHANCE = 0.35

--- Yaw that makes a building face along the normal (nx, nz).
function Kit.faceYaw(nx: number, nz: number): number
	return math.atan2(-nx, -nz)
end

local function window(b: BuildList, rng: Rng, ox: number, oz: number, yaw: number, lx: number, ly: number, w: number, h: number, col: number?)
	local tag = if rng:chance(GLASS_TAG_CHANCE) then "NightWindow" else nil
	b:obox(ox, oz, yaw, lx, ly, -0.18, w, h, 0.36, { mat = "SmoothPlastic", col = col or GLASS, refl = 0.15, tag = tag, shadow = false, coll = false })
end

-- ---------------------------------------------------------------------------
-- Amsterdam canal house
-- ---------------------------------------------------------------------------
local BRICKS = { 0x5a2c22, 0x7d3a2b, 0x8a4430, 0x2b2726, 0x6e4a35, 0x9b5a3c }
local PLASTER = { 0xe9e4d8, 0x7e8a86, 0xc8b089, 0x6b2420, 0x3f4b45 }
local DOORS = { 0x1f3b2d, 0x161616, 0x1d2a44, 0x5a1c1c, 0x2d4a3e }
local GABLES = { "triangle", "step", "neck", "bell", "cornice", "cornice" }

function Kit.canalHouse(b: BuildList, rng: Rng, ox: number, oz: number, yaw: number, w: number, d: number, floors: number?)
	local nFloors = floors or rng:int(3, 4)
	local plaster = rng:chance(0.3)
	local col = if plaster then rng:pick(PLASTER) else rng:pick(BRICKS)
	local mat = if plaster then "Plaster" else "Brick"
	local groundH = 3.6 * M
	local floorH = 3.0 * M
	local H = groundH + (nFloors - 1) * floorH
	-- slight lean, like the real "dancing houses"
	local lean = if rng:chance(0.3) then rng:range(-0.025, 0.025) else 0
	b:obox(ox, oz, yaw, 0, H / 2, d / 2, w, H, d, { mat = mat, col = col, roll = lean })
	-- windows
	local bays = if w < 8.5 * M then 2 else 3
	local doorBay = rng:int(1, bays)
	for f = 0, nFloors - 1 do
		local base = if f == 0 then 0 else groundH + (f - 1) * floorH
		local fh = if f == 0 then groundH else floorH
		for i = 1, bays do
			local lx = -w / 2 + (i - 0.5) * w / bays
			if f == 0 and i == doorBay then
				b:obox(ox, oz, yaw, lx, 1.15 * M + 0.2, -0.15, 1.1 * M, 2.3 * M, 0.3, { mat = "Wood", col = rng:pick(DOORS) })
				b:obox(ox, oz, yaw, lx, 0.25, -0.6, 1.5 * M, 0.5, 1.2, { mat = "Concrete", col = 0x8d877c })
			else
				window(b, rng, ox, oz, yaw, lx, base + fh * 0.55, 1.15 * M, (if f == 0 then 1.9 else 1.75) * M)
			end
		end
	end
	-- gable / roof
	local gable = rng:pick(GABLES)
	local roofCol = 0x2c2b2e
	if gable == "cornice" then
		b:obox(ox, oz, yaw, 0, H + 0.4, -0.2, w + 0.6, 0.8, 1.4, { mat = "SmoothPlastic", col = 0xf2efe8 })
		b:obox(ox, oz, yaw, 0, H + 0.5, d / 2 + 0.5, w - 0.4, 1.0, d - 1, { mat = "Slate", col = roofCol })
	else
		local hg = math.min(w * 0.85, 7 * M)
		-- pitched roof behind the gable
		b:prism(ox, oz, yaw, 0, H, d / 2 + 0.6, w, hg * 0.85, d - 1.2, { mat = "ClayRoofTiles", col = roofCol })
		if gable == "triangle" then
			b:prism(ox, oz, yaw, 0, H, -0.05, w + 0.1, hg, 0.6, { mat = mat, col = col })
		elseif gable == "step" then
			local steps = 3
			for s = 1, steps do
				local sw = w * (1 - (s - 1) * 0.28)
				b:obox(ox, oz, yaw, 0, H + (s - 0.5) * hg / steps, 0.3, sw, hg / steps, 1.2, { mat = mat, col = col })
			end
		else
			local nw = w * 0.45
			b:obox(ox, oz, yaw, 0, H + hg * 0.42, 0.3, nw, hg * 0.84, 1.2, { mat = mat, col = col })
			-- shoulders
			b:prism(ox, oz, yaw, -nw / 2 - (w - nw) / 4, H, 0.3, (w - nw) / 2, hg * 0.35, 1.2, { mat = mat, col = col })
			b:prism(ox, oz, yaw, nw / 2 + (w - nw) / 4, H, 0.3, (w - nw) / 2, hg * 0.35, 1.2, { mat = mat, col = col })
			if gable == "bell" then
				-- rounded top: a cylinder whose axis runs into the facade
				local cx, cz = Build.rot(yaw, 0, 0.3)
				b:cyl(ox + cx, H + hg * 0.84, oz + cz, 1.2, nw / 2, { yaw = yaw + math.pi / 2, mat = mat, col = col })
			else
				b:prism(ox, oz, yaw, 0, H + hg * 0.84, 0.3, nw + 0.6, hg * 0.22, 1.3, { mat = "SmoothPlastic", col = 0xf2efe8 })
			end
		end
		-- hoist beam
		b:obox(ox, oz, yaw, 0, H + hg * 0.55, -0.9, 0.45, 0.45, 2.2, { mat = "Wood", col = 0x2b2420, coll = false })
	end
	-- the front door's position along the facade (for delivery targets)
	local doorLx = -w / 2 + (doorBay - 0.5) * w / bays
	return H, doorLx
end

-- ---------------------------------------------------------------------------
-- Paris: Haussmann building
-- ---------------------------------------------------------------------------
local AWNINGS = { 0x9b1c1c, 0x1f4d2b, 0x1d3557, 0x7a1f3d, 0x3a3a3a }

function Kit.haussmann(b: BuildList, rng: Rng, ox: number, oz: number, yaw: number, w: number, d: number, shop: boolean?)
	local stone = rng:pick({ 0xe8dcc2, 0xe2d5b8, 0xeee4cf, 0xd9cbb0 })
	local groundH = 4.5 * M
	local floorH = 3.2 * M
	local nFloors = 4
	local H = groundH + nFloors * floorH
	b:obox(ox, oz, yaw, 0, H / 2, d / 2, w, H, d, { mat = "Limestone", col = stone })
	-- shopfront
	if shop ~= false then
		b:obox(ox, oz, yaw, 0, groundH * 0.45, -0.15, w - 1.5, groundH * 0.75, 0.3, { mat = "SmoothPlastic", col = 0x1f262c, refl = 0.2, tag = if rng:chance(0.6) then "NightWindow" else nil, coll = false })
		if rng:chance(0.45) then
			b:obox(ox, oz, yaw, 0, groundH * 0.85, -1.6, w - 2, 0.4, 3.2, { mat = "Fabric", col = rng:pick(AWNINGS), pitch = -0.25, coll = false })
		end
	end
	local bays = math.max(2, math.floor(w / (5 * M)))
	for f = 1, nFloors do
		local base = groundH + (f - 1) * floorH
		for i = 1, bays do
			local lx = -w / 2 + (i - 0.5) * w / bays
			window(b, rng, ox, oz, yaw, lx, base + floorH * 0.5, 1.25 * M, 2.2 * M)
		end
		-- wrought iron balconies on the 2nd and top floors
		if f == 2 or f == nFloors then
			b:obox(ox, oz, yaw, 0, base + 0.2, -0.9, w - 0.4, 0.35, 1.8, { mat = "Limestone", col = stone })
			b:obox(ox, oz, yaw, 0, base + 1.3, -1.7, w - 0.6, 2.0, 0.15, { mat = "Metal", col = 0x1b1b1b, transp = 0.25, coll = false, shadow = false })
		end
	end
	-- cornice and grey zinc mansard roof with dormers
	b:obox(ox, oz, yaw, 0, H + 0.35, -0.3, w + 0.4, 0.7, 1.6, { mat = "Limestone", col = stone })
	local mh = 3.2 * M
	b:owedge(ox, oz, yaw, 0, H + 0.7 + mh / 2, 1.6, w, mh, 3.2, { mat = "Metal", col = 0x6d7378 })
	b:obox(ox, oz, yaw, 0, H + 0.7 + mh / 2, d / 2 + 1.6, w, mh, d - 3.2, { mat = "Metal", col = 0x6d7378 })
	for i = 1, math.max(1, bays - 1) do
		local lx = -w / 2 + (i + 0.0) * w / bays
		b:obox(ox, oz, yaw, lx, H + 0.7 + mh * 0.45, 1.1, 1.1 * M, 1.6 * M, 1.4, { mat = "Limestone", col = stone, coll = false })
	end
	-- chimney
	b:obox(ox, oz, yaw, rng:range(-w / 3, w / 3), H + mh + 2, d * 0.6, 1.5, 3.5, 3, { mat = "Brick", col = 0x9b5a3c })
	return H
end

-- ---------------------------------------------------------------------------
-- New York
-- ---------------------------------------------------------------------------
local TOWER_GLASS = { 0x3c5468, 0x2f4252, 0x50677a, 0x6b7c88, 0x33424d }
local TOWER_STONE = { 0xb8b0a2, 0x8f8676, 0xcfc6b5, 0x7d6c5c, 0xa39684 }

function Kit.skyscraper(b: BuildList, rng: Rng, ox: number, oz: number, yaw: number, w: number, d: number, h: number)
	local glassy = rng:chance(0.55)
	local col = if glassy then rng:pick(TOWER_GLASS) else rng:pick(TOWER_STONE)
	local mat = if glassy then "Glass" else "Concrete"
	-- lobby
	b:obox(ox, oz, yaw, 0, 3 * M, d / 2, w, 6 * M, d, { mat = "SmoothPlastic", col = 0x1e2328, refl = 0.2 })
	local setback = rng:chance(0.45)
	local segs = if setback then 3 else 1
	local y = 6 * M
	local cw, cd = w, d
	for s = 1, segs do
		local sh = (h - 6 * M) / segs
		b:obox(ox, oz, yaw, 0, y + sh / 2, d / 2, cw, sh, cd, { mat = mat, col = col, refl = if glassy then 0.25 else 0 })
		-- floor bands: a few lit at night
		local bands = math.floor(sh / (12 * M))
		for k = 1, bands do
			local by = y + k * sh / (bands + 1)
			b:obox(ox, oz, yaw, 0, by, d / 2, cw + 0.3, 0.6, cd + 0.3, { mat = "SmoothPlastic", col = if glassy then 0x8899a6 else 0x5d544a, shadow = false, coll = false, tag = if rng:chance(0.5) then "NightWindow" else nil })
		end
		y += sh
		cw *= 0.78
		cd *= 0.78
	end
	if rng:chance(0.35) then
		b:obox(ox, oz, yaw, 0, y + 6, d / 2, 0.8, 12, 0.8, { mat = "Metal", col = 0x9aa0a6 })
		b:obox(ox, oz, yaw, 0, y + 12.5, d / 2, 1.2, 1.2, 1.2, { mat = "Neon", col = 0xff3030, tag = "NightBeacon" })
	end
	return y
end

local BROWN = { 0x6b4436, 0x5c3a2e, 0x7a5040, 0x4f3328, 0x8c6a55 }
function Kit.brownstone(b: BuildList, rng: Rng, ox: number, oz: number, yaw: number, w: number, d: number)
	local col = rng:pick(BROWN)
	local floorH = 3.2 * M
	local H = 4 * floorH
	b:obox(ox, oz, yaw, 0, H / 2, d / 2, w, H, d, { mat = "Sandstone", col = col })
	for f = 1, 3 do
		for i = 1, 3 do
			window(b, rng, ox, oz, yaw, -w / 2 + (i - 0.5) * w / 3, f * floorH + floorH * 0.5, 1.1 * M, 1.9 * M)
		end
	end
	-- stoop (front steps)
	-- a wedge is tallest at its local +Z side, which here is the building side
	b:owedge(ox, oz, yaw, w * 0.28, floorH * 0.4, -1.8 * M, 1.6 * M, floorH * 0.8, 3.6 * M, { mat = "Sandstone", col = col })
	b:obox(ox, oz, yaw, w * 0.28, floorH * 0.85 + 0.6, -0.15, 1.2 * M, 2.4 * M, 0.3, { mat = "Wood", col = 0x2a1a12 })
	b:obox(ox, oz, yaw, 0, H + 0.4, -0.2, w + 0.4, 0.8, 1.2, { mat = "SmoothPlastic", col = 0x2e2420 })
	return H
end

-- ---------------------------------------------------------------------------
-- Street furniture
-- ---------------------------------------------------------------------------
function Kit.tree(b: BuildList, rng: Rng, x: number, z: number, scale: number?, palette: { number }?)
	local s = (scale or 1) * rng:range(0.85, 1.2)
	local trunkH = 5 * M * s
	b:cyl(x, trunkH / 2, z, trunkH, 0.28 * M * s, { roll = math.pi / 2, mat = "Wood", col = 0x4a3b2f })
	local greens = palette or { 0x3f6b2f, 0x4d7a35, 0x56823a, 0x3a5f2a }
	local leaf = rng:pick(greens)
	b:ball(x, trunkH + 1.6 * M * s, z, 2.7 * M * s, { mat = "LeafyGrass", col = leaf, coll = false })
	b:ball(x + rng:range(-1.2, 1.2) * M * s, trunkH + 0.4 * M * s, z + rng:range(-1.2, 1.2) * M * s, 2.0 * M * s, { mat = "LeafyGrass", col = leaf, coll = false })
end

function Kit.lamp(b: BuildList, x: number, z: number, style: string?)
	local h = 4.8 * M
	b:cyl(x, h / 2, z, h, 0.09 * M, { roll = math.pi / 2, mat = "Metal", col = 0x15171a })
	local head
	if style == "modern" then
		head = b:box(x, h + 0.3, z, 0.9 * M, 0.25 * M, 0.5 * M, { mat = "SmoothPlastic", col = 0xfff1c8, tag = "StreetLight", coll = false })
	else
		b:box(x, h + 0.5 * M + 0.6, z, 0.75 * M, 0.2 * M, 0.75 * M, { mat = "Metal", col = 0x15171a, coll = false })
		head = b:box(x, h + 0.3 * M, z, 0.55 * M, 0.6 * M, 0.55 * M, { mat = "SmoothPlastic", col = 0xfff1c8, tag = "StreetLight", coll = false, shadow = false })
	end
	b:light(head, 40, 1.4, 0xffcf8a)
end

function Kit.bollard(b: BuildList, x: number, z: number)
	b:cyl(x, 1.25, z, 2.5, 0.32, { roll = math.pi / 2, mat = "Metal", col = 0x4a1d16 })
end

function Kit.bench(b: BuildList, x: number, z: number, yaw: number)
	b:obox(x, z, yaw, 0, 1.4, 0, 1.8 * M, 0.3, 0.55 * M, { mat = "Wood", col = 0x6b4a2f })
	b:obox(x, z, yaw, 0, 2.6, 0.75, 1.8 * M, 1.2, 0.2, { mat = "Wood", col = 0x6b4a2f })
	b:obox(x, z, yaw, -0.8 * M, 0.7, 0, 0.3, 1.4, 0.5 * M, { mat = "Metal", col = 0x222222 })
	b:obox(x, z, yaw, 0.8 * M, 0.7, 0, 0.3, 1.4, 0.5 * M, { mat = "Metal", col = 0x222222 })
end

local FRAME_COLS = { 0x141414, 0x141414, 0x1d2533, 0x1f3326, 0xe9e6dd, 0x7d1f1f, 0x8fbfb0 }
--- A parked bike (5 parts). yaw = direction the bike points.
function Kit.parkedBike(b: BuildList, rng: Rng, x: number, z: number, yaw: number)
	local r = 0.35 * M
	local col = rng:pick(FRAME_COLS)
	for _, lz in { -0.56 * M, 0.56 * M } do
		local wx, wz = Build.rot(yaw, 0, lz)
		b:cyl(x + wx, r, z + wz, 0.12, r, { yaw = yaw, mat = "Rubber", col = 0x151515, coll = false, shadow = false })
	end
	b:obox(x, z, yaw, 0, 0.75 * M, 0, 0.15, 0.15, 1.15 * M, { mat = "Metal", col = col, pitch = 0.35, coll = false })
	b:obox(x, z, yaw, 0, 1.0 * M, 0.25 * M, 0.5, 0.25, 0.8, { mat = "Leather", col = 0x3b2a1c, coll = false })
	b:obox(x, z, yaw, 0, 1.06 * M, -0.42 * M, 1.6, 0.15, 0.15, { mat = "Metal", col = 0x9a9da0, coll = false })
end

function Kit.cafeTable(b: BuildList, rng: Rng, x: number, z: number)
	b:cyl(x, 1.2, z, 2.4, 0.15, { roll = math.pi / 2, mat = "Metal", col = 0x222222 })
	b:cyl(x, 2.45, z, 0.15, 1.1, { roll = math.pi / 2, mat = "Marble", col = 0xeeeeee })
	for k = 0, 1 do
		local a = k * math.pi + rng:range(0, 1)
		b:box(x + math.cos(a) * 2.2, 1.4, z + math.sin(a) * 2.2, 1.3, 0.25, 1.3, { mat = "Wood", col = 0x8b5a2b, coll = false })
	end
end

function Kit.hydrant(b: BuildList, x: number, z: number)
	b:cyl(x, 1.1, z, 2.2, 0.45, { roll = math.pi / 2, mat = "Metal", col = 0xc62828 })
	b:ball(x, 2.2, z, 0.5, { mat = "Metal", col = 0xc62828 })
end

function Kit.flowerBox(b: BuildList, rng: Rng, x: number, z: number, yaw: number)
	b:obox(x, z, yaw, 0, 0.6, 0, 3, 1.2, 1.2, { mat = "Wood", col = 0x5a3a22 })
	for i = -1, 1 do
		local cols = { 0xe23d3d, 0xf2c230, 0xf07ab0, 0xffffff, 0xff7f2a }
		local wx, wz = Build.rot(yaw, i * 0.9, 0)
		b:ball(x + wx, 1.45, z + wz, 0.45, { mat = "SmoothPlastic", col = rng:pick(cols), coll = false, shadow = false })
	end
end

return Kit
