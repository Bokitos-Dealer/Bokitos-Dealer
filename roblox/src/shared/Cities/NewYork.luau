--!strict
-- New York: a Manhattan street grid with Central Park, Broadway cutting
-- diagonally through Times Square, the Empire State and Flatiron buildings,
-- the Brooklyn Bridge and the Statue of Liberty out in the harbour.

local Build = require(script.Parent.Parent.Build)
local Kit = require(script.Parent.Parent.Kit)
local Roads = require(script.Parent.Parent.Roads)
local Grid = require(script.Parent.Parent.Grid)

type BuildList = Build.BuildList
type Rng = Build.Rng

local M = Kit.M
local S = Roads.SURF
local TOP = Roads.TOP

local NewYork = {}

local AVES = { -300, -180, -60, 60, 180, 300 }
local AVE_W = 22 * M
local ST_W = 14 * M
local Z_FIRST, Z_STEP, Z_COUNT = -400, 55, 14
local X_EDGE = 335 * M -- edge highways
local SHORE = 347 * M -- quay wall position
local Z_SOUTH = 330 * M -- southern edge street
local HARBOUR = 345 * M
local WATER_TOP = -2.5 * M
local WATER_DEPTH = 5 * M
local PARK = { x0 = -180, x1 = 180, z0 = -400, z1 = -235 }
local BROADWAY_A = { -180 * M, -235 * M }
local BROADWAY_B = { 300 * M, 300 * M }
local BROADWAY_W = 20 * M
local PALETTE = { 0x3f6b2f, 0x4d7a35, 0x56823a, 0x5d8a3f }

local function streetZ(k: number): number
	return (Z_FIRST + Z_STEP * k) * M
end

--- Distance from (x, z) to the Broadway centre line.
local function broadwayDist(x: number, z: number): number
	local ax, az = BROADWAY_A[1], BROADWAY_A[2]
	local dx, dz = BROADWAY_B[1] - ax, BROADWAY_B[2] - az
	local len = math.sqrt(dx * dx + dz * dz)
	local t = math.clamp(((x - ax) * dx + (z - az) * dz) / (len * len), 0, 1)
	local px, pz = ax + dx * t, az + dz * t
	return math.sqrt((x - px) ^ 2 + (z - pz) ^ 2)
end

local function broadwayZAt(x: number): number
	local t = (x - BROADWAY_A[1]) / (BROADWAY_B[1] - BROADWAY_A[1])
	return BROADWAY_A[2] + (BROADWAY_B[2] - BROADWAY_A[2]) * t
end

local function inPark(x: number, z: number): boolean
	return x > PARK.x0 * M and x < PARK.x1 * M and z > PARK.z0 * M and z < PARK.z1 * M
end

