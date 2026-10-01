--!strict
-- Amsterdam: a compact horseshoe of canals around the Dam, opening north to
-- the IJ where Centraal Station sits on its island. Pure build-list data.

local Build = require(script.Parent.Parent.Build)
local Kit = require(script.Parent.Parent.Kit)
local Roads = require(script.Parent.Parent.Roads)

type BuildList = Build.BuildList

local M = Kit.M
local S = Roads.SURF
local TOP = Roads.TOP
local P = Roads.P
local rad = math.rad

local Amsterdam = {}

local SECTOR = rad(100) -- canal ring half-angle (0 = south)
local R_PLAZA = 35 * M
local QUAY = 11 * M
local WATER_TOP = -1.8 * M
local WATER_DEPTH = 4 * M
local RAMP = 4 * M
local BRIDGE_H = 1.15 * M
local R_IJ = 75 * M -- north of this radius the wedge is open water (the IJ)

type Canal = { name: string, r: number, hw: number }
local CANALS: { Canal } = {
	{ name = "Singel", r = 95 * M, hw = 9 * M },
	{ name = "Herengracht", r = 166 * M, hw = 10 * M },
	{ name = "Keizersgracht", r = 239 * M, hw = 11 * M },
	{ name = "Prinsengracht", r = 312 * M, hw = 10 * M },
}
local R_EDGE = 363 * M

-- radial streets: angle (deg), start radius, width (m), name, bike lanes
type Radial = { deg: number, r0: number, w: number, name: string, bike: boolean?, boundary: boolean? }
local RADIALS: { Radial } = {
	{ deg = 0, r0 = R_PLAZA, w = 14, name = "Leidsestraat", bike = true },
	{ deg = -60, r0 = R_PLAZA, w = 10, name = "Raadhuisstraat" },
	{ deg = 60, r0 = R_PLAZA, w = 10, name = "Utrechtsestraat" },
	{ deg = -100, r0 = R_PLAZA, w = 10, name = "Haarlemmerstraat", boundary = true },
	{ deg = 100, r0 = R_PLAZA, w = 10, name = "Prins Hendrikkade", boundary = true },
	{ deg = -20, r0 = 75 * M, w = 9, name = "Spiegelstraat" },
	{ deg = 20, r0 = 75 * M, w = 9, name = "Vijzelstraat" },
	{ deg = -40, r0 = 75 * M, w = 9, name = "Runstraat" },
	{ deg = 40, r0 = 75 * M, w = 9, name = "Reguliersdwarsstraat" },
	{ deg = -80, r0 = 75 * M, w = 9, name = "Berenstraat" },
	{ deg = 80, r0 = 75 * M, w = 9, name = "Amstelstraat" },
}

-- Quay cross-section from the water outwards (metres): granite edge, tree
-- strip, klinker road, pavement in front of the houses.
local QUAY_XS = {
	{ w = 0.5, s = S.granite, top = TOP.edge, kind = "edge" },
	{ w = 2.5, s = S.strip, top = TOP.strip, kind = "strip" },
	{ w = 5.5, s = S.klinker, top = TOP.road, kind = "road" },
	{ w = 2.5, s = S.side, top = TOP.side, kind = "side" },
}

local function radialHW(rd: Radial): number
	return rd.w * M / 2
end

--- Angular half-width of a radial street at radius r (plus margin).
local function cutAngle(rd, r: number, margin: number): number
	return math.asin(math.clamp((radialHW(rd) + margin) / r, 0, 1))
end

--- Remaining [a,b] angle intervals of the ring sector after removing streets.
local function freeIntervals(r: number, margin: number, onlyFrom: number?): { { number } }
	local cuts = {}
	for _, rd in RADIALS do
		if rd.r0 <= r + 1 and (not onlyFrom or rd.r0 <= onlyFrom) then
			local th = rad(rd.deg)
			local a = cutAngle(rd, r, margin)
			table.insert(cuts, { th - a, th + a })
		end
	end
	table.sort(cuts, function(p, q)
		return p[1] < q[1]
	end)
	local out = {}
	local cur = -SECTOR
	for _, c in cuts do
		if c[1] > cur then
			table.insert(out, { cur, math.min(c[1], SECTOR) })
		end
		cur = math.max(cur, c[2])
	end
	if cur < SECTOR then
		table.insert(out, { cur, SECTOR })
	end
	return out
end

--- Height of a radial street at radius r (bridges over canals).
local function radialHeight(r: number): number
	local h = 0
	for _, c in CANALS do
		h = math.max(h, Roads.hump(r - c.r, BRIDGE_H, c.hw + RAMP))
	end
	return h
end

local function quayBands(c: Canal): ({ number }, { number })
	-- inner quay (water at larger r) and outer quay (water at smaller r)
	return { c.r - c.hw - QUAY, c.r - c.hw }, { c.r + c.hw, c.r + c.hw + QUAY }
