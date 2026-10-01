--!strict
-- Paris: the Seine with stone bridges, Haussmann boulevards, the
-- Champs-Élysées from the Arc de Triomphe to Place de la Concorde, the
-- Louvre with its glass pyramid, Notre-Dame and the Eiffel Tower.

local Build = require(script.Parent.Parent.Build)
local Kit = require(script.Parent.Parent.Kit)
local Roads = require(script.Parent.Parent.Roads)
local Grid = require(script.Parent.Parent.Grid)

type BuildList = Build.BuildList
type Rng = Build.Rng

local M = Kit.M
local S = Roads.SURF
local TOP = Roads.TOP

local Paris = {}

local X0, X1 = -330 * M, 330 * M
local Z0, Z1 = -280 * M, 280 * M
local RIVER_HW = 30 * M
local QUAY_W = 19 * M -- tree promenade 6 + road 10 + pavement 3
local WATER_TOP = -2.2 * M
local WATER_DEPTH = 4 * M
local X_STREETS = { -300, -200, -100, 0, 100, 200, 300 }
local STREET_W = 14 * M
local PALETTE = { 0x4d7a35, 0x56823a, 0x5d8a3f, 0x6b8f3a }

local function zc(x: number): number
	return 18 * M * math.sin(x / (120 * M))
end

local function riverPoints(): { { number } }
	local pts = {}
	local x = X0 - 40 * M
	while x <= X1 + 40 * M do
		table.insert(pts, { x, zc(x) })
		x += 20 * M
	end
	return pts
end

--- Offset strip along the river polyline. side = -1 north bank, +1 south.
local function riverStrip(b: BuildList, d0: number, d1: number, side: number, top: number, s: Roads.Surface, cut: ((number) -> boolean)?)
	local pts = riverPoints()
	for i = 1, #pts - 1 do
		local a, c = pts[i], pts[i + 1]
		local mx = (a[1] + c[1]) / 2
		if not (cut and cut(mx)) then
			local dx, dz = c[1] - a[1], c[2] - a[2]
			local len = math.sqrt(dx * dx + dz * dz)
			local ux, uz = dx / len, dz / len
			-- normal pointing to this bank (north bank: side = -1)
			local nx, nz = -uz * side, ux * side
			local dm = (d0 + d1) / 2
			local ex, ez = ux * 1.0, uz * 1.0
			Roads.seg(b, a[1] + nx * dm - ex, a[2] + nz * dm - ez, c[1] + nx * dm + ex, c[2] + nz * dm + ez, d1 - d0, top, s)
		end
	end
end

local function nearStreet(x: number, half: number): boolean
	for _, sx in X_STREETS do
		if math.abs(x - sx * M) < half then
			return true
		end
	end
	return false
end

local function nearBridge(x: number, half: number): boolean
	for _, bx in X_STREETS do
		if bx > -300 and math.abs(x - bx * M) < half then
			return true
		end
	end
	return false
end

