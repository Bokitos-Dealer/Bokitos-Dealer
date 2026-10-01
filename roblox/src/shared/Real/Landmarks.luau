--!strict
-- Hand-made models of famous landmarks, placed at their real positions
-- (from the map data). Sizes follow the real buildings (1 m = 3 studs).

local Build = require(script.Parent.Parent.Build)
local Decode = require(script.Parent.Decode)

type BuildList = Build.BuildList
type Opts = Build.Opts

local M = 3
local DM = Decode.DM

local Landmarks = {}

export type Model = { kind: string, x: number, z: number, yaw: number, w: number, d: number }

--- A local frame: (lx, ly, lz) in metres around (x, z) turned by yaw -> studs.
local function frame(x: number, z: number, yaw: number)
	local f = {}
	function f.p(lx: number, lz: number): (number, number)
		local wx, wz = Build.rot(yaw, lx * M, lz * M)
		return x + wx, z + wz
	end
	return f
end

local function with(o: Opts, group: string): Opts
	local c = table.clone(o) :: Opts
	c.group = group
	return c
end

--- Highest building top (studs) near a point.
function Landmarks.topNear(buildings: { Decode.Building }, x: number, z: number, r: number): number
	local best = 0
	for _, bld in buildings do
		local near = false
		for i = 1, bld.n do
			local dx, dz = bld.xs[i] - x, bld.zs[i] - z
			if dx * dx + dz * dz < r * r then
				near = true
				break
			end
		end
		local rc = bld.rects
		for i = 1, #rc - 4, 5 do
			if (rc[i] - x) ^ 2 + (rc[i + 1] - z) ^ 2 < r * r then
				near = true
			end
		end
		if near then
			best = math.max(best, bld.top)
		end
	end
	return best
end

-- A box beam between two points (metres in the local frame) ------------------------------
local function beam(b: BuildList, f: any, ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number, o: Opts)
	local x1, z1 = f.p(ax, az)
	local x2, z2 = f.p(bx, bz)
	b:beam(x1, ay * M, z1, x2, by * M, z2, w * M, w * M, o)
end

--- A see-through lattice frustum: corner girders and X braces on each side.
local function lattice(b: BuildList, f: any, cx0: number, cz0: number, h0: number, y0: number, cx1: number, cz1: number, h1: number, y1: number, girder: number, o: Opts)
	local c0 = { { cx0 - h0, cz0 - h0 }, { cx0 + h0, cz0 - h0 }, { cx0 + h0, cz0 + h0 }, { cx0 - h0, cz0 + h0 } }
	local c1 = { { cx1 - h1, cz1 - h1 }, { cx1 + h1, cz1 - h1 }, { cx1 + h1, cz1 + h1 }, { cx1 - h1, cz1 + h1 } }
	for i = 1, 4 do
		beam(b, f, c0[i][1], y0, c0[i][2], c1[i][1], y1, c1[i][2], girder, o)
	end
	for i = 1, 4 do
		local j = i % 4 + 1
		beam(b, f, c0[i][1], y0, c0[i][2], c1[j][1], y1, c1[j][2], girder * 0.45, o)
		beam(b, f, c0[j][1], y0, c0[j][2], c1[i][1], y1, c1[i][2], girder * 0.45, o)
	end
end