end

-- ---------------------------------------------------------------------------
local function buildQuays(b: BuildList, rng: Build.Rng)
	for ci, c in CANALS do
		local inner, outer = quayBands(c)
		for side = 1, 2 do
			local band = if side == 1 then inner else outer
			-- strips listed from the water outwards
			local rWater = if side == 1 then band[2] else band[1]
			local dir = if side == 1 then -1 else 1
			local acc = 0
			for _, st in QUAY_XS do
				local ra = rWater + dir * acc * M
				local rb = rWater + dir * (acc + st.w) * M
				local r0, r1 = math.min(ra, rb), math.max(ra, rb)
				acc += st.w
				if st.kind == "road" then
					-- roads run straight through the crossings
					Roads.arc(b, r0, r1, -SECTOR, SECTOR, st.top, st.s)
					-- traffic lanes (both directions) and coins
					local rm = (r0 + r1) / 2
					for _, off in { -1.2 * M, 1.2 * M } do
						local pts = {}
						local n = math.ceil((rm * 2 * SECTOR) / 30)
						for i = 0, n do
							local th = -SECTOR + 2 * SECTOR * i / n
							local x, z = P(rm + off, th)
							table.insert(pts, { x, TOP.road + 0.1, z })
						end
						if off < 0 then
							local rev = {}
							for i = #pts, 1, -1 do
								table.insert(rev, pts[i])
							end
							pts = rev
						end
						b:lane("bike", pts)
						if ci <= 2 and off > 0 then
							b:lane("car", pts)
						end
					end
					for _, iv in freeIntervals(rm, 2 * M) do
						local th = iv[1] + 0.02
						while th < iv[2] - 0.02 do
							if rng:chance(0.45) then
								local x, z = P(rm, th)
								b:coin(x, TOP.road + 3, z)
							end
							th += (32 * M / 3) / rm
						end
					end
				else
					for _, iv in freeIntervals((r0 + r1) / 2, 0.4 * M) do
						Roads.arc(b, r0, r1, iv[1], iv[2], st.top, st.s)
					end
				end
				if st.kind == "side" then
					local rm = (r0 + r1) / 2
					for _, iv in freeIntervals(rm, 1 * M) do
						local pts = {}
						local n = math.max(1, math.ceil(rm * (iv[2] - iv[1]) / 30))
						for i = 0, n do
							local th = iv[1] + (iv[2] - iv[1]) * i / n
							local x, z = P(rm, th)
							table.insert(pts, { x, TOP.side + 0.1, z })
						end
						b:lane("walk", pts)
					end
				end
				if st.kind == "strip" then
					-- trees, lamps and parked bikes along the water
					local rm = (r0 + r1) / 2
					for _, iv in freeIntervals(rm, 4 * M) do
						local th = iv[1] + 0.01
						local k = 0
						while th < iv[2] - 0.01 do
							local x, z = P(rm, th)
							Kit.tree(b, rng, x, z, 1, { 0x3f6b2f, 0x4d7a35, 0x6b7a2f, 0x8a8a30 })
							local gapTh = th + (6 * M) / rm
							if gapTh < iv[2] then
								local gx, gz = P(rm, gapTh)
								local roll = rng:next()
								if k % 3 == 1 then
									Kit.lamp(b, gx, gz)
								elseif roll < 0.35 then
									local tx, tz = math.cos(gapTh), -math.sin(gapTh)
									for j = 0, 1 do
										Kit.parkedBike(b, rng, gx + tx * j * 2.2, gz + tz * j * 2.2, math.atan2(math.sin(gapTh), math.cos(gapTh)) + rng:range(-0.3, 0.3))
									end
								elseif roll < 0.6 then
									Kit.bench(b, gx, gz, Kit.faceYaw(-dir * math.sin(gapTh), -dir * math.cos(gapTh)))
								end
							end
							k += 1
							th += (12 * M) / rm
						end
					end
				end
			end
			-- Amsterdammertjes (bollards) between pavement and road
			local rEdge = if side == 1 then band[1] + 2.5 * M - 0.6 else band[2] - 2.5 * M + 0.6
			for _, iv in freeIntervals(rEdge, 2 * M) do
				local th = iv[1] + 0.01
				while th < iv[2] do
					if rng:chance(0.35) then
						local x, z = P(rEdge, th)
						Kit.bollard(b, x, z)
					end
					th += (8 * M) / rEdge
				end
			end
		end
		-- the canal: walls, water, houseboats, boat lane
		local r0, r1 = c.r - c.hw, c.r + c.hw
		Roads.arcWall(b, r0 - 1, -SECTOR, SECTOR, WATER_TOP - WATER_DEPTH, TOP.edge, 2, S.brick)
		Roads.arcWall(b, r1 + 1, -SECTOR, SECTOR, WATER_TOP - WATER_DEPTH, TOP.edge, 2, S.brick)
		Roads.arcWater(b, r0, r1, -SECTOR - rad(8), SECTOR + rad(8), WATER_TOP, WATER_DEPTH)
		local pts = {}
		local n = math.ceil(c.r * 2 * SECTOR / 40)
		for i = 0, n do
			local th = -SECTOR + 2 * SECTOR * i / n
			local x, z = P(c.r + 2.5 * M, th)
			table.insert(pts, { x, WATER_TOP, z })
		end
		b:lane("boat", pts)
		-- houseboats moored along the walls
		for _, sideR in { r0 + 2.4 * M, r1 - 2.4 * M } do
			for _, iv in freeIntervals(sideR, 12 * M) do
				local th = iv[1] + 0.02
				while th < iv[2] - (16 * M) / sideR do
					if rng:chance(0.45) then
						local len = rng:range(13, 18) * M
						local tm = th + (len / 2) / sideR
						local x, z = P(sideR, tm)
						local yaw = math.atan2(math.cos(tm), -math.sin(tm))
						local hull = rng:pick({ 0x1e2a24, 0x18202e, 0x2a1a16, 0x222222 })
						local cabin = rng:pick({ 0x6b4a2f, 0x2f4f3f, 0x3a5a7a, 0x8b6f47, 0xc9c3b5, 0x7a2f2a })
						b:box(x, WATER_TOP + 0.6, z, 4 * M, 1.8, len, { yaw = yaw, mat = "Wood", col = hull })
						b:obox(x, z, yaw, 0, WATER_TOP + 1.5 + 2.6, 0, 3.4 * M, 5.2, len * 0.75, { mat = "WoodPlanks", col = cabin })
						b:obox(x, z, yaw, 0, WATER_TOP + 1.5 + 5.4, 0, 3.6 * M, 0.4, len * 0.78, { mat = "Slate", col = 0x2a2a2a })
						b:obox(x, z, yaw, 0, WATER_TOP + 1.5 + 2.9, 0, 3.45 * M, 1.6, len * 0.6, { mat = "SmoothPlastic", col = 0x1d2a33, refl = 0.2, tag = "NightWindow", coll = false })
						th = tm + (len / 2 + rng:range(3, 8) * M) / sideR
					else
						th += (10 * M) / sideR
					end
				end
			end
		end
	end