-- ---------------------------------------------------------------------------
-- Landmarks
function NewYork.liberty(b: BuildList, cx: number, cz: number)
	local copper = 0x5fa894
	local stone = 0xb9ad94
	-- island and star-shaped fort
	b:cyl(cx, WATER_TOP - 2, cz, WATER_DEPTH + 2 * M + 2, 34 * M, { roll = math.pi / 2, mat = "Grass", col = 0x4d7a35 })
	for k = 0, 4 do
		local a = k / 5 * math.pi * 2
		b:box(cx + math.cos(a) * 9 * M, 1.5 * M, cz + math.sin(a) * 9 * M, 18 * M, 4 * M, 9 * M, { yaw = -a, mat = "Granite", col = 0x9b927f })
	end
	b:box(cx, 4 * M, cz, 18 * M, 8 * M, 18 * M, { mat = "Granite", col = 0x9b927f })
	-- pedestal
	b:box(cx, 14 * M, cz, 12 * M, 12 * M, 12 * M, { mat = "Granite", col = stone })
	b:box(cx, 21.5 * M, cz, 9 * M, 3 * M, 9 * M, { mat = "Granite", col = stone })
	-- robe (tapering), head, crown
	local y = 23 * M
	local rs = { 4.2, 3.6, 3.0, 2.4 }
	for _, r in rs do
		b:cyl(cx, y + 3.5 * M, cz, 7 * M, r * M, { roll = math.pi / 2, mat = "Metal", col = copper })
		y += 7 * M
	end
	b:ball(cx, y + 1.6 * M, cz, 2.2 * M, { mat = "Metal", col = copper })
	for k = 0, 6 do
		local a = -math.pi / 2 + (k - 3) * 0.32
		b:beam(cx, y + 2.4 * M, cz, cx + math.sin(a) * 3.8 * M, y + 3.4 * M + math.cos(a) * 1.5 * M, cz - math.cos(a) * 3.2 * M, 0.35 * M, 0.35 * M, { mat = "Metal", col = copper })
	end
	-- raised right arm with the torch
	local sx, sy, sz = cx + 1.8 * M, y - 1.5 * M, cz
	local tx, ty, tz = cx + 3.2 * M, y + 9 * M, cz - 0.5 * M
	b:beam(sx, sy, sz, tx, ty, tz, 1.1 * M, 1.1 * M, { mat = "Metal", col = copper })
	b:cyl(tx, ty + 1.2 * M, tz, 2.4 * M, 0.7 * M, { roll = math.pi / 2, mat = "Metal", col = 0xd4af37 })
	b:ball(tx, ty + 3 * M, tz, 1 * M, { mat = "Neon", col = 0xffb020, coll = false })
	-- tablet in the left arm
	b:box(cx - 2.6 * M, y - 4 * M, cz - 1.2 * M, 1 * M, 4.5 * M, 2.6 * M, { pitch = 0.3, mat = "Metal", col = copper })
	b:landmark("liberty", "Statue of Liberty", cx, 10, cz, 210 * M, "The Statue of Liberty was a gift from France in 1886. Her torch is 93 metres above the water!")
end

function NewYork.empireState(b: BuildList, cx: number, cz: number)
	local stone = 0xb5ad9d
	local o = { mat = "Concrete", col = stone }
	b:box(cx, 12 * M, cz, 56 * M, 24 * M, 36 * M, o)
	b:box(cx, 24 * M + 45 * M, cz, 40 * M, 90 * M, 26 * M, o)
	b:box(cx, 114 * M + 10 * M, cz, 30 * M, 20 * M, 20 * M, o)
	b:box(cx, 144 * M + 4 * M, cz, 20 * M, 8 * M, 14 * M, o)
	b:box(cx, 152 * M + 3 * M, cz, 12 * M, 6 * M, 10 * M, o)
	b:cyl(cx, 158 * M + 6 * M, cz, 12 * M, 3 * M, { roll = math.pi / 2, mat = "Metal", col = 0x9aa0a6 })
	b:box(cx, 170 * M + 8 * M, cz, 1 * M, 16 * M, 1 * M, { mat = "Metal", col = 0xc0c4c8 })
	-- lit top at night
	b:box(cx, 150 * M, cz, 20.4 * M, 2 * M, 14.4 * M, { mat = "SmoothPlastic", col = 0xfff1c8, tag = "NightWindow", coll = false })
	-- vertical window stripes
	for i = -3, 3 do
		for _, side in { -1, 1 } do
			b:box(cx + i * 5 * M, 24 * M + 45 * M, cz + side * 13.1 * M, 1.2 * M, 88 * M, 0.4, { mat = "SmoothPlastic", col = 0x3a4652, coll = false, shadow = false })
		end
	end
	b:landmark("empire", "Empire State Building", cx, 10, cz, 50 * M, "The Empire State Building has 102 floors and was built in just 410 days, in 1931!")
end