-- Paris ---------------------------------------------------------------------------------------
local function eiffel(b: BuildList, m: Model)
	local g = "Eiffel Tower"
	-- the four legs point north, east, south and west
	local f = frame(m.x, m.z, math.pi / 4)
	local iron: Opts = { mat = "Metal", col = 0x6E5B4A, group = g }
	local s0, s1, s2 = 46, 31, 17
	for _, sx in { -1, 1 } do
		for _, sz in { -1, 1 } do
			-- leg up to the first floor, and on to the second
			lattice(b, f, sx * s0, sz * s0, 11, 0, sx * (s0 + s1) / 2, sz * (s0 + s1) / 2, 8.5, 30, 2.2, iron)
			lattice(b, f, sx * (s0 + s1) / 2, sz * (s0 + s1) / 2, 8.5, 30, sx * s1, sz * s1, 6.5, 57, 2, iron)
			lattice(b, f, sx * s1, sz * s1, 6, 57, sx * s2, sz * s2, 4, 115, 1.7, iron)
		end
	end
	-- the big decorative arches between the legs
	for side = 0, 3 do
		local a0 = side * math.pi / 2
		local steps = 6
		local last: { number }? = nil
		for k = 0, steps do
			local t = k / steps
			local across = (t - 0.5) * 2 * (s0 - 8)
			local up = 9 + 30 * math.sin(t * math.pi)
			local lx, lz = across * math.cos(a0) - (s0 - 3) * math.sin(a0), across * math.sin(a0) + (s0 - 3) * math.cos(a0)
			if last then
				beam(b, f, last[1], last[2], last[3], lx, up, lz, 1.6, iron)
			end
			last = { lx, up, lz }
		end
	end
	-- first and second floor platforms
	for _, fl in { { 57, 35, 6 }, { 115, 20, 4 } } do
		local y, half, h = fl[1], fl[2], fl[3]
		for side = 0, 3 do
			local a0 = side * math.pi / 2
			local cx, cz = -half * math.sin(a0), half * math.cos(a0)
			local px, pz = f.p(cx, cz)
			b:box(px, (y + h / 2) * M, pz, half * 2 * M, h * M, 2 * M, { yaw = math.pi / 4 + a0, mat = "Metal", col = 0x6E5B4A, group = g })
		end
		local px, pz = f.p(0, 0)
		b:box(px, (y + 0.5) * M, pz, half * 1.9 * M, 1 * M, half * 1.9 * M, { yaw = math.pi / 4, mat = "Metal", col = 0x5E4D3E, group = g })
	end
	-- the slim top part, curving in
	local tiers = { { 115, 17 }, { 160, 12 }, { 205, 9 }, { 245, 7 }, { 276, 5.5 } }
	for i = 1, #tiers - 1 do
		local a, c = tiers[i], tiers[i + 1]
		lattice(b, f, 0, 0, a[2], a[1], 0, 0, c[2], c[1], 1.4, iron)
	end
	local px, pz = f.p(0, 0)
	b:box(px, 280 * M, pz, 13 * M, 8 * M, 13 * M, { yaw = math.pi / 4, mat = "Metal", col = 0x6E5B4A, group = g })
	b:box(px, 288 * M, pz, 8 * M, 8 * M, 8 * M, { yaw = math.pi / 4, mat = "Metal", col = 0x5E4D3E, group = g })
	b:cyl(px, 310 * M, pz, 40 * M, 1 * M, { roll = math.pi / 2, mat = "Metal", col = 0xB9B4AA, group = g })
	b:ball(px, 296 * M, pz, 2.5 * M, { mat = "Neon", col = 0xFFE8A0, tag = "Beacon", coll = false, group = g })
	-- sparkling lights for the night show
	local rng = Build.rng(1889)
	for _ = 1, 90 do
		local y = rng:range(5, 300)
		local half = if y < 57 then 40 - y * 0.15 elseif y < 115 then 31 - (y - 57) * 0.24 else math.max(5, 17 - (y - 115) * 0.072)
		local side = rng:int(0, 3)
		local a0 = side * math.pi / 2
		local across = rng:range(-half, half)
		local lx, lz = across * math.cos(a0) - half * math.sin(a0), across * math.sin(a0) + half * math.cos(a0)
		local wx, wz = f.p(lx, lz)
		b:ball(wx, y * M, wz, 0.5, { mat = "Neon", col = 0xFFF4C2, tag = "Sparkle", coll = false, shadow = false, group = g })
	end
end