end

-- ---------------------------------------------------------------------------
local function buildRadials(b: BuildList, rng: Build.Rng)
	for _, rd in RADIALS do
		local th = rad(rd.deg)
		local hw = radialHW(rd)
		local rEnd = R_EDGE
		local nx, nz = math.cos(th), -math.sin(th)
		-- radius intervals that are not bridges
		local spans = {}
		local cur = rd.r0
		for _, c in CANALS do
			local a, z2 = c.r - c.hw - RAMP, c.r + c.hw + RAMP
			if a > cur then
				table.insert(spans, { cur, a })
			end
			cur = z2
			-- the bridge itself
			local ax, az = P(a, th)
			local bx, bz = P(z2, th)
			Roads.bridge(b, ax, az, bx, bz, rd.w * M, BRIDGE_H, WATER_TOP, c.hw * 2, { lights = true, segs = 6 })
		end
		if rEnd > cur then
			table.insert(spans, { cur, rEnd })
		end
		-- road surface (plus red bike lanes on wide streets)
		for _, sp in spans do
			local ax, az = P(sp[1], th)
			local bx, bz = P(sp[2], th)
			if rd.bike then
				Roads.seg(b, ax, az, bx, bz, (rd.w - 6) * M, TOP.road + 0.06, S.asphalt)
				for _, sgn in { -1, 1 } do
					local o = sgn * (rd.w / 2 - 2.5) * M
					Roads.seg(b, ax + nx * o, az + nz * o, bx + nx * o, bz + nz * o, 2 * M, TOP.bike + 0.06, S.bike)
				end
			else
				Roads.seg(b, ax, az, bx, bz, (rd.w - 3) * M, TOP.road + 0.06, S.klinker)
			end
			-- pavements, interrupted where quay roads cross
			for _, sgn in { -1, 1 } do
				local o = sgn * (hw - (if rd.bike then 1.5 else 0.75) * M)
				local sw = (if rd.bike then 3 else 1.5) * M
				local a = sp[1]
				for _, c in CANALS do
					local inner, outer = quayBands(c)
					for _, q in { inner, outer } do
						-- road part of this quay
						local q0, q1
						if q == inner then
							q0, q1 = q[2] - 8.5 * M, q[2] - 3 * M
						else
							q0, q1 = q[1] + 3 * M, q[1] + 8.5 * M
						end
						if q0 > a and q0 < sp[2] then
							local x0, z0 = P(a, th)
							local x1, z1 = P(q0, th)
							Roads.seg(b, x0 + nx * o, z0 + nz * o, x1 + nx * o, z1 + nz * o, sw, TOP.side, S.side)
							a = math.min(q1, sp[2])
						end
					end
				end
				if sp[2] - a > 1 then
					local x0, z0 = P(a, th)
					local x1, z1 = P(sp[2], th)
					Roads.seg(b, x0 + nx * o, z0 + nz * o, x1 + nx * o, z1 + nz * o, sw, TOP.side, S.side)
				end
			end
		end
		-- along the IJ the boundary streets need a quay wall on the water side
		if rd.boundary then
			local sgn = if rd.deg > 0 then 1 else -1
			for _, sp in spans do
				local a = math.max(sp[1], R_IJ)
				if sp[2] > a + 1 then
					local o = sgn * (hw + 1)
					local x0, z0 = P(a, th)
					local x1, z1 = P(sp[2], th)
					local wx0, wz0, wx1, wz1 = x0 + nx * o, z0 + nz * o, x1 + nx * o, z1 + nz * o
					local len = math.sqrt((wx1 - wx0) ^ 2 + (wz1 - wz0) ^ 2)
					b:box((wx0 + wx1) / 2, (WATER_TOP - WATER_DEPTH + TOP.side) / 2, (wz0 + wz1) / 2, 2, TOP.side - (WATER_TOP - WATER_DEPTH), len, { yaw = math.atan2(wx1 - wx0, wz1 - wz0), mat = S.brick.mat, col = S.brick.col })
				end
			end
		end
		-- lanes: both directions, following the bridge humps
		for _, sgn in { -1, 1 } do
			local o = sgn * 1.4 * M
			local pts = {}
			local r = rd.r0
			while r <= rEnd do
				local x, z = P(r, th)
				table.insert(pts, { x + nx * o, radialHeight(r) + TOP.road + 0.3, z + nz * o })
				r += 6 * M
			end
			if sgn > 0 then
				local rev = {}
				for i = #pts, 1, -1 do
					table.insert(rev, pts[i])
				end
				pts = rev
			end
			b:lane("bike", pts)
			local wpts = {}
			for _, p in pts do
				table.insert(wpts, { p[1] + nx * sgn * (hw - 1.6 * M - 1.4 * M), p[2] + 0.4, p[3] + nz * sgn * (hw - 1.6 * M - 1.4 * M) })
			end
			b:lane("walk", wpts)
		end
		-- coins along the street
		local r = rd.r0 + 10 * M
		while r < rEnd - 5 * M do
			if rng:chance(0.4) then
				local x, z = P(r, th)
				b:coin(x, radialHeight(r) + 3, z)
			end
			r += 22 * M
		end
		-- lamps on the pavements
		r = rd.r0 + 8 * M
		local s = 1
		while r < rEnd do
			if radialHeight(r) < 0.01 then
				local x, z = P(r, th)
				local o = s * (hw - 0.8 * M)
				Kit.lamp(b, x + nx * o, z + nz * o)
			end
			s = -s
			r += 26 * M
		end
	end
