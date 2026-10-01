--!strict
-- Builds a real city (from OpenStreetMap data) as a build list for the
-- server: buildings, streets, bridges, quay walls, terrain (ground, water,
-- grass), trees, lamps and other street furniture, plus the points of
-- interest the game needs (landmarks, coins, shops, doors, spawn).

local Build = require(script.Parent.Parent.Build)
local Kit = require(script.Parent.Parent.Kit)
local Roads = require(script.Parent.Parent.Roads)
local Buildings = require(script.Parent.Buildings)
local Decode = require(script.Parent.Decode)
local Look = require(script.Parent.Look)
local Mass = require(script.Parent.Mass)

type BuildList = Build.BuildList
type Opts = Build.Opts

local M = Look.M
local DM = Decode.DM

local Generate = {}

export type CityData = {
	meta: any,
	buildings: { any },
	roads: { any },
	areas: { any },
	props: { any },
	lanes: { any },
}

export type Context = {
	b: BuildList,
	buildings: { Decode.Building },
	meta: any,
	style: string,
	look: Look.CityLook,
	wl: number, -- water level (studs)
	rng: Build.Rng,
}

export type TerrainSpec = {
	bounds: { number }, -- x0, z0, x1, z1 (studs, relative to the city origin)
	waterLevel: number,
	polys: { { kind: number, rings: { { number } } } },
}

-- top of each kind of street surface (studs); slightly different so crossing
-- streets never flicker
local TOP = { [1] = 0.18, [2] = 0.22, [3] = 0.15, [4] = 0.12, [5] = 0.25 }
local DECK = 0.6 -- top of a bridge deck

