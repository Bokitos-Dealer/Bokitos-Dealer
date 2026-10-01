--!strict
-- The big shapes of real buildings (made on the server): the solid body,
-- Amsterdam gable roofs, Paris mansard roofs, New York water towers,
-- church roofs and houseboats. Windows and other small details are added
-- near the player by the client (see Real/Facades).

local Build = require(script.Parent.Parent.Build)
local Decode = require(script.Parent.Decode)
local Look = require(script.Parent.Look)
local Mass = require(script.Parent.Mass)

type BuildList = Build.BuildList
type Opts = Build.Opts
type Building = Decode.Building

local Buildings = {}

local M = Look.M

export type Frame = {
	x: number, -- middle of the front, at ground level
	z: number,
	ux: number, -- along the front (local X)
	uz: number,
	nx: number, -- outwards (local +Z)
	nz: number,
	width: number,
	depth: number,
	yaw: number,
}

--- The street front of a building, if it has one.
function Buildings.frame(bld: Building): Frame?
	if bld.mode == 2 and #bld.rects >= 5 then
		local cx, cz, w, d, yaw = bld.rects[1], bld.rects[2], bld.rects[3], bld.rects[4], bld.rects[5]
		local nx, nz = math.sin(yaw), math.cos(yaw)
		return {
			x = cx + nx * d / 2,
			z = cz + nz * d / 2,
			ux = math.cos(yaw),
			uz = -math.sin(yaw),
			nx = nx,
			nz = nz,
			width = w,
			depth = d,
			yaw = yaw,
		}
	end
	local f = bld.facade
	if f < 1 or f > bld.n then
		return nil
	end
	local g = f % bld.n + 1
	local ax, az, cx, cz = bld.xs[f], bld.zs[f], bld.xs[g], bld.zs[g]
	local dx, dz = cx - ax, cz - az
	local L = math.sqrt(dx * dx + dz * dz)
	if L < 1 then
		return nil
	end
	local ux, uz = dx / L, dz / L
	local nx, nz = -uz, ux -- outwards
	local depth = 0
	for i = 1, bld.n do
		depth = math.max(depth, -((bld.xs[i] - ax) * nx + (bld.zs[i] - az) * nz))
	end
	return {
		x = (ax + cx) / 2,
		z = (az + cz) / 2,
		ux = ux,
		uz = uz,
		nx = nx,
		nz = nz,
		width = L,
		depth = math.max(depth, 3),
		yaw = math.atan2(-uz, ux),
	}
end

local function wallOpts(bld: Building): Opts
	local mat = Look.MAT[bld.mat] or "Brick"
	local o: Opts = { mat = mat, col = bld.wall }
	if mat == "Glass" then
		o.refl = 0.22
	elseif mat == "Metal" then
		o.refl = 0.08
	end
	return o
end
Buildings.wallOpts = wallOpts

--- Fill the footprint between y0 and y1 (boxes or triangle prisms).
local function solid(b: BuildList, bld: Building, y0: number, y1: number, o: Opts)
	if bld.mode == 0 then
		local xs, zs, t = bld.xs, bld.zs, bld.tris
		for i = 1, #t - 2, 3 do
			local a, c, d = t[i], t[i + 1], t[i + 2]
			if xs[a] and xs[c] and xs[d] then
				Mass.triPrism(b, xs[a], zs[a], xs[c], zs[c], xs[d], zs[d], y0, y1, o)
			end
		end
	else
		local r = bld.rects
		for i = 1, #r - 4, 5 do
			Mass.rect(b, r[i], r[i + 1], r[i + 2], r[i + 3], r[i + 4], y0, y1, o)
		end
	end
end
Buildings.solid = solid

--- The eave height of a building (where the walls stop and the roof starts).
function Buildings.eave(bld: Building): number
	local h = bld.top - bld.base
	if bld.style == 1 then
		local f = Buildings.frame(bld)
		if f then
			return bld.top - Buildings.gableHeight(bld, f)
		end
	elseif bld.style == 2 then
		return bld.top - math.min(3.4 * M, h * 0.3)
	end
	return bld.top
end

function Buildings.gableHeight(bld: Building, f: Frame): number
	local h = bld.top - bld.base
	return math.clamp(f.width * 0.85, 2.6 * M, 7 * M) * math.min(1, h / (11 * M))
end