end

-- ---------------------------------------------------------------------------
-- Houses on every block face
local function houseRow(b: BuildList, rng: Build.Rng, R: number, facing: number, depth: number, th0: number, th1: number, floorsMin: number, floorsMax: number, doorsEvery: number)
	local len = R * (th1 - th0)
	if len < 6 * M then
		return
	end
	local acc = 0
	local count = 0
	while acc < len - 4 * M do
		local w = rng:range(7, 10.5) * M
		if len - acc - w < 5 * M then
			w = len - acc
		end
		local tA = th0 + acc / R
		local tB = th0 + (acc + w) / R
		local tm = (tA + tB) / 2
		local chord = 2 * R * math.sin((tB - tA) / 2)
		local fx, fz = P(R * math.cos((tB - tA) / 2), tm)
		local nx, nz = math.sin(tm) * facing, math.cos(tm) * facing
		local yaw = Kit.faceYaw(nx, nz)
		local _, doorLx = Kit.canalHouse(b, rng, fx, fz, yaw, chord - 0.2, depth, rng:int(floorsMin, floorsMax))
		count += 1
		if count % doorsEvery == 0 then
			local lx, lz = Build.rot(yaw, doorLx, -2 * M)
			b:door(fx + lx, TOP.side, fz + lz, yaw)
		end
		acc += w
	end
end