function NewYork.flatiron(b: BuildList, cx: number, cz: number, yaw: number)
	-- a right-triangle prism standing upright (wedge turned on its side)
	b:wedge(cx, 32 * M, cz, 64 * M, 26 * M, 40 * M, { roll = math.pi / 2, yaw = yaw, mat = "Limestone", col = 0xd8ccb0 })
	b:landmark("flatiron", "Flatiron Building", cx, 10, cz, 40 * M, "The Flatiron Building is shaped like an old clothes iron: very thin at one end!")
end

function NewYork.timesSquare(b: BuildList, rng: Rng, cx: number, cz: number)
	local cols = { 0xff2e63, 0x08d9d6, 0xffd23f, 0x3ec300, 0xff7f11, 0x9b5de5, 0xf15bb5, 0x00bbf9 }
	local texts = { "BIKE THE WORLD", "HELLO NEW YORK", "PIZZA", "BROADWAY", "BAGELS", "BIG APPLE", "SHOWS TONIGHT", "SUPER SALE", "ICE CREAM", "NYC" }
	-- red steps (a famous place to sit)
	b:wedge(cx, 2 * M, cz, 16 * M, 4 * M, 12 * M, { yaw = 0, mat = "Glass", col = 0xd81e1e, transp = 0.1 })
	-- billboards on the surrounding buildings
	for k = 0, 9 do
		local a = k / 10 * math.pi * 2
		local r = 42 * M
		local x, z = cx + math.cos(a) * r, cz + math.sin(a) * r
		local yaw = Kit.faceYaw(-math.cos(a), -math.sin(a))
		local y = rng:range(12, 30) * M
		local w, h = rng:range(14, 22) * M, rng:range(8, 14) * M
		b:box(x, y, z, w, h, 0.6, { yaw = yaw, mat = "Neon", col = rng:pick(cols), coll = false })
		b:sign(x, y, z, yaw, w, h, texts[k + 1], 0xffffff, 0x000000)
	end
	b:landmark("timessquare", "Times Square", cx, 10, cz, 45 * M, "Times Square is so bright at night it is called 'the crossroads of the world'. On New Year's Eve a big ball drops here.")
end

function NewYork.brooklynBridge(b: BuildList, z: number, xa: number, xb: number)
	local stone = 0x9b8a72
	local H = 7 * M
	Roads.bridge(b, xa, z, xb, z, 16 * M, H, WATER_TOP, xb - xa - 30 * M, { deck = S.klinker, wall = { mat = "Metal", col = 0x6b5a46 }, segs = 16, lights = true })
	local L = (xb - xa) / 2
	local towers = { xa + (xb - xa) * 0.25, xa + (xb - xa) * 0.75 }
	for _, tx in towers do
		local deckY = Roads.hump(tx - (xa + L), H, L)
		for _, sz in { -1, 1 } do
			b:box(tx, (WATER_TOP + deckY + 40 * M) / 2, z + sz * 7 * M, 6 * M, deckY + 40 * M - WATER_TOP, 4 * M, { mat = "Granite", col = stone })
		end
		b:box(tx, deckY + 36 * M, z, 6 * M, 8 * M, 18 * M, { mat = "Granite", col = stone })
		b:box(tx, deckY + 41 * M, z, 7 * M, 2 * M, 19 * M, { mat = "Granite", col = stone })
	end
	-- main cables
	local function cable(x0: number, y0: number, x1: number, y1: number)
		for _, sz in { -1, 1 } do
			b:beam(x0, y0, z + sz * 7.5 * M, x1, y1, z + sz * 7.5 * M, 0.5 * M, 0.5 * M, { mat = "Metal", col = 0x4a4a4a })
		end
	end
	local topY = 40 * M
	local mid = (towers[1] + towers[2]) / 2
	cable(xa, 2, towers[1], topY)
	cable(towers[1], topY, (towers[1] + mid) / 2, topY * 0.55)
	cable((towers[1] + mid) / 2, topY * 0.55, mid, H + 4 * M)
	cable(mid, H + 4 * M, (mid + towers[2]) / 2, topY * 0.55)
	cable((mid + towers[2]) / 2, topY * 0.55, towers[2], topY)
	cable(towers[2], topY, xb, 2)
	b:landmark("brooklyn", "Brooklyn Bridge", (xa + xb) / 2, 10, z, 70 * M, "The Brooklyn Bridge opened in 1883. You can walk and bike across it!")