local function arc(b: BuildList, m: Model)
	local g = "Arc de Triomphe"
	-- local X: the long side (45 m), the big arches look down the avenues
	local f = frame(m.x, m.z, m.yaw)
	local stone: Opts = { mat = "Limestone", col = 0xE0D4BA, group = g }
	local W, D, H = 45, 22, 50
	local bigW, bigH, smallW, smallH = 14.6, 29.2, 8.4, 18.7
	local pw, pd = (W - bigW) / 2, (D - smallW) / 2
	for _, sx in { -1, 1 } do
		for _, sz in { -1, 1 } do
			local x, z = f.p(sx * (bigW / 2 + pw / 2), sz * (smallW / 2 + pd / 2))
			b:box(x, bigH / 2 * M, z, pw * M, bigH * M, pd * M, with({ yaw = m.yaw, mat = stone.mat, col = stone.col }, g))
		end
		-- above the small arch on each short side
		local x, z = f.p(sx * (bigW / 2 + pw / 2), 0)
		b:box(x, (smallH + bigH) / 2 * M, z, pw * M, (bigH - smallH) * M, smallW * M, with({ yaw = m.yaw, mat = stone.mat, col = stone.col }, g))
	end
	-- rounded tops of the big arch
	for _, sx in { -1, 1 } do
		local x, z = f.p(sx * (bigW / 2 - 1.6), 0)
		b:wedge(x, (bigH - 1.6) * M, z, D * M, 3.2 * M, 3.2 * M, with({ yaw = m.yaw + sx * math.pi / 2, roll = math.pi, mat = stone.mat, col = stone.col }, g))
	end
	-- attic with cornices
	local cx, cz = f.p(0, 0)
	b:box(cx, (bigH + H) / 2 * M, cz, W * M, (H - bigH) * M, D * M, with({ yaw = m.yaw, mat = stone.mat, col = stone.col }, g))
	for _, y in { bigH + 0.4, 37, H - 0.3 } do
		b:box(cx, y * M, cz, (W + 1.2) * M, 0.8 * M, (D + 1.2) * M, with({ yaw = m.yaw, mat = stone.mat, col = 0xEDE4CF }, g))
	end
end

local function obelisk(b: BuildList, m: Model)
	local g = "Luxor Obelisk"
	local x, z = m.x, m.z
	b:box(x, 2.5 * M, z, 5 * M, 5 * M, 5 * M, { mat = "Granite", col = 0x8E8A84, group = g })
	b:box(x, 7 * M, z, 3.6 * M, 4 * M, 3.6 * M, { mat = "Granite", col = 0x9A968F, group = g })
	b:box(x, 15 * M, z, 2.5 * M, 12 * M, 2.5 * M, { mat = "Granite", col = 0xC7A08A, group = g })
	b:box(x, 26 * M, z, 2.1 * M, 10 * M, 2.1 * M, { mat = "Granite", col = 0xC7A08A, group = g })
	b:prism(x, z, 0, 0, 31 * M, 0, 2.1 * M, 2.4 * M, 2.1 * M, { mat = "Foil", col = 0xE2B33C, group = g })
	b:prism(x, z, math.pi / 2, 0, 31 * M, 0, 2.1 * M, 2.4 * M, 2.1 * M, { mat = "Foil", col = 0xE2B33C, group = g })
	-- the two fountains on the north-south axis of the square
	for _, sz in { -1, 1 } do
		local fz = z + sz * 40 * M
		b:cyl(x, 0.5 * M, fz, 1 * M, 15 * M, { roll = math.pi / 2, mat = "Limestone", col = 0xC9BEA6, group = g })
		b:cyl(x, 1.0 * M, fz, 0.2 * M, 14.3 * M, { roll = math.pi / 2, mat = "Glass", col = 0x5F9EC0, transp = 0.25, coll = false, group = g })
		b:cyl(x, 3 * M, fz, 4 * M, 1.4 * M, { roll = math.pi / 2, mat = "Metal", col = 0x3E5A48, group = g })
		b:cyl(x, 5 * M, fz, 0.6 * M, 5 * M, { roll = math.pi / 2, mat = "Metal", col = 0x3E5A48, group = g })
		b:cyl(x, 7.5 * M, fz, 4 * M, 0.9 * M, { roll = math.pi / 2, mat = "Metal", col = 0x3E5A48, group = g })
		b:cyl(x, 9.5 * M, fz, 0.5 * M, 2.6 * M, { roll = math.pi / 2, mat = "Foil", col = 0xD8B048, group = g })
	end