local function blockFaces(b: BuildList, rng: Build.Rng, r0: number, r1: number, onlyInner: boolean?, onlyOuter: boolean?, exOuter: { { number } }?, exInner: { { number } }?)
	local depth = math.min(14 * M, (r1 - r0) / 2 - 0.5)
	local function skip(a: number, z: number, list: { { number } }?): boolean
		if not list then
			return false
		end
		for _, ex in list do
			if a < ex[2] and z > ex[1] then
				return true
			end
		end
		return false
	end
	if not onlyOuter then
		for _, iv in freeIntervals(r0, 0.3 * M, r0) do
			if not skip(iv[1], iv[2], exInner) then
				houseRow(b, rng, r0, -1, depth, iv[1], iv[2], 3, 4, 3)
			end
		end
	end
	if not onlyInner then
		for _, iv in freeIntervals(r1, 0.3 * M, r1) do
			if not skip(iv[1], iv[2], exOuter) then
				houseRow(b, rng, r1, 1, depth, iv[1], iv[2], 3, 4, 3)
			end
		end
	end
	-- ground under the block (courtyards)
	Roads.arc(b, r0, r1, -SECTOR, SECTOR, 0.1, S.ground, 60)
end

-- ---------------------------------------------------------------------------
-- The north: Damrak, Prins Hendrikkade, the IJ and Centraal Station
local function buildNorth(b: BuildList, rng: Build.Rng)
	-- open water of the IJ in the north wedge
	for r = R_IJ, R_EDGE + 140 * M, 60 * M do
		local r1 = r + 60 * M
		Roads.arcWater(b, r, r1, SECTOR + rad(1), 2 * math.pi - SECTOR - rad(1), WATER_TOP, WATER_DEPTH)
	end
	-- old-centre houses north of the Dam (between the boundary streets)
	local wedge0, wedge1 = SECTOR + cutAngle(RADIALS[4], 50 * M, 0.3 * M), 2 * math.pi - SECTOR - cutAngle(RADIALS[4], 50 * M, 0.3 * M)
	local dam0 = math.pi - math.asin(13 * M / R_PLAZA)
	Roads.arc(b, R_PLAZA, 64 * M, SECTOR, 2 * math.pi - SECTOR, 0.1, S.ground, 60)
	for _, iv in { { wedge0, math.pi - math.asin(13 * M / (64 * M)) }, { math.pi + math.asin(13 * M / (64 * M)), wedge1 } } do
		houseRow(b, rng, 64 * M, 1, 13 * M, iv[1], iv[2], 4, 5, 2)
	end
	houseRow(b, rng, R_PLAZA + 0.2, -1, 12 * M, wedge0, dam0, 4, 5, 2)
	-- (the west side of the Dam is the Royal Palace)
	-- Prins Hendrikkade along the water
	Roads.arc(b, 64 * M, 72 * M, SECTOR, 2 * math.pi - SECTOR, TOP.road, S.asphalt)
	Roads.arc(b, 72 * M, 75 * M, SECTOR, 2 * math.pi - SECTOR, TOP.side, S.side)
	Roads.arcWall(b, R_IJ + 1, SECTOR, 2 * math.pi - SECTOR, WATER_TOP - WATER_DEPTH, TOP.side, 2, S.brick)
	-- Damrak (north) from the Dam to the station island, with bike lanes
	local zA, zB = -R_PLAZA, -R_IJ
	Roads.seg(b, 0, zA, 0, zB, 14 * M, TOP.road + 0.06, S.asphalt)
	for _, sx in { -1, 1 } do
		Roads.seg(b, sx * 8.5 * M, zA, sx * 8.5 * M, zB, 2.5 * M, TOP.bike + 0.06, S.bike)
		Roads.seg(b, sx * 11 * M, zA, sx * 11 * M, -64 * M, 2.5 * M, TOP.side, S.side)
	end
	-- low bridge over the water to the island
	Roads.bridge(b, 0, -R_IJ + 2, 0, -128 * M - 2, 24 * M, 0.5 * M, WATER_TOP, 30 * M, { deck = S.asphalt, wall = S.stone, segs = 10, lights = true })
	-- station island
	local ix0, ix1, iz0, iz1 = -75 * M, 75 * M, -176 * M, -128 * M
	b:box(0, -WATER_DEPTH / 2 + 0.15, (iz0 + iz1) / 2, ix1 - ix0, WATER_DEPTH * 2 + 0.3, iz1 - iz0, { mat = "Pavement", col = 0xb4ac9d })
	-- Centraal Station
	Amsterdam.station(b, rng, 0, -158 * M)
	b.spawn = { x = 0, y = TOP.plaza + 4, z = -132 * M, yaw = math.pi }
	-- parked bikes in front of the station (there are thousands in real life)
	for row = 0, 2 do
		for i = -18, 18 do
			if math.abs(i) > 4 and rng:chance(0.85) then
				Kit.parkedBike(b, rng, i * 2.2 + rng:range(-0.3, 0.3), -136 * M - row * 3 * M, rng:range(-0.15, 0.15))
			end
		end
	end
	-- lanes on Damrak
	for _, sx in { -1, 1 } do
		local pts = {}
		for z = zA, -128 * M, -15 do
			local u = z - (-R_IJ + 2 + (-128 * M - 2)) / 2
			local L = (128 * M - R_IJ + 4) / 2
			local h = if z < -R_IJ then Roads.hump(u, 0.5 * M, L) + 0.3 else TOP.road
			table.insert(pts, { sx * 8.5 * M, h + 0.3, z })
		end
		if sx > 0 then
			local rev = {}
			for i = #pts, 1, -1 do
				table.insert(rev, pts[i])
			end
			pts = rev
		end
		b:lane("bike", pts)
	end
	-- a windmill on the east waterfront (De Gooyer style)
	local wx, wz = P(R_EDGE - 10 * M, SECTOR - rad(4))
	Amsterdam.windmill(b, wx, wz)
	b:landmark("windmill", "Windmill", wx, 10, wz, 40 * M, "The Netherlands has about 1,000 windmills. They used to pump water out of the low land!")