end

-- ---------------------------------------------------------------------------
local function lotBuilding(b: BuildList, rng: Rng, x0: number, z0: number, x1: number, z1: number)
	local cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
	local w, d = x1 - x0, z1 - z0
	local zM = cz / M
	local xM = cx / M
	-- face the nearest avenue or street
	local yaw = if math.abs(xM) > 240 then (if xM > 0 then -math.pi / 2 else math.pi / 2) else 0
	local fw, fd = w, d
	if yaw ~= 0 then
		fw, fd = d, w
	end
	local fx, fz = Build.rot(yaw, 0, -fd / 2)
	local ox, oz = cx + fx, cz + fz
	local height
	if zM < 0 and zM > -235 then
		height = rng:range(60, 140) * M -- Midtown
	elseif zM > 180 then
		height = rng:range(50, 160) * M -- Financial District
	else
		height = rng:range(25, 70) * M
	end
	if math.abs(xM) > 240 and rng:chance(0.6) then
		-- brownstones on the quieter side streets
		local n = math.max(1, math.floor(fw / (7 * M)))
		for i = 1, n do
			local lx = -fw / 2 + (i - 0.5) * fw / n
			local wx, wz = Build.rot(yaw, lx, 0)
			Kit.brownstone(b, rng, ox + wx, oz + wz, yaw, fw / n - 0.2, math.min(fd, 16 * M))
		end
	else
		Kit.skyscraper(b, rng, ox, oz, yaw, fw - 0.5, fd - 0.5, height)
	end
	local dx, dz = Build.rot(yaw, rng:range(-fw / 3, fw / 3), -2.2 * M)
	if rng:chance(0.35) then
		b:door(ox + dx, TOP.side, oz + dz, yaw)
	end
end