end

local function dome(b: BuildList, m: Model, top: number)
	local g = "Les Invalides"
	local x, z = m.x, m.z
	local y0 = math.max(top, 26 * M)
	b:cyl(x, y0 + 12 * M, z, 24 * M, 13 * M, { roll = math.pi / 2, mat = "Limestone", col = 0xE0D4BA, group = g })
	b:cyl(x, y0 + 24.5 * M, z, 1 * M, 14.2 * M, { roll = math.pi / 2, mat = "Limestone", col = 0xEDE4CF, group = g })
	b:ball(x, y0 + 25 * M, z, 14 * M, { mat = "Foil", col = 0xC9A53A, refl = 0.15, group = g })
	b:cyl(x, y0 + 42 * M, z, 9 * M, 3 * M, { roll = math.pi / 2, mat = "Foil", col = 0xD4B04A, group = g })
	b:ball(x, y0 + 46.5 * M, z, 3 * M, { mat = "Foil", col = 0xD4B04A, group = g })
	b:cyl(x, y0 + 56 * M, z, 16 * M, 0.5 * M, { roll = math.pi / 2, mat = "Foil", col = 0xE2BE50, group = g })
	b:ball(x, y0 + 64.5 * M, z, 1 * M, { mat = "Foil", col = 0xE2BE50, group = g })
end

local function alexandre(b: BuildList, m: Model)
	local g = "Pont Alexandre III"
	local f = frame(m.x, m.z, m.yaw)
	local half = m.w / 20 / 2 -- metres (w is in decimetres)
	for _, sx in { -1, 1 } do
		for _, sz in { -1, 1 } do
			local x, z = f.p(sx * (half - 9), sz * 22)
			b:box(x, 1.5 * M, z, 8 * M, 3 * M, 8 * M, with({ yaw = m.yaw, mat = "Granite", col = 0xB5AC9A }, g))
			b:box(x, 9 * M, z, 5.5 * M, 12 * M, 5.5 * M, with({ yaw = m.yaw, mat = "Limestone", col = 0xD6CBB2 }, g))
			b:box(x, 15.5 * M, z, 6.5 * M, 1 * M, 6.5 * M, with({ yaw = m.yaw, mat = "Limestone", col = 0xE0D4BA }, g))
			-- golden winged horse with its rider (simplified)
			b:box(x, 17.5 * M, z, 1.6 * M, 3 * M, 3.2 * M, with({ yaw = m.yaw, mat = "Foil", col = 0xE2B33C }, g))
			local wx, wz = f.p(sx * (half - 9), sz * 22 - sz * 0.2)
			b:box(wx, 19.2 * M, wz, 4.4 * M, 1.6 * M, 0.25 * M, with({ yaw = m.yaw, roll = 0.35, mat = "Foil", col = 0xE2B33C }, g))
			b:box(wx, 19.2 * M, wz, 4.4 * M, 1.6 * M, 0.25 * M, with({ yaw = m.yaw, roll = -0.35, mat = "Foil", col = 0xE2B33C }, g))
		end
	end
	-- ornate lamps along both sides of the bridge
	for i = -3, 3 do
		for _, sz in { -1, 1 } do
			local x, z = f.p(i * 14, sz * 19.5)
			b:cyl(x, (0.6 + 2.6) * M, z, 5.2 * M, 0.12 * M, { roll = math.pi / 2, mat = "Metal", col = 0x2C3A30, group = g })
			local head = b:ball(x, (0.6 + 5.6) * M, z, 0.35 * M, { mat = "SmoothPlastic", col = 0xFFF1C8, tag = "StreetLight", coll = false, group = g })
			if i % 2 == 0 then
				b:light(head, 36, 1.2, 0xFFD8A0)
			end
		end
	end
end