end

-- ---------------------------------------------------------------------------
-- Landmarks
function Amsterdam.station(b: BuildList, rng: Build.Rng, cx: number, cz: number)
	local w, d = 120 * M, 22 * M
	local brick = 0x8a3f2c
	local yaw = math.pi -- facade faces +z (towards the city)
	b:obox(cx, cz, yaw, 0, 9 * M, 0, w, 18 * M, d, { mat = "Brick", col = brick })
	-- windows rows
	for f = 0, 2 do
		for i = -12, 12 do
			b:obox(cx, cz, yaw, i * 4.5 * M, (3 + f * 5) * M, -d / 2 - 0.2, 1.6 * M, 2.8 * M, 0.5, { mat = "SmoothPlastic", col = 0x26323d, refl = 0.2, tag = if rng:chance(0.4) then "NightWindow" else nil, coll = false, shadow = false })
		end
	end
	-- light stone bands
	for _, y in { 5.5, 10.5, 15.5 } do
		b:obox(cx, cz, yaw, 0, y * M, -d / 2 - 0.3, w + 0.5, 0.6 * M, 0.8, { mat = "Limestone", col = 0xd8ccb3, coll = false })
	end
	-- central hall with a gable
	b:obox(cx, cz, yaw, 0, 12 * M, -2 * M, 30 * M, 24 * M, d, { mat = "Brick", col = brick })
	b:prism(cx, cz, yaw, 0, 24 * M, -2 * M, 30 * M, 8 * M, d, { mat = "Slate", col = 0x4f6a63 })
	-- two towers with clocks
	for _, sx in { -1, 1 } do
		local tx = sx * 20 * M
		b:obox(cx, cz, yaw, tx, 17 * M, -d / 2 + 3 * M, 7 * M, 34 * M, 7 * M, { mat = "Brick", col = brick })
		b:obox(cx, cz, yaw, tx, 34.5 * M, -d / 2 + 3 * M, 7.8 * M, 1 * M, 7.8 * M, { mat = "Limestone", col = 0xd8ccb3 })
		-- pointed roof: two crossing gables
		b:prism(cx, cz, yaw, tx, 35 * M, -d / 2 + 3 * M, 7.6 * M, 8 * M, 7.6 * M, { mat = "Slate", col = 0x4f6a63 })
		b:prism(cx, cz, yaw + math.pi / 2, d / 2 - 3 * M, 35 * M, tx, 7.6 * M, 8 * M, 7.6 * M, { mat = "Slate", col = 0x4f6a63 })
		local fx, fz = Build.rot(yaw, tx, -d / 2 - 0.6 + 3 * M - 3.6 * M)
		b:cyl(cx + fx, 28 * M, cz + fz, 0.4, 2.2 * M, { yaw = yaw + math.pi / 2, mat = "SmoothPlastic", col = if sx < 0 then 0xf2efe6 else 0xe7c46a, coll = false })
	end
	-- arched entrances
	for i = -2, 2 do
		b:obox(cx, cz, yaw, i * 6 * M, 3 * M, -d / 2 - 0.3, 4 * M, 6 * M, 0.6, { mat = "SmoothPlastic", col = 0x2a201b, coll = false })
	end
	b:landmark("centraal", "Centraal Station", cx, 10, cz + d, 45 * M, "Amsterdam Centraal opened in 1889 and is built on three artificial islands. Its bike parking holds thousands of bikes!")
end

function Amsterdam.windmill(b: BuildList, x: number, z: number)
	b:box(x, 4 * M, z, 9 * M, 8 * M, 9 * M, { mat = "Brick", col = 0x6b4a3a })
	b:cyl(x, 14 * M, z, 12 * M, 3.6 * M, { roll = math.pi / 2, mat = "WoodPlanks", col = 0x5a4636 })
	b:ball(x, 20 * M, z, 3.9 * M, { mat = "Slate", col = 0x3a3a3a })
	-- sails (cross)
	for i = 0, 3 do
		local a = i * math.pi / 2 + 0.3
		local sx, sy = math.cos(a) * 7 * M, math.sin(a) * 7 * M
		-- each sail's long axis (local Y) points along angle a
		b:box(x + sx, 20 * M + sy, z - 4.2 * M, 1.6 * M, 14 * M, 0.4, { roll = a - math.pi / 2, mat = "WoodPlanks", col = 0xe9e4d8, tag = "Sail" })
	end