function NewYork.generate(): BuildList
	local b = Build.new()
	local rng = Build.rng(1626)
	local zTop, zBottom = streetZ(0), Z_SOUTH

	-- water: Hudson (west), East River (east), the harbour (south)
	local function water(x0: number, z0: number, x1: number, z1: number)
		local step = 600
		local x = x0
		while x < x1 do
			local xb = math.min(x + step, x1)
			local z = z0
			while z < z1 do
				local zb = math.min(z + step, z1)
				b:addWater((x + xb) / 2, WATER_TOP - WATER_DEPTH / 2, (z + zb) / 2, xb - x, WATER_DEPTH, zb - z)
				z = zb
			end
			x = xb
		end
	end
	water(-560 * M, zTop - 60 * M, -SHORE, HARBOUR + 10)
	water(SHORE, zTop - 60 * M, 470 * M, HARBOUR + 10)
	water(-560 * M, HARBOUR, 620 * M, 640 * M)
	-- quay walls
	Roads.wall(b, -SHORE, zTop - 60 * M, -SHORE, HARBOUR, 3, WATER_TOP - WATER_DEPTH, TOP.side, S.stone)
	Roads.wall(b, SHORE, zTop - 60 * M, SHORE, HARBOUR, 3, WATER_TOP - WATER_DEPTH, TOP.side, S.stone)
	Roads.wall(b, -SHORE, HARBOUR, SHORE, HARBOUR, 3, WATER_TOP - WATER_DEPTH, TOP.side, S.stone)
	-- ground slab for the whole island (blocks and pavements sit on top)
	local gx0, gx1 = -SHORE, SHORE
	local gz0, gz1 = zTop - 60 * M, HARBOUR
	local gx = gx0
	while gx < gx1 do
		local gxb = math.min(gx + 1800, gx1)
		local gz = gz0
		while gz < gz1 do
			local gzb = math.min(gz + 1800, gz1)
			b:box((gx + gxb) / 2, -1, (gz + gzb) / 2, gxb - gx, 2, gzb - gz, { mat = "Pavement", col = 0x8f8a83, shadow = false })
			gz = gzb
		end
		gx = gxb
	end

	-- streets -------------------------------------------------------------------
	for _, ax in AVES do
		local x = ax * M
		if x > PARK.x0 * M and x < PARK.x1 * M then
			Grid.street(b, x, PARK.z1 * M - ST_W / 2, x, zBottom, AVE_W, { layer = 1, car = true, bike = true })
		else
			Grid.street(b, x, zTop - 40 * M, x, zBottom, AVE_W, { layer = 1, car = true, bike = true })
		end
		Grid.coins(b, rng, x, zTop, x, zBottom, 25 * M, 0.35)
	end
	for k = 0, Z_COUNT - 1 do
		local z = streetZ(k)
		if z <= PARK.z1 * M - 1 and z >= PARK.z0 * M then
			-- streets stop at the park
			Grid.street(b, -X_EDGE, z, PARK.x0 * M, z, ST_W, { layer = 2 })
			Grid.street(b, PARK.x1 * M, z, X_EDGE, z, ST_W, { layer = 2 })
		else
			Grid.street(b, -X_EDGE, z, X_EDGE, z, ST_W, { layer = 2, car = true })
			Grid.coins(b, rng, -X_EDGE, z, X_EDGE, z, 25 * M, 0.3)
		end
	end
	-- riverside highways and the southern street
	Grid.street(b, -X_EDGE, zTop - 40 * M, -X_EDGE, zBottom, ST_W, { layer = 1, car = true })
	Grid.street(b, X_EDGE, zTop - 40 * M, X_EDGE, zBottom, ST_W, { layer = 1, car = true })
	Grid.street(b, -X_EDGE, zBottom, X_EDGE, zBottom, ST_W, { layer = 2, car = true })
	-- Broadway, the diagonal
	Grid.street(b, BROADWAY_A[1], BROADWAY_A[2], BROADWAY_B[1], BROADWAY_B[2], BROADWAY_W, { layer = 3, bike = true })
	Grid.coins(b, rng, BROADWAY_A[1], BROADWAY_A[2], BROADWAY_B[1], BROADWAY_B[2], 18 * M, 0.6)

	-- blocks ----------------------------------------------------------------------
	local hx, hz = AVE_W / 2 + 3 * M, ST_W / 2 + 3 * M
	for i = 1, #AVES - 1 do
		for k = 0, Z_COUNT - 1 do
			local x0, x1 = AVES[i] * M + hx, AVES[i + 1] * M - hx
			local z0 = streetZ(k) + hz
			local z1 = (if k == Z_COUNT - 1 then zBottom else streetZ(k + 1)) - hz
			local cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
			if not inPark(cx, cz) and z1 > z0 then
				Grid.pavement(b, x0, z0, x1, z1, 3 * M)
				-- 2-3 lots per block, skipping Broadway
				local n = rng:int(2, 3)
				for j = 0, n - 1 do
					local lx0 = x0 + (x1 - x0) * j / n
					local lx1 = x0 + (x1 - x0) * (j + 1) / n
					local lcx = (lx0 + lx1) / 2
					if broadwayDist(lcx, cz) > (BROADWAY_W / 2 + math.max(lx1 - lx0, z1 - z0) * 0.6) then
						lotBuilding(b, rng, lx0 + 0.5, z0 + 0.5, lx1 - 0.5, z1 - 0.5)
					end
				end
			end
		end
	end
	-- edge rows between the outer avenues and the riverside highways
	for _, sx in { -1, 1 } do
		for k = 0, Z_COUNT - 1 do
			local x0 = if sx < 0 then -X_EDGE + ST_W / 2 + 3 * M else 300 * M + hx
			local x1 = if sx < 0 then -300 * M - hx else X_EDGE - ST_W / 2 - 3 * M
			local z0 = streetZ(k) + hz
			local z1 = (if k == Z_COUNT - 1 then zBottom else streetZ(k + 1)) - hz
			if x1 - x0 > 8 * M and z1 - z0 > 8 * M then
				Grid.pavement(b, x0, z0, x1, z1, 3 * M)
				local yaw = if sx < 0 then math.pi / 2 else -math.pi / 2
				local n = math.max(1, math.floor((z1 - z0) / (7 * M)))
				for j = 1, n do
					local z = z0 + (j - 0.5) * (z1 - z0) / n
					local fx = if sx < 0 then x0 else x1
					Kit.brownstone(b, rng, fx, z, yaw, (z1 - z0) / n - 0.2, math.min(x1 - x0, 15 * M))
				end
			end
		end
	end

	-- Central Park -------------------------------------------------------------------
	local px0, px1, pz0, pz1 = PARK.x0 * M + hx, PARK.x1 * M - hx, PARK.z0 * M + hz, PARK.z1 * M - hz
	b:box((px0 + px1) / 2, 0.3, (pz0 + pz1) / 2, px1 - px0, 0.6, pz1 - pz0, { mat = "Grass", col = 0x4f7d34 })
	-- pond
	b:addWater(-60 * M, -1.5, -330 * M, 70 * M, 4, 40 * M)
	b:box(-60 * M, -3.5, -330 * M, 74 * M, 0.5, 44 * M, { mat = "Mud", col = 0x3a3024 })
	-- loop path
	local path = {}
	for k = 0, 40 do
		local a = k / 40 * math.pi * 2
		table.insert(path, { math.cos(a) * 140 * M, 0.9, -318 * M + math.sin(a) * 60 * M })
	end
	for k = 1, #path - 1 do
		Roads.seg(b, path[k][1], path[k][3], path[k + 1][1], path[k + 1][3], 5 * M, 0.7, S.gravel)
	end
	b:lane("bike", path, true)
	b:lane("walk", path, true)
	for _ = 1, 70 do
		local x, z = rng:range(px0 + 8 * M, px1 - 8 * M), rng:range(pz0 + 8 * M, pz1 - 8 * M)
		local onPath = math.abs(((x / (140 * M)) ^ 2 + ((z + 318 * M) / (60 * M)) ^ 2) - 1) < 0.18
		local inPond = math.abs(x + 60 * M) < 40 * M and math.abs(z + 330 * M) < 25 * M
		if not onPath and not inPond then
			Kit.tree(b, rng, x, z, 1.2, PALETTE)
		end
	end
	for k = 0, 11 do
		local a = k / 12 * math.pi * 2
		b:coin(math.cos(a) * 140 * M, 3, -318 * M + math.sin(a) * 60 * M)
	end
	b:landmark("centralpark", "Central Park", 0, 4, -318 * M, 90 * M, "Central Park is a giant park in the middle of Manhattan, bigger than the whole country of Monaco!")

	-- landmarks -------------------------------------------------------------------------
	NewYork.empireState(b, 120 * M, (streetZ(5) + streetZ(6)) / 2)
	local tsx = -60 * M
	NewYork.timesSquare(b, rng, tsx, broadwayZAt(tsx))
	local fx = 60 * M + 30 * M
	NewYork.flatiron(b, fx, broadwayZAt(60 * M) - 25 * M, math.atan2(BROADWAY_B[1] - BROADWAY_A[1], BROADWAY_B[2] - BROADWAY_A[2]))
	NewYork.liberty(b, -130 * M, 520 * M)
	-- Brooklyn: a small waterfront park across the East River
	local bz = 200 * M
	NewYork.brooklynBridge(b, bz, X_EDGE - 4 * M, 485 * M)
	b:box(540 * M, -1, 220 * M, 140 * M, 2, 260 * M, { mat = "Grass", col = 0x4f7d34 })
	Roads.wall(b, 470 * M, 90 * M, 470 * M, 350 * M, 3, WATER_TOP - WATER_DEPTH, 0.6, S.stone)
	Grid.street(b, 485 * M, 100 * M, 485 * M, 340 * M, 10 * M, { layer = 1 })
	for i = 0, 7 do
		Kit.brownstone(b, rng, 560 * M, 120 * M + i * 9 * M, math.pi / 2, 8.8 * M, 15 * M)
	end
	for i = 0, 6 do
		Kit.tree(b, rng, 505 * M, 120 * M + i * 30 * M, 1.1, PALETTE)
	end
	-- Jane's carousel by the water
	b:cyl(500 * M, 1, 300 * M, 2, 9 * M, { roll = math.pi / 2, mat = "Wood", col = 0xc9a24a })
	b:cyl(500 * M, 7 * M, 300 * M, 1, 9.5 * M, { roll = math.pi / 2, mat = "Fabric", col = 0x2a6fd6, tag = "Spin" })
	b:box(500 * M, 3 * M, 300 * M, 18 * M, 7 * M, 18 * M, { mat = "Glass", col = 0xcfe3ea, transp = 0.75, coll = false })
	-- Battery Park promenade
	for x = -320, 320, 22 do
		Kit.tree(b, rng, x * M, 340 * M, 1, PALETTE)
		if x % 44 == 0 then
			Kit.bench(b, x * M + 10 * M, 340 * M, math.pi)
		end
	end
	-- hot dog carts, hydrants, subway entrances
	for k = 1, 16 do
		local ax = AVES[rng:int(1, #AVES)] * M + AVE_W / 2 + 1.5 * M
		local z = streetZ(rng:int(4, Z_COUNT - 2)) + 12 * M
		if k % 2 == 0 then
			Kit.hydrant(b, ax, z)
		else
			b:box(ax, 1.6, z, 2 * M, 3, 1.2 * M, { mat = "Metal", col = 0xc0c4c8 })
			b:cyl(ax, 3 * M, z, 0.2, 2.2 * M, { roll = math.pi / 2, mat = "Fabric", col = if k % 4 == 1 then 0xd23c3c else 0xf2c230 })
			b:shop(ax, TOP.side, z, 0, "Hot Dog Cart")
		end
		if k % 4 == 0 then
			b:cyl(ax + 3 * M, 2 * M, z + 6 * M, 4 * M, 0.12 * M, { roll = math.pi / 2, mat = "Metal", col = 0x1e5a32 })
			b:ball(ax + 3 * M, 4.2 * M, z + 6 * M, 0.6 * M, { mat = "Neon", col = 0x3ec36b })
		end
	end
	b:shop(-60 * M + 30 * M, TOP.side, broadwayZAt(-60 * M) + 20 * M, 0, "Pizza Place")
	b:shop(180 * M + 14 * M, TOP.side, streetZ(9) + 10 * M, 0, "Bagel Shop")
	-- lamps along the avenues
	for _, ax in AVES do
		for k = 0, Z_COUNT - 1 do
			local z = streetZ(k) + 20 * M
			if not inPark(ax * M + 20, z) then
				Kit.lamp(b, ax * M - AVE_W / 2 - 1 * M, z, "modern")
			end
		end
	end
	-- one fence around everything (the harbour is open water: you can swim to Liberty Island)
	Grid.fence(b, -SHORE - 30 * M, zTop - 70 * M, 615 * M, 630 * M)
	b.spawn = { x = tsx, y = TOP.road + 4, z = broadwayZAt(tsx) + 20 * M, yaw = math.pi }
	return b
end

return NewYork