-- Amsterdam -----------------------------------------------------------------------------------
local function westertoren(b: BuildList, m: Model)
	local g = "Westertoren"
	local x, z, yaw = m.x, m.z, m.yaw
	local brick: Opts = { yaw = yaw, mat = "Brick", col = 0x6E3B2A, group = g }
	local stone: Opts = { yaw = yaw, mat = "Limestone", col = 0xD8CFBD, group = g }
	local wood: Opts = { yaw = yaw, mat = "WoodPlanks", col = 0x2E4A6E, group = g }
	b:box(x, 16 * M, z, 9.5 * M, 32 * M, 9.5 * M, brick)
	b:box(x, 32.4 * M, z, 10.2 * M, 0.8 * M, 10.2 * M, stone)
	b:box(x, 37.5 * M, z, 8 * M, 10 * M, 8 * M, stone)
	-- octagon: two squares turned 45 degrees
	for _, t in { 0, math.pi / 4 } do
		b:box(x, 47.5 * M, z, 6.6 * M, 10 * M, 6.6 * M, { yaw = yaw + t, mat = "Limestone", col = 0xD8CFBD, group = g })
		b:box(x, 57 * M, z, 5 * M, 9 * M, 5 * M, { yaw = yaw + t, mat = wood.mat, col = wood.col, group = g })
		b:box(x, 65 * M, z, 3.6 * M, 7 * M, 3.6 * M, { yaw = yaw + t, mat = wood.mat, col = wood.col, group = g })
	end
	-- clock faces
	for k = 0, 3 do
		local a = yaw + k * math.pi / 2
		local cx, cz = x + math.sin(a) * 4.05 * M, z + math.cos(a) * 4.05 * M
		b:cyl(cx, 39 * M, cz, 0.2 * M, 1.6 * M, { yaw = a + math.pi / 2, mat = "SmoothPlastic", col = 0xF2F0EA, group = g })
	end
	-- the blue imperial crown
	b:cyl(x, 70.5 * M, z, 1.2 * M, 2.6 * M, { roll = math.pi / 2, mat = "Foil", col = 0xD9B044, group = g })
	b:ball(x, 73 * M, z, 2.4 * M, { mat = "SmoothPlastic", col = 0x2A5BB0, group = g })
	b:cyl(x, 79 * M, z, 10 * M, 0.35 * M, { roll = math.pi / 2, mat = "Foil", col = 0xD9B044, group = g })
	b:ball(x, 84.4 * M, z, 0.7 * M, { mat = "Foil", col = 0xD9B044, group = g })
end

local function munttoren(b: BuildList, m: Model)
	local g = "Munttoren"
	local x, z, yaw = m.x, m.z, m.yaw
	local w, d = math.max(m.w / 10, 6), math.max(m.d / 10, 5)
	b:box(x, 7 * M, z, w * M, 14 * M, d * M, { yaw = yaw, mat = "Brick", col = 0x7A4532, group = g })
	b:box(x, 14.3 * M, z, (w + 0.4) * M, 0.6 * M, (d + 0.4) * M, { yaw = yaw, mat = "Limestone", col = 0xE2DACB, group = g })
	b:box(x, 17.5 * M, z, 5 * M, 6 * M, 5 * M, { yaw = yaw, mat = "Limestone", col = 0xE2DACB, group = g })
	for _, t in { 0, math.pi / 4 } do
		b:box(x, 23.5 * M, z, 4.4 * M, 6 * M, 4.4 * M, { yaw = yaw + t, mat = "Limestone", col = 0xE2DACB, group = g })
		b:box(x, 28.5 * M, z, 3.2 * M, 4 * M, 3.2 * M, { yaw = yaw + t, mat = "WoodPlanks", col = 0xE8E2D2, group = g })
	end
	for k = 0, 3 do
		local a = yaw + k * math.pi / 2
		b:cyl(x + math.sin(a) * 2.25 * M, 24 * M, z + math.cos(a) * 2.25 * M, 0.2 * M, 1.4 * M, { yaw = a + math.pi / 2, mat = "SmoothPlastic", col = 0x1E2A3A, group = g })
	end
	b:ball(x, 31.5 * M, z, 1.7 * M, { mat = "Metal", col = 0x3E4E44, group = g })
	b:cyl(x, 35.5 * M, z, 6 * M, 0.25 * M, { roll = math.pi / 2, mat = "Foil", col = 0xD9B044, group = g })
	b:ball(x, 38.6 * M, z, 0.45 * M, { mat = "Foil", col = 0xD9B044, group = g })
