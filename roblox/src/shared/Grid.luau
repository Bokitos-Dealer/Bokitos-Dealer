--!strict
-- Helpers for grid-shaped cities (Paris boulevards, Manhattan avenues).

local Build = require(script.Parent.Build)
local Roads = require(script.Parent.Roads)
local Kit = require(script.Parent.Kit)

type BuildList = Build.BuildList
type Rng = Build.Rng

local Grid = {}
local M = Kit.M
local S = Roads.SURF
local TOP = Roads.TOP

export type StreetOpts = { bike: boolean?, layer: number?, car: boolean?, surface: Roads.Surface?, lanes: boolean? }
export type Placer = (b: BuildList, rng: Rng, ox: number, oz: number, yaw: number, w: number, d: number) -> ()

--- A straight street from A to B with an asphalt road, optional red bike
--- lanes and traffic lanes in both directions. `layer` lifts crossing
--- streets a hair so overlapping roads never z-fight.
function Grid.street(b: BuildList, ax: number, az: number, bx: number, bz: number, width: number, opts: StreetOpts?)
	local o: StreetOpts = opts or {}
	local lift = (o.layer or 0) * 0.05
	local dx, dz = bx - ax, bz - az
	local len = math.sqrt(dx * dx + dz * dz)
	if len < 1 then
		return
	end
	local ux, uz = dx / len, dz / len
	local nx, nz = uz, -ux
	Roads.seg(b, ax, az, bx, bz, width, TOP.road + lift, o.surface or S.asphalt)
	if o.bike then
		for _, sgn in { -1, 1 } do
			local off = sgn * (width / 2 - 1.5 * M)
			Roads.seg(b, ax + nx * off, az + nz * off, bx + nx * off, bz + nz * off, 2 * M, TOP.bike + lift, S.bike)
		end
	end
	if o.lanes ~= false then
		for _, sgn in { -1, 1 } do
			local off = sgn * (if o.bike then width / 2 - 1.5 * M else 2.2 * M)
			local pts = {}
			local n = math.max(1, math.ceil(len / 30))
			for i = 0, n do
				local t = i / n
				table.insert(pts, { ax + dx * t + nx * off, TOP.road + 0.3, az + dz * t + nz * off })
			end
			if sgn < 0 then
				local rev = {}
				for i = #pts, 1, -1 do
					table.insert(rev, pts[i])
				end
				pts = rev
			end
			b:lane("bike", pts)
			if o.car then
				local cpts = {}
				for _, p in pts do
					local co = -sgn * 1.5 * M
					table.insert(cpts, { p[1] + nx * co, p[2], p[3] + nz * co })
				end
				b:lane("car", cpts)
			end
		end
	end
end

--- Pavement slab under a block (with a curb), plus walking lanes around it.
function Grid.pavement(b: BuildList, x0: number, z0: number, x1: number, z1: number, rim: number)
	b:box((x0 + x1) / 2, TOP.side - 0.3, (z0 + z1) / 2, x1 - x0 + 2 * rim, 0.6, z1 - z0 + 2 * rim, { mat = S.side.mat, col = S.side.col })
	local r = rim * 0.5
	local pts = {
		{ x0 - r, TOP.side + 0.3, z0 - r },
		{ x1 + r, TOP.side + 0.3, z0 - r },
		{ x1 + r, TOP.side + 0.3, z1 + r },
		{ x0 - r, TOP.side + 0.3, z1 + r },
		{ x0 - r, TOP.side + 0.3, z0 - r },
	}
	b:lane("walk", pts, true)
end

--- Buildings around a rectangular block, all facing outwards.
--- Returns nothing; adds delivery doors on some of them.
function Grid.perimeter(b: BuildList, rng: Rng, x0: number, z0: number, x1: number, z1: number, depth: number, wMin: number, wMax: number, place: Placer, doorEvery: number?)
	local W, D = x1 - x0, z1 - z0
	local d = math.min(depth, D / 2 - 0.5, W / 2 - 0.5)
	local every = doorEvery or 3
	local count = 0
	local function side(ax: number, az: number, ux: number, uz: number, len: number, yaw: number)
		local acc = 0
		while acc < len - 2 do
			local w = rng:range(wMin, wMax)
			if len - acc - w < wMin * 0.6 then
				w = len - acc
			end
			local ox, oz = ax + ux * (acc + w / 2), az + uz * (acc + w / 2)
			place(b, rng, ox, oz, yaw, w - 0.15, d)
			count += 1
			if count % every == 0 then
				local fx, fz = Build.rot(yaw, 0, -2.2 * M)
				b:door(ox + fx, TOP.side, oz + fz, yaw)
			end
			acc += w
		end
	end
	-- north (faces -z) and south (faces +z) sides span the full width
	side(x0, z0, 1, 0, W, 0)
	side(x1, z1, -1, 0, W, math.pi)
	-- west (faces -x) and east (faces +x) sides fit between them
	if D - 2 * d > wMin * 0.8 then
		side(x0, z1 - d, 0, -1, D - 2 * d, math.pi / 2)
		side(x1, z0 + d, 0, 1, D - 2 * d, -math.pi / 2)
	end
	-- roof/courtyard fill so you never see through the block
	if W - 2 * d > 2 and D - 2 * d > 2 then
		b:box((x0 + x1) / 2, 0.1, (z0 + z1) / 2, W - 2 * d, 0.2, D - 2 * d, { mat = "Ground", col = 0x4a4038, shadow = false })
	end
end

--- Trees along a straight line, every `spacing` studs.
function Grid.treeLine(b: BuildList, rng: Rng, ax: number, az: number, bx: number, bz: number, spacing: number, palette: { number }?)
	local dx, dz = bx - ax, bz - az
	local len = math.sqrt(dx * dx + dz * dz)
	local n = math.floor(len / spacing)
	for i = 0, n do
		local t = (i + 0.5) / (n + 1)
		Kit.tree(b, rng, ax + dx * t, az + dz * t, 1, palette)
	end
end

--- Coins along a straight line.
function Grid.coins(b: BuildList, rng: Rng, ax: number, az: number, bx: number, bz: number, spacing: number, chance: number)
	local dx, dz = bx - ax, bz - az
	local len = math.sqrt(dx * dx + dz * dz)
	local n = math.floor(len / spacing)
	for i = 1, n do
		if rng:chance(chance) then
			local t = i / (n + 1)
			b:coin(ax + dx * t, TOP.road + 3, az + dz * t)
		end
	end
end

--- Invisible fence around a rectangle so nobody rides off the map.
function Grid.fence(b: BuildList, x0: number, z0: number, x1: number, z1: number)
	local function wall(ax: number, az: number, bx: number, bz: number)
		Roads.wall(b, ax, az, bx, bz, 2, -4, 60, { mat = "SmoothPlastic", col = 0xffffff }, { transp = 1, shadow = false })
	end
	wall(x0, z0, x1, z0)
	wall(x0, z1, x1, z1)
	wall(x0, z0, x0, z1)
	wall(x1, z0, x1, z1)
end

return Grid