-- Streets ---------------------------------------------------------------------------
local function streets(ctx: Context, roads: { Decode.Road })
	local b = ctx.b
	local look = ctx.look
	for _, r in roads do
		if r.kind == 6 then
			continue -- tram rails are drawn by the client
		end
		local bridge = bit32.band(r.flags, 1) ~= 0
		local hasDeck = bit32.band(r.flags, 8) ~= 0
		local width = math.max(r.width, if r.kind == 1 then 4 * M else 1.4 * M)
		local top = (TOP[r.kind] or 0.15) + (if bridge then DECK + 0.05 else 0)
		local surf = Look.SURF[r.surf] or Look.SURF[0]
		local s: Roads.Surface = { mat = surf.mat, col = surf.col }
		local xs, zs = r.xs, r.zs
		local n = #xs
		for i = 1, n - 1 do
			local ax, az, bx, bz = xs[i], zs[i], xs[i + 1], zs[i + 1]
			local dx, dz = bx - ax, bz - az
			local len = math.sqrt(dx * dx + dz * dz)
			if len < 0.1 then
				continue
			end
			local ux, uz = dx / len, dz / len
			-- overlap at bends so corners have no gaps
			local ext = math.min(width / 2, 6)
			if i > 1 then
				ax -= ux * ext
				az -= uz * ext
			end
			if i < n - 1 then
				bx += ux * ext
				bz += uz * ext
			end
			Roads.seg(b, ax, az, bx, bz, width, top, s)
			if bridge and not hasDeck then
				-- a simple bridge: a deck and low walls on both sides
				local dw = width + 1.2 * M
				Roads.seg(b, xs[i], zs[i], xs[i + 1], zs[i + 1], dw, top - 0.3, look.deck, { coll = true })
				local p = b.prims[#b.prims]
				p.y -= 0.5
				p.sy = 1.6
				local nx, nz = -uz, ux
				for _, side in { -1, 1 } do
					local off = side * (dw / 2 - 0.3)
					Roads.wall(b, xs[i] + nx * off, zs[i] + nz * off, xs[i + 1] + nx * off, zs[i + 1] + nz * off, 0.6, top - 0.3, top + 1.1 * M, look.parapet)
				end
			end
		end
	end
end

-- Water edges, bridge decks, piers ------------------------------------------------------------
local function areas(ctx: Context, list: { Decode.Area }, terrain: TerrainSpec)
	local b = ctx.b
	local look = ctx.look
	local wl = ctx.wl
	for _, a in list do
		local k = a.kind
		if k == 1 or k == 2 or k == 3 or k == 4 or k == 5 or k == 8 then
			table.insert(terrain.polys, { kind = k, rings = a.rings })
		end
		if k == 1 then
			-- quay walls with a stone edge on top
			for ri, ring in a.rings do
				local fl = a.flags[ri]
				local n = #ring // 2
				for i = 1, n do
					if fl[i] ~= 1 then
						continue
					end
					local j = i % n + 1
					local ax, az, bx, bz = ring[2 * i - 1], ring[2 * i], ring[2 * j - 1], ring[2 * j]
					local dx, dz = bx - ax, bz - az
					local len = math.sqrt(dx * dx + dz * dz)
					if len < 0.2 then
						continue
					end
					-- outwards from the water = towards the land
					local nx, nz = -dz / len, dx / len
					Roads.wall(b, ax - nx * 0.75, az - nz * 0.75, bx - nx * 0.75, bz - nz * 0.75, 1.5, wl - 14, 0.1, look.quay)
					Roads.wall(b, ax + nx * 1.0, az + nz * 1.0, bx + nx * 1.0, bz + nz * 1.0, 4.5, -0.4, 0.22, look.cap)
				end
			end
		elseif k == 6 then
			local ring = a.rings[1]
			if ring then
				-- thin enough for small boats to pass underneath
				Mass.fillRing(b, ring, -1.0, DECK, { mat = look.deck.mat, col = look.deck.col })
				local fl = a.flags[1]
				local n = #ring // 2
				for i = 1, n do
					if fl[i] == 1 then
						local j = i % n + 1
						local ax, az, bx, bz = ring[2 * i - 1], ring[2 * i], ring[2 * j - 1], ring[2 * j]
						local dx, dz = bx - ax, bz - az
						local len = math.sqrt(dx * dx + dz * dz)
						if len > 0.5 then
							local nx, nz = -dz / len, dx / len
							Roads.wall(b, ax - nx * 0.45, az - nz * 0.45, bx - nx * 0.45, bz - nz * 0.45, 0.9, DECK - 0.1, DECK + 1.05 * M, look.parapet)
						end
					end
				end
			end
		elseif k == 7 then
			local ring = a.rings[1]
			if ring then
				Mass.fillRing(b, ring, wl + 0.4, wl + 1.6, { mat = "WoodPlanks", col = 0x7A6048 })
			end
		end
	end
end

-- Street furniture ------------------------------------------------------------------------------
local function lamp(ctx: Context, x: number, z: number, light: boolean)
	local b = ctx.b
	local look = ctx.look
	local col = look.lampColor
	local head: Build.Prim
	if look.lamp == "newyork" then
		b:cyl(x, 4.5 * M, z, 9 * M, 0.11 * M, { roll = math.pi / 2, mat = "Metal", col = col })
		b:box(x + 0.9 * M, 8.9 * M, z, 1.8 * M, 0.12 * M, 0.12 * M, { mat = "Metal", col = col, coll = false })
		head = b:box(x + 1.8 * M, 8.75 * M, z, 0.9 * M, 0.25 * M, 0.45 * M, { mat = "SmoothPlastic", col = 0xFFF1C8, tag = "StreetLight", coll = false })
	elseif look.lamp == "paris" then
		b:cyl(x, 2.4 * M, z, 4.8 * M, 0.09 * M, { roll = math.pi / 2, mat = "Metal", col = col })
		head = b:box(x, 5.1 * M, z, 0.55 * M, 0.75 * M, 0.55 * M, { mat = "SmoothPlastic", col = 0xFFF1C8, tag = "StreetLight", coll = false, shadow = false })
	else
		b:cyl(x, 2.1 * M, z, 4.2 * M, 0.08 * M, { roll = math.pi / 2, mat = "Metal", col = col })
		head = b:box(x, 4.45 * M, z, 0.5 * M, 0.55 * M, 0.5 * M, { mat = "SmoothPlastic", col = 0xFFF1C8, tag = "StreetLight", coll = false, shadow = false })
	end
	if light then
		b:light(head, 42, 1.3, 0xFFCF8A)
	end
end

local function tree(ctx: Context, x: number, z: number, height: number)
	local b = ctx.b
	local look = ctx.look
	local rng = ctx.rng
	local h = (if height > 2 then height else look.treeHeight * rng:range(0.8, 1.2)) * M
	local r = math.min(look.crownRadius * M * rng:range(0.8, 1.15), h * 0.42)
	local trunkH = h - r * 1.3
	b:cyl(x, trunkH / 2, z, trunkH, 0.22 * M, { roll = math.pi / 2, mat = "Wood", col = 0x4E3B2C })
	b:ball(x, trunkH + r * 0.75, z, r, { mat = "LeafyGrass", col = rng:pick(look.crown), coll = false, shadow = true })
end

local function props(ctx: Context, list: { Decode.Prop })
	local b = ctx.b
	local look = ctx.look
	local rng = ctx.rng
	for _, p in list do
		local k, x, z, yaw = p.kind, p.x, p.z, p.yaw
		if k == 1 then
			tree(ctx, x, z, p.extra / 10)
		elseif k == 2 then
			lamp(ctx, x, z, p.extra == 1)
		elseif k == 3 then
			-- bench along the street
			b:obox(x, z, yaw, 0, 0.45 * M, 0, 0.5 * M, 0.9 * M, 1.8 * M, { mat = "WoodPlanks", col = 0x7A5A3A })
			b:obox(x, z, yaw, 0.25 * M, 0.95 * M, 0, 0.08 * M, 0.5 * M, 1.8 * M, { mat = "WoodPlanks", col = 0x7A5A3A })
		elseif k == 4 then
			-- parked bikes side by side
			local count = math.clamp(p.extra, 2, if ctx.style == "amsterdam" then 4 else 3)
			for i = 1, count do
				local off = (i - (count + 1) / 2) * 0.7 * M
				local bx, bz = Build.rot(yaw, 0, off)
				Kit.parkedBike(b, rng, x + bx, z + bz, yaw + math.pi / 2)
			end
		elseif k == 5 then
			b:cyl(x, 0.45 * M, z, 0.9 * M, 0.09 * M, { roll = math.pi / 2, mat = "Metal", col = look.bollard })
		elseif k == 6 then
			b:cyl(x, 0.3 * M, z, 0.6 * M, 2.4 * M, { roll = math.pi / 2, mat = "Limestone", col = 0xCFC4AE })
			b:cyl(x, 0.5 * M, z, 0.15 * M, 2.1 * M, { roll = math.pi / 2, mat = "Glass", col = 0x6FA8C8, transp = 0.3, coll = false })
			b:cyl(x, 1.2 * M, z, 1.6 * M, 0.35 * M, { roll = math.pi / 2, mat = "Limestone", col = 0xCFC4AE })
		elseif k == 7 then
			-- traffic light on the right side of the street
			local half = p.extra * DM / 2 + 0.8 * M
			local sx, sz = Build.rot(yaw, half, 0)
			local px, pz = x + sx, z + sz
			b:cyl(px, 1.8 * M, pz, 3.6 * M, 0.07 * M, { roll = math.pi / 2, mat = "Metal", col = 0x2A2A2A })
			b:obox(px, pz, yaw, 0, 3.2 * M, 0, 0.35 * M, 0.9 * M, 0.3 * M, { mat = "Metal", col = 0x1E1E1E, coll = false })
			local cols = { 0xFF3030, 0xFFB020, 0x30E060 }
			for i, c in cols do
				local lx, lz = Build.rot(yaw, 0, -0.17 * M)
				b:ball(px + lx, (3.5 - (i - 1) * 0.28) * M, pz + lz, 0.09 * M, { mat = "Neon", col = c, coll = false, shadow = false, tag = "TrafficLight" .. i })
			end
		elseif k == 8 then
			-- Paris advertising column (colonne Morris)
			b:cyl(x, 1.6 * M, z, 3.2 * M, 0.6 * M, { roll = math.pi / 2, mat = "SmoothPlastic", col = 0x2F4A33 })
			b:cyl(x, 1.5 * M, z, 2.2 * M, 0.62 * M, { roll = math.pi / 2, mat = "SmoothPlastic", col = 0xE8DCC0, coll = false })
			b:ball(x, 3.3 * M, z, 0.62 * M, { mat = "SmoothPlastic", col = 0x2F4A33 })
		elseif k == 9 then
			-- fire hydrant
			b:cyl(x, 0.35 * M, z, 0.7 * M, 0.14 * M, { roll = math.pi / 2, mat = "Metal", col = 0xB8B8B0 })
			b:ball(x, 0.72 * M, z, 0.13 * M, { mat = "Metal", col = 0xB8B8B0 })
		elseif k == 10 then
			-- bus shelter
			b:obox(x, z, yaw, -0.7 * M, 1.2 * M, 0, 0.08 * M, 2.4 * M, 3.6 * M, { mat = "Glass", col = 0x9FB7C0, transp = 0.5 })
			b:obox(x, z, yaw, 0, 2.45 * M, 0, 1.6 * M, 0.12 * M, 3.8 * M, { mat = "Metal", col = 0x3A3A3A })
			b:obox(x, z, yaw, -0.3 * M, 0.5 * M, 0, 0.4 * M, 0.08 * M, 2.4 * M, { mat = "Metal", col = 0x3A3A3A })
		end
	end
end

--- Build the whole city. `landmarks` adds the hand-made landmark models.
function Generate.city(data: CityData, landmarks: ((any) -> ())?): BuildList
	local meta = data.meta
	local b = Build.new()
	local style = meta.style :: string
	local ctx: Context = {
		b = b,
		buildings = {},
		meta = meta,
		style = style,
		look = Look.get(style),
		wl = meta.waterLevel,
		rng = Build.rng(#meta.name * 7919 + 11),
	}
	local bd = meta.bounds
	local terrain: TerrainSpec = {
		bounds = { bd[1] * DM, bd[2] * DM, bd[3] * DM, bd[4] * DM },
		waterLevel = meta.waterLevel,
		polys = {},
	}
	;(b :: any).terrain = terrain
	-- buildings
	ctx.buildings = Decode.buildings(data.buildings)
	for _, bld in ctx.buildings do
		Buildings.mass(b, bld, style, ctx.wl, ctx.rng)
	end
	streets(ctx, Decode.roads(data.roads))
	areas(ctx, Decode.areas(data.areas), terrain)
	props(ctx, Decode.props(data.props))
	if landmarks then
		landmarks(ctx)
	end
	-- points of interest
	for _, l in meta.landmarks do
		b:landmark(l.id, l.name, l.x * DM, 10, l.z * DM, l.radius * DM, l.fact)
	end
	for _, s in meta.shops do
		b:shop(s.x * DM, 0.2, s.z * DM, 0, s.label)
	end
	local c = meta.coins
	for i = 1, #c - 2, 3 do
		b:coin(c[i] * DM, c[i + 2] * DM + 3.2, c[i + 1] * DM)
	end
	local d = meta.doors
	for i = 1, #d - 1, 2 do
		b:door(d[i] * DM, 0.2, d[i + 1] * DM, 0)
	end
	b.spawn = { x = meta.spawn.x * DM, y = 6, z = meta.spawn.z * DM, yaw = meta.spawn.yaw }
	return b
end

--- Traffic lanes in city coordinates (studs). Lanes on the water get y = nil.
function Generate.lanes(data: CityData): { Decode.Lane }
	return Decode.lanes(data.lanes)
end

return Generate