end

local function monument(b: BuildList, m: Model)
	local g = "National Monument"
	local x, z = m.x, m.z
	local white: Opts = { mat = "Marble", col = 0xEDE8DC, group = g }
	for i, r in { 14, 12, 10 } do
		b:cyl(x, (i - 0.5) * 0.4 * M, z, 0.4 * M, r * M, { roll = math.pi / 2, mat = white.mat, col = 0xD9D3C6, group = g })
	end
	b:box(x, 12 * M, z, 4.6 * M, 21 * M, 3.4 * M, white)
	b:box(x, 22.8 * M, z, 5.4 * M, 0.8 * M, 4.2 * M, white)
	-- the curved wall behind the pillar (east side)
	for k = 0, 8 do
		local a = -math.pi / 2 + k * math.pi / 8
		local wx, wz = x + math.cos(a) * 9 * M, z + math.sin(a) * 9 * M
		b:box(wx, 1.8 * M, wz, 0.8 * M, 2.4 * M, 3.6 * M, { yaw = -a, mat = white.mat, col = white.col, group = g })
	end
end

local function palace(b: BuildList, m: Model, top: number)
	local g = "Royal Palace"
	local x, z = m.x, m.z
	local y0 = math.max(top, 27 * M)
	for _, t in { 0, math.pi / 4 } do
		b:box(x, y0 + 4 * M, z, 9 * M, 8 * M, 9 * M, { yaw = t, mat = "Sandstone", col = 0xD9CCAE, group = g })
		b:box(x, y0 + 10 * M, z, 6 * M, 4 * M, 6 * M, { yaw = t, mat = "Sandstone", col = 0xD9CCAE, group = g })
	end
	b:ball(x, y0 + 13 * M, z, 4 * M, { mat = "Metal", col = 0x5C8C74, group = g })
	b:cyl(x, y0 + 18 * M, z, 3 * M, 0.25 * M, { roll = math.pi / 2, mat = "Foil", col = 0xD9B044, group = g })
	b:box(x, y0 + 20 * M, z, 1.6 * M, 1.1 * M, 0.3 * M, { mat = "Foil", col = 0xD9B044, group = g })
end

local function magereBrug(b: BuildList, m: Model)
	local g = "Magere Brug"
	local f = frame(m.x, m.z, m.yaw)
	local white: Opts = { mat = "WoodPlanks", col = 0xF2F0EA, group = g }
	for _, sx in { -1, 1 } do
		for _, sz in { -1, 1 } do
			local x, z = f.p(sx * 5, sz * 4.2)
			b:box(x, 5.3 * M, z, 0.6 * M, 9.4 * M, 0.6 * M, with({ yaw = m.yaw, mat = white.mat, col = white.col }, g))
		end
		local cx, cz = f.p(sx * 5, 0)
		b:box(cx, 10.2 * M, cz, 0.6 * M, 0.6 * M, 9 * M, with({ yaw = m.yaw, mat = white.mat, col = white.col }, g))
	end
	for _, sz in { -1, 1 } do
		-- the long balance beams on top
		local x, z = f.p(0, sz * 4.2)
		b:box(x, 10.9 * M, z, 26 * M, 0.7 * M, 0.5 * M, with({ yaw = m.yaw, mat = white.mat, col = white.col }, g))
		for k = -6, 6 do
			local bx, bz = f.p(k * 2, sz * 4.2)
			b:ball(bx, 11.4 * M, bz, 0.25, { mat = "SmoothPlastic", col = 0xFFE2A0, tag = "BridgeBulb", coll = false, shadow = false, group = g })
		end
	end
end