local function buildRiver(b: BuildList, rng: Rng)
	local pts = riverPoints()
	for i = 1, #pts - 1 do
		local a, c = pts[i], pts[i + 1]
		local dx, dz = c[1] - a[1], c[2] - a[2]
		local len = math.sqrt(dx * dx + dz * dz)
		b:addWater((a[1] + c[1]) / 2, WATER_TOP - WATER_DEPTH / 2, (a[2] + c[2]) / 2, RIVER_HW * 2 + 2, WATER_DEPTH, len + 2, math.atan2(dx, dz))
		local ux, uz = dx / len, dz / len
		for _, side in { -1, 1 } do
			local nx, nz = -uz * side, ux * side
			local o = RIVER_HW + 1
			Roads.wall(b, a[1] + nx * o, a[2] + nz * o, c[1] + nx * o, c[2] + nz * o, 2, WATER_TOP - WATER_DEPTH, TOP.edge, S.stone)
		end
	end
	-- quays on both banks: granite edge, tree promenade, road, pavement
	for _, side in { -1, 1 } do
		riverStrip(b, RIVER_HW, RIVER_HW + 6 * M, side, TOP.side, S.stone, function(x)
			return nearBridge(x, 9 * M)
		end)
		riverStrip(b, RIVER_HW + 6 * M, RIVER_HW + 16 * M, side, TOP.road, S.asphalt)
		riverStrip(b, RIVER_HW + 16 * M, RIVER_HW + QUAY_W, side, TOP.side, S.side, function(x)
			return nearStreet(x, STREET_W / 2 + 10 * M)
		end)
		-- trees and lamps along the promenade, lanes on the quay road
		local bike, walk = {}, {}
		for i, p in pts do
			local q = pts[math.min(i + 1, #pts)]
			local r = pts[math.max(i - 1, 1)]
			local dx, dz = q[1] - r[1], q[2] - r[2]
			local len = math.sqrt(dx * dx + dz * dz)
			local nx, nz = -dz / len * side, dx / len * side
			local function at(d: number): (number, number)
				return p[1] + nx * d, p[2] + nz * d
			end
			if p[1] > X0 and p[1] < X1 then
				local tx, tz = at(RIVER_HW + 3 * M)
				if not nearBridge(p[1], 12 * M) then
					if i % 3 == 0 then
						Kit.lamp(b, tx, tz)
					else
						Kit.tree(b, rng, tx, tz, 1, PALETTE)
					end
				end
				local lx, lz = at(RIVER_HW + 11 * M)
				table.insert(bike, { lx, TOP.road + 0.3, lz })
				local wx, wz = at(RIVER_HW + 17.5 * M)
				table.insert(walk, { wx, TOP.side + 0.3, wz })
				if rng:chance(0.35) then
					b:coin(lx, TOP.road + 3, lz)
				end
			end
		end
		b:lane("bike", bike)
		b:lane("walk", walk)
		local cars = {}
		for i = #bike, 1, -1 do
			table.insert(cars, bike[i])
		end
		b:lane("car", cars)
	end
	-- tour boats on the Seine
	for _, off in { -10 * M, 10 * M } do
		local lane = {}
		for _, p in pts do
			table.insert(lane, { p[1], WATER_TOP, p[2] + off })
		end
		b:lane("boat", lane)
	end
	-- stone bridges along the main streets
	for _, x in X_STREETS do
		local bx = x * M
		if bx > X0 + 20 and bx < X1 - 20 then
			local z = zc(bx)
			Roads.bridge(b, bx, z - RIVER_HW - 8 * M, bx, z + RIVER_HW + 8 * M, 18 * M, 1.4 * M, WATER_TOP, RIVER_HW * 2, { deck = S.asphalt, wall = S.stone, segs = 8, lights = true })
		end
	end
end

--- Bank building line (where the riverfront buildings stand).
local function bankLine(x: number, side: number): number
	return zc(x) + side * (RIVER_HW + QUAY_W)
end

local function haussmannPlacer(shop: boolean): Grid.Placer
	return function(b: BuildList, rng: Rng, ox: number, oz: number, yaw: number, w: number, d: number)
		Kit.haussmann(b, rng, ox, oz, yaw, w, d, shop)
	end
end

local function riverfrontRow(b: BuildList, rng: Rng, side: number)
	local x = X0 + 2
	while x < X1 - 10 * M do
		local w = rng:range(20, 28) * M
		local xa, xb = x, math.min(x + w, X1 - 2)
		x = xb
		local xm = (xa + xb) / 2
		if not nearStreet(xm, w / 2 + STREET_W / 2 + 1 * M) then
			local za, zb = bankLine(xa, side), bankLine(xb, side)
			local fx, fz = xm, (za + zb) / 2
			-- face the river
			local yaw = math.atan2(xb - xa, zb - za) + (if side < 0 then math.pi / 2 else -math.pi / 2)
			local ok = true
			-- leave room for the Eiffel Tower park and the Louvre
			if side > 0 and xm > -300 * M and xm < -100 * M then
				ok = false
			end
			if ok then
				Kit.haussmann(b, rng, fx, fz, yaw, xb - xa - 0.5, 14 * M, true)
				if rng:chance(0.4) then
					local dx, dz = Build.rot(yaw, 0, -2.2 * M)
					b:door(fx + dx, TOP.side, fz + dz, yaw)
				end
			end
		end
	end
end

-- ---------------------------------------------------------------------------
-- Landmarks
function Paris.eiffel(b: BuildList, cx: number, cz: number)
	local bronze = 0x6b5a46
	local o = { mat = "Metal", col = bronze }
	local function beam(ax: number, ay: number, az: number, bx: number, by: number, bz: number, w: number)
		b:beam(cx + ax, ay, cz + az, cx + bx, by, cz + bz, w, w, o)
	end
	local base, p1, p2, top = 36 * M, 22 * M, 11 * M, 2.2 * M
	local h1, h2, h3 = 30 * M, 62 * M, 112 * M
	for _, sx in { -1, 1 } do
		for _, sz in { -1, 1 } do
			-- four curved legs to the first platform (two beams each)
			beam(sx * base, 0, sz * base, sx * (base + p1) / 2 * 1.05, h1 * 0.5, sz * (base + p1) / 2 * 1.05, 4 * M)
			beam(sx * (base + p1) / 2 * 1.05, h1 * 0.5, sz * (base + p1) / 2 * 1.05, sx * p1, h1, sz * p1, 3.4 * M)
			beam(sx * p1, h1, sz * p1, sx * p2, h2, sz * p2, 2.6 * M)
			beam(sx * p2, h2, sz * p2, sx * top, h3, sz * top, 1.6 * M)
			-- cross bracing on each face
			beam(sx * base * 0.95, 4 * M, sz * base * 0.95, sx * p1 * 1.1, h1 * 0.9, -sz * p1 * 1.1, 0.9 * M)
		end
	end
	-- arches between the legs
	for k = 0, 3 do
		local a = k * math.pi / 2
		local ca, sa = math.cos(a), math.sin(a)
		for i = 0, 5 do
			local t0, t1 = i / 6, (i + 1) / 6
			local x0, x1 = -base * 0.8 + t0 * base * 1.6, -base * 0.8 + t1 * base * 1.6
			local y0 = h1 * 0.55 * math.sqrt(math.max(0, 1 - (x0 / (base * 0.8)) ^ 2))
			local y1 = h1 * 0.55 * math.sqrt(math.max(0, 1 - (x1 / (base * 0.8)) ^ 2))
			local d = base * 0.82
			beam(x0 * ca - d * sa, y0 + 6, x0 * sa + d * ca, x1 * ca - d * sa, y1 + 6, x1 * sa + d * ca, 1.2 * M)
		end
	end
	-- platforms
	b:box(cx, h1 + 1.5 * M, cz, p1 * 2 + 4 * M, 3 * M, p1 * 2 + 4 * M, { mat = "Metal", col = bronze })
	b:box(cx, h2 + 1 * M, cz, p2 * 2 + 3 * M, 2 * M, p2 * 2 + 3 * M, { mat = "Metal", col = bronze })
	b:box(cx, h3, cz, 4 * M, 4 * M, 4 * M, { mat = "Metal", col = bronze })
	b:box(cx, h3 + 6 * M, cz, 0.8 * M, 12 * M, 0.8 * M, { mat = "Metal", col = 0x9aa0a6 })
	-- sparkle lights for the night show
	local rng = Build.rng(1889)
	for _ = 1, 60 do
		local t = rng:next()
		local hh = t * h3
		local spread = if hh < h1 then base - (base - p1) * hh / h1 elseif hh < h2 then p1 - (p1 - p2) * (hh - h1) / (h2 - h1) else p2 - (p2 - top) * (hh - h2) / (h3 - h2)
		local sx, sz = rng:pick({ -1, 1 }), rng:pick({ -1, 1 })
		b:ball(cx + sx * spread, hh + 2, cz + sz * spread, 0.5, { mat = "Neon", col = 0xfff4c2, tag = "Sparkle", coll = false, shadow = false })
	end
	b:landmark("eiffel", "Eiffel Tower", cx, 10, cz, 70 * M, "The Eiffel Tower is 330 metres tall and was built in 1889. At night it sparkles with 20,000 lights!")
end

function Paris.arc(b: BuildList, cx: number, cz: number)
	local stone = 0xe3d6bb
	local o = { mat = "Limestone", col = stone }
	local w, d, h = 27 * M, 13 * M, 30 * M
	-- two piers
	b:box(cx - w / 2 + 4.5 * M, h * 0.35, cz, 9 * M, h * 0.7, d, o)
	b:box(cx + w / 2 - 4.5 * M, h * 0.35, cz, 9 * M, h * 0.7, d, o)
	-- arch top and attic
	b:box(cx, h * 0.62, cz, w - 18 * M + 1, h * 0.16, d, o)
	b:box(cx, h * 0.85, cz, w, h * 0.3, d, o)
	b:box(cx, h + 0.4, cz, w + 1, 0.8, d + 1, o)
	-- the eternal flame under the arch
	b:box(cx, 0.6, cz, 1.2, 1.2, 1.2, { mat = "Neon", col = 0xff7a1a, coll = false })
	b:landmark("arc", "Arc de Triomphe", cx, 10, cz, 50 * M, "The Arc de Triomphe stands in the middle of a huge roundabout where 12 avenues meet!")
end

function Paris.louvre(b: BuildList, x0: number, z0: number, x1: number, z1: number)
	local stone = 0xe0d3b6
	local roof = 0x5f666b
	local d = 16 * M
	local function wing(ax: number, az: number, bx: number, bz: number)
		local mx, mz = (ax + bx) / 2, (az + bz) / 2
		local len = math.sqrt((bx - ax) ^ 2 + (bz - az) ^ 2)
		local yaw = math.atan2(bx - ax, bz - az)
		b:box(mx, 9 * M, mz, d, 18 * M, len, { yaw = yaw, mat = "Limestone", col = stone })
		b:prism(mx, mz, yaw, 0, 18 * M, 0, d, 6 * M, len, { mat = "Metal", col = roof })
		-- windows along both sides
		local n = math.floor(len / (6 * M))
		for i = 1, n do
			local t = (i - 0.5) / n - 0.5
			for _, side in { -1, 1 } do
				local lx, lz = Build.rot(yaw, side * (d / 2 + 0.2), t * len)
				b:box(mx + lx, 9 * M, mz + lz, 0.4, 4 * M, 2 * M, { yaw = yaw, mat = "SmoothPlastic", col = 0x26323d, coll = false, shadow = false })
			end
		end
	end
	-- U-shape open to the west, around the Cour Napoléon
	wing(x0, z0 + d / 2, x1, z0 + d / 2)
	wing(x0, z1 - d / 2, x1, z1 - d / 2)
	wing(x1 - d / 2, z0 + d, x1 - d / 2, z1 - d)
	-- courtyard and the glass pyramid (built as stacked glass steps)
	local cx, cz = (x0 + x1) / 2 - 10 * M, (z0 + z1) / 2
	b:box((x0 + x1) / 2, TOP.plaza - 0.3, cz, x1 - x0, 0.6, z1 - z0 - 2 * d, { mat = "Pavement", col = 0xc9c1b0 })
	local steps = 10
	local base, h = 34 * M, 21 * M
	for i = 0, steps - 1 do
		local s = base * (1 - i / steps)
		b:box(cx, TOP.plaza + (i + 0.5) * h / steps, cz, s, h / steps, s, { mat = "Glass", col = 0x9fc3d6, transp = 0.35, refl = 0.3 })
	end
	-- fountains
	for _, sx in { -1, 1 } do
		b:cyl(cx + sx * 26 * M, TOP.plaza + 0.4, cz, 0.8, 7 * M, { roll = math.pi / 2, mat = "Granite", col = 0x6b6f73 })
	end
	b:landmark("louvre", "Louvre Pyramid", cx, 10, cz, 45 * M, "The Louvre is the world's biggest art museum. The famous Mona Lisa painting lives here!")
end

function Paris.notreDame(b: BuildList, cx: number, cz: number)
	local stone = 0xcfc4a8
	local o = { mat = "Limestone", col = stone }
	-- nave (pointing east), west facade faces -x
	b:box(cx + 30 * M, 14 * M, cz, 70 * M, 28 * M, 26 * M, o)
	b:prism(cx + 30 * M, cz, math.pi / 2, 0, 28 * M, 0, 26 * M, 12 * M, 70 * M, { mat = "Slate", col = 0x4a5258 })
	-- facade and twin towers
	b:box(cx - 8 * M, 17 * M, cz, 8 * M, 34 * M, 40 * M, o)
	for _, sz in { -1, 1 } do
		b:box(cx - 8 * M, 34 * M + 9 * M, cz + sz * 13 * M, 9 * M, 18 * M, 13 * M, o)
	end
	-- rose window and portals
	b:cyl(cx - 12.2 * M, 22 * M, cz, 0.4, 5 * M, { mat = "SmoothPlastic", col = 0x3b4f9e, coll = false })
	for _, sz in { -1, 0, 1 } do
		b:box(cx - 12.3 * M, 4 * M, cz + sz * 11 * M, 0.5, 8 * M, 5 * M, { mat = "SmoothPlastic", col = 0x3a3027, coll = false })
	end
	-- spire
	b:box(cx + 40 * M, 46 * M, cz, 1.2 * M, 26 * M, 1.2 * M, { mat = "Metal", col = 0x5d6a64 })
	b:landmark("notredame", "Notre-Dame", cx, 10, cz, 50 * M, "Notre-Dame cathedral is more than 850 years old. It was carefully rebuilt after a big fire in 2019.")
end

-- ---------------------------------------------------------------------------
function Paris.generate(): BuildList
	local b = Build.new()
	local rng = Build.rng(1789)
	buildRiver(b, rng)

	-- streets ----------------------------------------------------------------
	-- north-south streets on both banks (they meet the bridges)
	for _, xs in X_STREETS do
		local x = xs * M
		local zN = bankLine(x, -1)
		local zS = bankLine(x, 1)
		-- streets run on into the quay road so there is no curb to bump over
		Grid.street(b, x, Z0, x, zN + 5 * M, STREET_W, { layer = 1, car = true })
		if xs ~= -200 then
			Grid.street(b, x, zS - 5 * M, x, Z1, STREET_W, { layer = 1, car = true })
		end
		Grid.coins(b, rng, x, Z0, x, zN, 26 * M, 0.45)
		Grid.coins(b, rng, x, zS, x, Z1, 26 * M, 0.45)
	end
	-- east-west streets
	local Z_NORTH = { -270 * M, -110 * M }
	local Z_SOUTH = { 120 * M, 200 * M, 270 * M }
	for _, z in Z_NORTH do
		Grid.street(b, X0, z, X1, z, STREET_W, { layer = 2, car = true })
		Grid.coins(b, rng, X0, z, X1, z, 26 * M, 0.4)
	end
	for _, z in Z_SOUTH do
		Grid.street(b, X0, z, X1, z, STREET_W, { layer = 2, car = true })
		Grid.coins(b, rng, X0, z, X1, z, 26 * M, 0.4)
	end
	-- Champs-Élysées: wide avenue with bike lanes and four rows of trees
	local ZC = -190 * M
	Grid.street(b, X0, ZC, X1, ZC, 30 * M, { layer = 3, bike = true, car = true })
	for _, o in { -13.5 * M, 13.5 * M } do
		Grid.treeLine(b, rng, -300 * M + 40 * M, ZC + o, 0, ZC + o, 13 * M, PALETTE)
	end
	Grid.coins(b, rng, X0, ZC, X1, ZC, 20 * M, 0.6)

	-- blocks -------------------------------------------------------------------
	local half = STREET_W / 2 + 3 * M
	local function block(x0: number, z0: number, x1: number, z1: number)
		if x1 - x0 < 20 * M or z1 - z0 < 20 * M then
			return
		end
		Grid.pavement(b, x0, z0, x1, z1, 3 * M)
		Grid.perimeter(b, rng, x0, z0, x1, z1, 14 * M, 20 * M, 28 * M, haussmannPlacer(true), 3)
	end
	for i = 1, #X_STREETS - 1 do
		local xa, xb = X_STREETS[i] * M + half, X_STREETS[i + 1] * M - half
		local xm = (X_STREETS[i] + X_STREETS[i + 1]) / 2
		-- north rows
		block(xa, Z_NORTH[1] + half, xb, ZC - 15 * M - 3 * M)
		local tuileries = xm > 0 and xm < 100
		local louvre = xm > 100
		if not tuileries and not louvre then
			block(xa, ZC + 15 * M + 3 * M, xb, Z_NORTH[2] - half)
		end
		-- the row between Rue de Rivoli and the riverfront buildings
		local zBank = math.min(bankLine(xa, -1), bankLine(xb, -1)) - 14 * M - 4 * M
		block(xa, Z_NORTH[2] + half, xb, zBank)
		-- south rows (Champ de Mars between -300 and -100)
		local champ = xm > -300 and xm < -100
		if not champ then
			local zBankS = math.max(bankLine(xa, 1), bankLine(xb, 1)) + 14 * M + 4 * M
			if not (xm > 100 and xm < 200) then
				block(xa, zBankS, xb, Z_SOUTH[1] - half)
			end
			block(xa, Z_SOUTH[1] + half, xb, Z_SOUTH[2] - half)
			block(xa, Z_SOUTH[2] + half, xb, Z_SOUTH[3] - half)
		end
	end
	riverfrontRow(b, rng, -1)
	riverfrontRow(b, rng, 1)
	-- ground between the riverfront rows and the blocks
	for _, side in { -1, 1 } do
		riverStrip(b, RIVER_HW + QUAY_W, RIVER_HW + QUAY_W + 40 * M, side, 0.15, S.ground)
	end

	-- squares and landmarks ----------------------------------------------------
	-- Étoile roundabout with the Arc de Triomphe
	local ex, ez = -300 * M, ZC
	b:cyl(ex, TOP.road + 0.04, ez, 0.6, 42 * M, { roll = math.pi / 2, mat = "Cobblestone", col = 0x7d766c })
	b:cyl(ex, TOP.plaza + 0.1, ez, 0.8, 22 * M, { roll = math.pi / 2, mat = "Pavement", col = 0xb9b1a2 })
	Paris.arc(b, ex, ez)
	local ring = {}
	for k = 0, 24 do
		local a = k / 24 * math.pi * 2
		table.insert(ring, { ex + math.cos(a) * 32 * M, TOP.road + 0.3, ez + math.sin(a) * 32 * M })
	end
	b:lane("bike", ring, true)
	-- Place de la Concorde with its obelisk
	local cx, cz = 0, ZC
	b:box(cx, TOP.plaza - 0.3, cz, 60 * M, 0.6, 50 * M, { mat = "Cobblestone", col = 0x8d857a })
	b:box(cx, 12 * M, cz, 2.4 * M, 23 * M, 2.4 * M, { mat = "Granite", col = 0xc9a77c })
	b:box(cx, 24 * M, cz, 1.4 * M, 1.6 * M, 1.4 * M, { mat = "Metal", col = 0xd4af37 })
	for _, sx in { -1, 1 } do
		b:cyl(cx + sx * 18 * M, TOP.plaza + 0.6, cz, 1.2, 6 * M, { roll = math.pi / 2, mat = "Granite", col = 0x6b6f73 })
		b:cyl(cx + sx * 18 * M, 3 * M, cz, 4 * M, 1 * M, { roll = math.pi / 2, mat = "Metal", col = 0x8a7a3a })
	end
	b:landmark("concorde", "Place de la Concorde", cx, 10, cz, 35 * M, "This obelisk is more than 3,000 years old and came all the way from Egypt!")
	-- Tuileries garden
	local tx0, tx1 = 0 + half, 100 * M - half
	local tz0, tz1 = ZC + 18 * M, -110 * M - half
	b:box((tx0 + tx1) / 2, 0.25, (tz0 + tz1) / 2, tx1 - tx0, 0.5, tz1 - tz0, { mat = "Sand", col = 0xd8c9a3 })
	for _, z in { tz0 + 8 * M, tz1 - 8 * M } do
		Grid.treeLine(b, rng, tx0 + 6 * M, z, tx1 - 6 * M, z, 9 * M, PALETTE)
	end
	b:cyl((tx0 + tx1) / 2, 0.6, (tz0 + tz1) / 2, 1, 9 * M, { roll = math.pi / 2, mat = "Granite", col = 0x6b6f73 })
	-- Louvre (two blocks between x=100 and x=300)
	Paris.louvre(b, 100 * M + half, ZC + 18 * M, 300 * M - half, -110 * M - half)
	-- Champ de Mars and the Eiffel Tower
	local cm0, cm1 = -300 * M + half, -100 * M - half
	local czs = bankLine(-200 * M, 1) + 3 * M
	b:box((cm0 + cm1) / 2, 0.25, (czs + Z1) / 2, cm1 - cm0, 0.5, Z1 - czs, { mat = "Grass", col = 0x4d7a35 })
	b:box((cm0 + cm1) / 2, 0.3, (czs + Z1) / 2 + 20 * M, 16 * M, 0.5, Z1 - czs - 40 * M, { mat = "Sand", col = 0xd8c9a3 })
	for _, x in { cm0 + 10 * M, cm1 - 10 * M } do
		Grid.treeLine(b, rng, x, czs + 90 * M, x, Z1 - 10 * M, 11 * M, PALETTE)
	end
	Paris.eiffel(b, -200 * M, czs + 45 * M)
	b.spawn = { x = -200 * M, y = TOP.plaza + 4, z = czs + 110 * M, yaw = 0 }
	-- a carousel for the little ones
	local carx, carz = -150 * M, czs + 120 * M
	b:cyl(carx, 1, carz, 2, 8 * M, { roll = math.pi / 2, mat = "Wood", col = 0xc9a24a })
	b:cyl(carx, 7 * M, carz, 1, 8.5 * M, { roll = math.pi / 2, mat = "Fabric", col = 0xd23c3c, tag = "Spin" })
	for k = 0, 7 do
		local a = k / 8 * math.pi * 2
		b:cyl(carx + math.cos(a) * 6 * M, 3.5 * M, carz + math.sin(a) * 6 * M, 7 * M, 0.15 * M, { roll = math.pi / 2, mat = "Metal", col = 0xd4af37 })
		b:box(carx + math.cos(a) * 6 * M, 2.2 * M, carz + math.sin(a) * 6 * M, 0.8 * M, 1.2 * M, 2 * M, { yaw = a, mat = "SmoothPlastic", col = if k % 2 == 0 then 0xffffff else 0x8b5a2b })
	end
	-- Notre-Dame on the south bank
	Paris.notreDame(b, 125 * M, bankLine(150 * M, 1) + 40 * M)

	-- café terraces and boulangeries (delivery pickups)
	for _, x in { -250, -50, 50, 250 } do
		local z = Z_NORTH[2] + half + 1 * M
		for k = 0, 3 do
			Kit.cafeTable(b, rng, x * M - 12 * M + k * 7 * M, z - 3.5 * M)
		end
		b:shop(x * M, TOP.side, z - 2 * M, 0, "Boulangerie")
	end
	-- lamps on the north-south streets
	for _, xs in X_STREETS do
		local x = xs * M
		for z = Z0 + 20 * M, Z1 - 20 * M, 30 * M do
			if math.abs(z - zc(x)) > RIVER_HW + QUAY_W + 6 * M then
				Kit.lamp(b, x + STREET_W / 2 + 1.2 * M, z)
			end
		end
	end
	Grid.fence(b, X0 - 4 * M, Z0 - 10 * M, X1 + 4 * M, Z1 + 10 * M)
	b:landmark("seine", "The Seine", 0, 4, zc(0), 40 * M, "The river Seine flows right through Paris. There are 37 bridges across it in the city!")
	return b
end

return Paris