local function waterTower(b: BuildList, x: number, z: number, y: number)
	local wood = { mat = "WoodPlanks", col = 0x6B4A32, coll = false }
	local steel = { mat = "Metal", col = 0x3A3A3A, coll = false }
	-- legs (two crossed plates) and the barrel with its pointy hat
	b:box(x, y + 2 * M, z, 0.25 * M, 4 * M, 3.4 * M, steel)
	b:box(x, y + 2 * M, z, 3.4 * M, 4 * M, 0.25 * M, steel)
	b:cyl(x, y + 4 * M + 2.6 * M, z, 5.2 * M, 2.2 * M, { roll = math.pi / 2, mat = wood.mat, col = wood.col, coll = false })
	b:cyl(x, y + 4 * M + 5.4 * M, z, 0.6 * M, 1.6 * M, { roll = math.pi / 2, mat = steel.mat, col = 0x2E2E2E, coll = false })
end

--- Add the big shapes of one building. `wl` is the water level (studs).
function Buildings.mass(b: BuildList, bld: Building, style: string, wl: number, rng: Build.Rng)
	local o = wallOpts(bld)
	local base = if bld.base < 0.5 then -0.8 else bld.base
	local top = bld.top
	local s = bld.style
	if s == 6 then
		-- houseboat: a dark hull in the water with a cabin on top
		solid(b, bld, wl - 1.6, wl + 2.4, { mat = "WoodPlanks", col = 0x2B2B2B })
		solid(b, bld, wl + 2.4, wl + 8.4, { mat = "WoodPlanks", col = bld.wall })
		return
	elseif s == 9 then
		-- a canopy roof on posts
		solid(b, bld, math.max(top - 1.2, 0), top, { mat = "Metal", col = 0x6E7378 })
		return
	elseif s == 1 then
		local f = Buildings.frame(bld)
		if f then
			local gh = Buildings.gableHeight(bld, f)
			local eave = top - gh
			solid(b, bld, base, eave, o)
			-- the gable roof runs from the front to the back; the client adds
			-- roof tiles and the decorated gable top close by
			b:prism(f.x, f.z, f.yaw, 0, eave, -f.depth / 2, f.width, gh, f.depth, { mat = o.mat, col = bld.wall })
			return
		end
	elseif s == 2 then
		local eave = Buildings.eave(bld)
		local zinc: Opts = { mat = "Slate", col = bld.roof }
		if bld.mode == 2 then
			-- walls, then the zinc mansard: a sloped front and a set-back top
			local r = bld.rects
			local set = 1.6 * M
			for i = 1, #r - 4, 5 do
				local cx, cz, w, d, yaw = r[i], r[i + 1], r[i + 2], r[i + 3], r[i + 4]
				Mass.rect(b, cx, cz, w, d, yaw, base, eave, o)
				local nx, nz = math.sin(yaw), math.cos(yaw)
				if d > set + 2 then
					Mass.rect(b, cx - nx * set / 2, cz - nz * set / 2, w, d - set, yaw, eave, top, zinc)
					local fx, fz = cx + nx * (d / 2 - set / 2), cz + nz * (d / 2 - set / 2)
					-- WedgeParts slope down towards local -Z: turn it to face the street
					b:wedge(fx, (eave + top) / 2, fz, w, top - eave, set, { yaw = yaw + math.pi, mat = zinc.mat, col = zinc.col })
				else
					Mass.rect(b, cx, cz, w, d, yaw, eave, top, zinc)
				end
			end
		elseif bld.mode == 1 then
			solid(b, bld, base, eave, o)
			solid(b, bld, eave, top, zinc)
		else
			solid(b, bld, base, top, o)
		end
		return
	elseif s == 7 then
		-- church: walls and a steep roof along the longest side
		local r = bld.rects
		if bld.mode ~= 0 and #r >= 5 then
			local k, best = 1, 0
			for i = 1, #r - 4, 5 do
				if r[i + 2] * r[i + 3] > best then
					best, k = r[i + 2] * r[i + 3], i
				end
			end
			local cx, cz, w, d, yaw = r[k], r[k + 1], r[k + 2], r[k + 3], r[k + 4]
			local wallTop = base + (top - base) * 0.6
			solid(b, bld, base, wallTop, o)
			local roofH = top - wallTop
			if w >= d then
				-- ridge along local X: turn the prism 90 degrees
				b:prism(cx, cz, yaw + math.pi / 2, 0, wallTop, 0, d, roofH, w, { mat = "Slate", col = bld.roof })
			else
				b:prism(cx, cz, yaw, 0, wallTop, 0, w, roofH, d, { mat = "Slate", col = bld.roof })
			end
			return
		end
	end
	solid(b, bld, base, top, o)
	if s == 3 and bld.mode ~= 0 and #bld.rects >= 5 then
		local h = (top - base) / M
		if h > 15 and h < 70 and rng:chance(0.22) then
			local r = bld.rects
			local w, d = r[3], r[4]
			if w > 9 * M and d > 9 * M then
				waterTower(b, r[1], r[2], top)
			end
		end
	end
end

return Buildings