-- New York --------------------------------------------------------------------------------------
local function spire(b: BuildList, x: number, z: number, top: number, want: number, steel: boolean, g: string)
	if top >= want * M - 20 then
		return
	end
	local mat = if steel then "Metal" else "Limestone"
	local col = if steel then 0xC9CCD0 else 0xCDBFA3
	local tiers: { number } = if steel then { 12, 9.5, 7.5, 5.5, 3.6 } else { 9, 6, 3.5 }
	local h = math.min(want * M - top, 120 * M)
	local tierH = h * 0.55 / #tiers
	local y = top
	for i, r in tiers do
		b:cyl(x, y + tierH / 2, z, tierH, r * M, { roll = math.pi / 2, mat = mat, col = col, refl = if steel then 0.35 else 0, group = g })
		if i == 2 and not steel then
			b:cyl(x, y + tierH / 2, z, tierH * 0.9, (r + 0.1) * M, { roll = math.pi / 2, mat = "Neon", col = 0x4F8BFF, tag = "Billboard", coll = false, group = g })
		end
		y += tierH
	end
	b:cyl(x, y + (want * M - y) / 2, z, want * M - y, 0.7 * M, { roll = math.pi / 2, mat = "Metal", col = 0xB9BDC2, group = g })
	b:ball(x, want * M, z, 0.8 * M, { mat = "Neon", col = 0xFF3030, tag = "Beacon", coll = false, group = g })
end

local function lion(b: BuildList, m: Model)
	local g = "Library lions"
	local stone: Opts = { yaw = m.yaw, mat = "Marble", col = 0xE3DCCB, group = g }
	b:box(m.x, 0.9 * M, m.z, 1.7 * M, 1.8 * M, 4.2 * M, { yaw = m.yaw, mat = "Granite", col = 0xA9A295, group = g })
	b:box(m.x, 2.4 * M, m.z, 1.2 * M, 1.2 * M, 3 * M, stone)
	local hx, hz = Build.rot(m.yaw, 0, -1.4 * M)
	b:ball(m.x + hx, 3.4 * M, m.z + hz, 0.95 * M, stone)
	local fx, fz = Build.rot(m.yaw, 0, -1.9 * M)
	b:ball(m.x + fx, 3.3 * M, m.z + fz, 0.6 * M, stone)
end

local function prometheus(b: BuildList, m: Model)
	local g = "Prometheus"
	b:box(m.x, 1 * M, m.z, 3 * M, 2 * M, 2 * M, { mat = "Granite", col = 0x6E6A64, group = g })
	b:cyl(m.x, 5.5 * M, m.z + 1.5, 0.3 * M, 4 * M, { mat = "Foil", col = 0xE2B33C, group = g })
	b:box(m.x, 3.6 * M, m.z, 3.6 * M, 1 * M, 1.2 * M, { roll = 0.3, mat = "Foil", col = 0xE2B33C, group = g })
	b:ball(m.x + 1.6 * M, 4.4 * M, m.z, 0.5 * M, { mat = "Foil", col = 0xE2B33C, group = g })
end

local SIGNS = { "BIKE THE WORLD", "I ♥ NY", "BROADWAY", "SHOWS TONIGHT", "NEW YORK CITY", "SMILE!", "PIZZA", "TIMES SQ", "WELCOME!", "RIDE ON!" }
local NEON = { 0xFF3B6B, 0x3BC8FF, 0xFFD23B, 0x7CFF5A, 0xB06BFF, 0xFF8A2B, 0xFFFFFF }