end

local function damSquare(b: BuildList, rng: Build.Rng)
	-- plaza disc
	b:cyl(0, TOP.plaza - 0.3, 0, 0.6, R_PLAZA + 1, { roll = math.pi / 2, mat = "Pavement", col = 0xb9b1a2 })
	-- National Monument (white obelisk)
	local mx, mz = P(22 * M, rad(80))
	for i = 0, 2 do
		b:cyl(mx, TOP.plaza + i * 0.4 * M, mz, 0.4 * M, (9 - i * 1.5) * M, { roll = math.pi / 2, mat = "Limestone", col = 0xe0dbcf })
	end
	b:box(mx, 12 * M, mz, 2.6 * M, 22 * M, 2.6 * M, { mat = "Limestone", col = 0xeee9dd })
	b:landmark("monument", "National Monument", mx, 10, mz, 20 * M, "This white pillar on the Dam remembers the people who died in the Second World War.")
	-- Royal Palace on the west side of the Dam
	local th = rad(-125)
	local px, pz = P(R_PLAZA + 1 + 7 * M, th)
	local yaw = Kit.faceYaw(-math.sin(th), -math.cos(th))
	b:obox(px, pz, yaw, 0, 12 * M, 0, 40 * M, 24 * M, 14 * M, { mat = "Limestone", col = 0xcbbd9e })
	for f = 0, 3 do
		for i = -4, 4 do
			b:obox(px, pz, yaw, i * 4.4 * M, (3 + f * 5.5) * M, -7 * M - 0.2, 1.6 * M, 3 * M, 0.5, { mat = "SmoothPlastic", col = 0x26323d, coll = false, shadow = false, tag = if rng:chance(0.3) then "NightWindow" else nil })
		end
	end
	b:obox(px, pz, yaw, 0, 25 * M, 0, 36 * M, 2 * M, 12 * M, { mat = "Metal", col = 0x5b5e60 })
	b:cyl(px, 29 * M, pz, 6 * M, 4 * M, { roll = math.pi / 2, mat = "Limestone", col = 0xd6c9aa })
	b:ball(px, 33 * M, pz, 4.2 * M, { mat = "Metal", col = 0x4f8f7a })
	b:box(px, 38 * M, pz, 0.4, 5 * M, 0.4, { mat = "Metal", col = 0xd4af37 })
	b:landmark("palace", "Royal Palace", px, 10, pz, 40 * M, "The Royal Palace on the Dam was built as the city hall in the 1600s. Today the King uses it for big events.")
	b:landmark("dam", "Dam Square", 0, 4, 0, 25 * M, "Amsterdam began here: people built a dam in the river Amstel, and that is how the city got its name.")
	-- pigeons' favourite benches
	for i = 0, 5 do
		local bx, bz = P(28 * M, rad(i * 60 + 10))
		if math.abs(math.atan2(bx, bz)) < math.pi * 0.9 then
			Kit.bench(b, bx, bz, rad(i * 60 + 10))
		end
	end
end

local function westerkerk(b: BuildList)
	local th = rad(-70)
	local r = 202 * M
	local x, z = P(r, th)
	local yaw = Kit.faceYaw(math.sin(th), math.cos(th))
	b:obox(x, z, yaw, 0, 8 * M, 0, 16 * M, 16 * M, 26 * M, { mat = "Brick", col = 0x7d3a2b })
	b:prism(x, z, yaw, 0, 16 * M, 0, 16 * M, 10 * M, 26 * M, { mat = "Slate", col = 0x3b4447 })
	-- tower towards the Keizersgracht
	local tx, tz = Build.rot(yaw, 0, -15 * M)
	local cx, cz = x + tx, z + tz
	b:box(cx, 14 * M, cz, 7 * M, 28 * M, 7 * M, { mat = "Brick", col = 0x7d3a2b })
	b:box(cx, 32 * M, cz, 6 * M, 8 * M, 6 * M, { mat = "Limestone", col = 0xcfc6b3 })
	b:cyl(cx, 40 * M, cz, 8 * M, 2.6 * M, { roll = math.pi / 2, mat = "Limestone", col = 0xd8d0bf })
	b:cyl(cx, 47 * M, cz, 6 * M, 1.9 * M, { roll = math.pi / 2, mat = "Limestone", col = 0xcfc6b3 })
	-- the blue imperial crown
	b:ball(cx, 51.5 * M, cz, 2.2 * M, { mat = "SmoothPlastic", col = 0x2c4f9e })
	b:cyl(cx, 50.2 * M, cz, 0.6 * M, 2.3 * M, { roll = math.pi / 2, mat = "Metal", col = 0xd4af37 })
	b:box(cx, 57 * M, cz, 0.5, 9 * M, 0.5, { mat = "Metal", col = 0xd4af37 })
	b:landmark("westerkerk", "Westerkerk", cx, 10, cz, 45 * M, "Its tower has a blue crown on top and is the tallest church tower in Amsterdam. The famous painter Rembrandt is buried here.")
	return { th - 0.12, th + 0.12 }