local function timesSquare(b: BuildList, m: Model, buildings: { Decode.Building })
	local g = "Times Square"
	local rng = Build.rng(42)
	local R = 95 * M
	local placed = 0
	for _, bld in buildings do
		if placed > 60 then
			break
		end
		local n = bld.n
		for i = 1, n do
			local c = string.byte(bld.flags, i)
			if not c or c < 50 then -- "2" or "3": street fronts only
				continue
			end
			local j = i % n + 1
			local ax, az, cx, cz = bld.xs[i], bld.zs[i], bld.xs[j], bld.zs[j]
			local mx, mz = (ax + cx) / 2, (az + cz) / 2
			if (mx - m.x) ^ 2 + (mz - m.z) ^ 2 > R * R then
				continue
			end
			local dx, dz = cx - ax, cz - az
			local L = math.sqrt(dx * dx + dz * dz)
			if L < 6 * M or bld.top < 14 * M then
				continue
			end
			local ux, uz = dx / L, dz / L
			local nx, nz = -uz, ux
			local yaw = math.atan2(-uz, ux)
			local w = math.min(L * 0.8, 24 * M)
			local h = math.min(rng:range(7, 14) * M, bld.top - 8 * M)
			local y = rng:range(5, 9) * M + h / 2
			local px, pz = mx + nx * 0.6, mz + nz * 0.6
			b:box(px, y, pz, w, h, 0.6, { yaw = yaw, mat = "Neon", col = rng:pick(NEON), tag = "Billboard", coll = false, shadow = false, group = g })
			if rng:chance(0.55) then
				local sx, sz = mx + nx * 1.1, mz + nz * 1.1
				b:sign(sx, y, sz, yaw + math.pi, w * 0.9, h * 0.45, rng:pick(SIGNS), 0xFFFFFF, 0x111111)
			end
			placed += 1
			if bld.top > 40 * M and rng:chance(0.5) then
				local h2 = math.min(rng:range(8, 16) * M, bld.top - y - h)
				if h2 > 4 * M then
					b:box(px, y + h / 2 + 2 * M + h2 / 2, pz, w * 0.85, h2, 0.6, { yaw = yaw, mat = "Neon", col = rng:pick(NEON), tag = "Billboard", coll = false, shadow = false, group = g })
					placed += 1
				end
			end
		end
	end
end

local function ballDrop(b: BuildList, m: Model, top: number)
	local g = "Times Square Ball"
	local y = math.max(top, 30 * M)
	b:cyl(m.x, y + 6 * M, m.z, 12 * M, 0.3 * M, { roll = math.pi / 2, mat = "Metal", col = 0x9A9A9A, group = g })
	b:ball(m.x, y + 12 * M, m.z, 1.8 * M, { mat = "Glass", col = 0xBFE6FF, refl = 0.4, tag = "Billboard", group = g })
end

--- Add every hand-made model listed in the city's data.
function Landmarks.build(ctx: any)
	local b: BuildList = ctx.b
	local buildings: { Decode.Building } = ctx.buildings
	for _, raw in ctx.meta.models or {} do
		local m: Model = { kind = raw.kind, x = raw.x * DM, z = raw.z * DM, yaw = raw.yaw, w = raw.w, d = raw.d }
		local k = m.kind
		if k == "eiffel" then
			eiffel(b, m)
		elseif k == "arc" then
			arc(b, m)
		elseif k == "obelisk" then
			obelisk(b, m)
		elseif k == "dome" then
			dome(b, m, Landmarks.topNear(buildings, m.x, m.z, 30 * M))
		elseif k == "alexandre" then
			alexandre(b, m)
		elseif k == "westertoren" then
			westertoren(b, m)
		elseif k == "munttoren" then
			munttoren(b, m)
		elseif k == "monument" then
			monument(b, m)
		elseif k == "palace" then
			palace(b, m, Landmarks.topNear(buildings, m.x, m.z, 12 * M))
		elseif k == "magerebrug" then
			magereBrug(b, m)
		elseif k == "empirespire" then
			spire(b, m.x, m.z, Landmarks.topNear(buildings, m.x, m.z, 20 * M), 443, false, "Empire State Building")
		elseif k == "chryslercrown" then
			spire(b, m.x, m.z, Landmarks.topNear(buildings, m.x, m.z, 14 * M), 319, true, "Chrysler Building")
		elseif k == "lion" then
			lion(b, m)
		elseif k == "prometheus" then
			prometheus(b, m)
		elseif k == "timessquare" then
			timesSquare(b, m, buildings)
		elseif k == "ballDrop" then
			ballDrop(b, m, Landmarks.topNear(buildings, m.x, m.z, 10 * M))
		end
	end
end

return Landmarks