end

local function munttoren(b: BuildList)
	local x, z = P(70 * M, rad(10))
	b:box(x, 6 * M, z, 6 * M, 12 * M, 6 * M, { mat = "Brick", col = 0x7d3a2b })
	b:cyl(x, 15 * M, z, 6 * M, 2.6 * M, { roll = math.pi / 2, mat = "Limestone", col = 0xe3dccb })
	b:ball(x, 19 * M, z, 2.4 * M, { mat = "Metal", col = 0x3d5e55 })
	b:box(x, 23 * M, z, 0.6, 6 * M, 0.6, { mat = "Metal", col = 0xd4af37 })
	b:landmark("munt", "Munttoren", x, 10, z, 30 * M, "The Mint Tower: coins were made here a long time ago, in 1672 and 1673.")
	return { rad(10) - 0.15, rad(10) + 0.15 }
end

local function bloemenmarkt(b: BuildList, rng: Build.Rng)
	local cols = { 0xe23d3d, 0xf2c230, 0xf07ab0, 0xffffff, 0xff7f2a, 0x8e4ad6 }
	for deg = -15, -6, 1.6 do
		local th = rad(deg)
		local x, z = P(86 * M + 3 * M, th)
		local yaw = Kit.faceYaw(-math.sin(th), -math.cos(th))
		b:obox(x, z, yaw, 0, WATER_TOP + 1, 0, 4 * M, 2, 5 * M, { mat = "Wood", col = 0x2d3b2f })
		b:obox(x, z, yaw, 0, WATER_TOP + 1 + 2.5 * M, 0, 3.6 * M, 4.6 * M, 4.4 * M, { mat = "Glass", col = 0xe9efe7, transp = 0.3 })
		b:obox(x, z, yaw, 0, WATER_TOP + 1 + 4.9 * M, 0, 4 * M, 0.4 * M, 5 * M, { mat = "SmoothPlastic", col = 0x2f5d3a })
		for k = -2, 2 do
			b:obox(x, z, yaw, k * 0.75 * M, 0.9, -2.8 * M, 0.6 * M, 0.6 * M, 0.6 * M, { mat = "SmoothPlastic", col = rng:pick(cols), coll = false })
		end
	end
	local x, z = P(86 * M, rad(-10))
	b:landmark("bloemenmarkt", "Flower Market", x, 4, z, 30 * M, "The Bloemenmarkt is a flower market that floats on the Singel canal. Look for tulips!")
	b:shop(x, TOP.side, z, 0, "Flower Market")
end

function Amsterdam.generate(): BuildList
	local b = Build.new()
	local rng = Build.rng(1606)
	damSquare(b, rng)
	buildQuays(b, rng)
	buildRadials(b, rng)
	-- block bands
	local wk = westerkerk(b)
	local mt = munttoren(b)
	blockFaces(b, rng, R_PLAZA, CANALS[1].r - CANALS[1].hw - QUAY, false, false, { mt }, nil)
	for i = 1, #CANALS - 1 do
		local r0 = CANALS[i].r + CANALS[i].hw + QUAY
		local r1 = CANALS[i + 1].r - CANALS[i + 1].hw - QUAY
		local ex = if i == 2 then { wk } else nil
		blockFaces(b, rng, r0, r1, false, false, ex, ex)
	end
	-- outer row facing the Prinsengracht
	blockFaces(b, rng, CANALS[4].r + CANALS[4].hw + QUAY, R_EDGE, true)
	buildNorth(b, rng)
	bloemenmarkt(b, rng)
	-- an invisible fence around the edge of the city
	Roads.arcWall(b, R_EDGE + 2, -SECTOR, SECTOR, -2, 40, 2, { mat = "SmoothPlastic", col = 0xffffff }, 60)
	for i = #b.prims, 1, -1 do
		local p = b.prims[i]
		if p.mat == "SmoothPlastic" and p.col == 0xffffff and p.sy == 42 then
			p.transp = 1
			p.shadow = false
		else
			break
		end
	end
	-- a few cafés and shops as delivery pickup points
	for _, deg in { -50, -10, 30, 70 } do
		local x, z = P(CANALS[2].r - CANALS[2].hw - QUAY + 1 * M, rad(deg))
		b:shop(x, TOP.side, z, 0, "Café")
	end
	return b
end

Amsterdam.info = {
	radius = R_EDGE,
	waterTop = WATER_TOP,
}

return Amsterdam
