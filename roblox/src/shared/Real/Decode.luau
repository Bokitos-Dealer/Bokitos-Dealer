--!strict
-- Reads the compact city data written by tools/osm_to_luau.py (real
-- OpenStreetMap data). Numbers in the data are decimetres; everything this
-- module returns is in studs (1 metre = 3 studs), relative to the city centre,
-- with x = east and z = south.

local Decode = {}

local DM = 0.3 -- decimetres -> studs

export type Building = {
	style: number,
	top: number, -- studs
	base: number,
	wall: number, -- 0xRRGGBB
	mat: number, -- material code (see Real/Materials)
	roof: number,
	n: number, -- number of outline vertices
	xs: { number },
	zs: { number },
	flags: string, -- one digit per outline edge: 0 hidden, 1 blank, 2 street, 3 shop
	facade: number, -- 1-based index of the front edge, or 0
	mode: number, -- 0 triangles, 1 boxes, 2 boxes with the street front at +Z
	rects: { number }, -- cx, cz, w, d, yaw for each box (flattened)
	tris: { number }, -- 1-based vertex indices, 3 per triangle
	index: number,
}

export type Road = {
	kind: number, -- 1 car, 2 bike path, 3 pedestrian street, 4 path, 5 pavement on a bridge, 6 tram rails
	width: number, -- studs
	surf: number,
	flags: number, -- 1 bridge, 2 one-way, 8 has a bridge deck, 32 bike lanes, 64 centre line
	xs: { number },
	zs: { number },
}

export type Area = {
	kind: number, -- 1 water, 2 grass, 3 forest, 4 playground, 5 flowers, 6 bridge deck, 7 pier, 8 square
	rings: { { number } }, -- each ring: x1, z1, x2, z2, ...
	flags: { { number } }, -- per ring, per edge
}

export type Prop = { kind: number, x: number, z: number, yaw: number, extra: number }

export type Lane = {
	kind: string, -- "car" | "bike" | "walk" | "boat" | "tram"
	width: number,
	oneway: boolean,
	j0: number,
	j1: number,
	y: number?, -- studs above the street (nil = water level)
	xs: { number },
	zs: { number },
}

--- All lines of a list of data modules (each module returns one string).
function Decode.lines(modules: { any }): { string }
	local out = {}
	for _, m in modules do
		local text = (require :: any)(m) :: string
		for line in string.gmatch(text, "[^\n]+") do
			table.insert(out, line)
		end
	end
	return out
end

local function tokens(line: string): { string }
	return string.split(line, " ")
end

function Decode.building(line: string, index: number): Building?
	local t = tokens(line)
	local function n(i: number): number
		return tonumber(t[i]) or 0
	end
	local nOuter, nTotal = n(7), n(8)
	if nOuter < 3 then
		return nil
	end
	local b: Building = {
		style = n(1),
		top = n(2) * DM,
		base = n(3) * DM,
		wall = n(4),
		mat = n(5),
		roof = n(6),
		n = nOuter,
		xs = {},
		zs = {},
		flags = t[10] or "",
		facade = n(9) + 1,
		mode = n(11),
		rects = {},
		tris = {},
		index = index,
	}
	local i = 12
	local px, pz = 0, 0
	for k = 1, nTotal do
		local x, z = n(i), n(i + 1)
		if k > 1 then
			x += px
			z += pz
		end
		px, pz = x, z
		b.xs[k] = x * DM
		b.zs[k] = z * DM
		i += 2
	end
	if b.mode == 0 then
		while t[i] do
			table.insert(b.tris, n(i) + 1)
			i += 1
		end
	else
		local count = n(i)
		i += 1
		for _ = 1, count do
			table.insert(b.rects, n(i) * DM)
			table.insert(b.rects, n(i + 1) * DM)
			table.insert(b.rects, n(i + 2) * DM)
			table.insert(b.rects, n(i + 3) * DM)
			table.insert(b.rects, n(i + 4) / 1000)
			i += 5
		end
	end
	return b
end

function Decode.buildings(modules: { any }): { Building }
	local out = {}
	for _, line in Decode.lines(modules) do
		local b = Decode.building(line, #out + 1)
		if b then
			table.insert(out, b)
		end
	end
	return out
end

local function points(t: { string }, start: number, count: number, xs: { number }, zs: { number })
	local x0, z0 = 0, 0
	for k = 1, count do
		local x = tonumber(t[start + (k - 1) * 2]) or 0
		local z = tonumber(t[start + (k - 1) * 2 + 1]) or 0
		if k == 1 then
			x0, z0 = x, z
		else
			x += x0
			z += z0
		end
		xs[k] = x * DM
		zs[k] = z * DM
	end
end

function Decode.roads(modules: { any }): { Road }
	local out = {}
	for _, line in Decode.lines(modules) do
		local t = tokens(line)
		local r: Road = {
			kind = tonumber(t[1]) or 1,
			width = (tonumber(t[2]) or 0) * DM,
			surf = tonumber(t[3]) or 0,
			flags = tonumber(t[4]) or 0,
			xs = {},
			zs = {},
		}
		points(t, 6, tonumber(t[5]) or 0, r.xs, r.zs)
		if #r.xs >= 2 then
			table.insert(out, r)
		end
	end
	return out
end

function Decode.areas(modules: { any }): { Area }
	local out = {}
	for _, line in Decode.lines(modules) do
		local t = tokens(line)
		local kind = tonumber(t[1]) or 0
		local nr = tonumber(t[2]) or 0
		local a: Area = { kind = kind, rings = {}, flags = {} }
		local i = 3 + nr
		local x0, z0 = 0, 0
		local first = true
		for r = 1, nr do
			local len = tonumber(t[2 + r]) or 0
			local ring, fl = {}, {}
			for _ = 1, len do
				local x = tonumber(t[i]) or 0
				local z = tonumber(t[i + 1]) or 0
				if first then
					x0, z0 = x, z
					first = false
				else
					x += x0
					z += z0
				end
				table.insert(ring, x * DM)
				table.insert(ring, z * DM)
				table.insert(fl, tonumber(t[i + 2]) or 0)
				i += 3
			end
			table.insert(a.rings, ring)
			table.insert(a.flags, fl)
		end
		table.insert(out, a)
	end
	return out
end

function Decode.props(modules: { any }): { Prop }
	local out = {}
	for _, line in Decode.lines(modules) do
		local t = tokens(line)
		table.insert(out, {
			kind = tonumber(t[1]) or 0,
			x = (tonumber(t[2]) or 0) * DM,
			z = (tonumber(t[3]) or 0) * DM,
			yaw = (tonumber(t[4]) or 0) / 1000,
			extra = tonumber(t[5]) or 0,
		})
	end
	return out
end

local LANE_KINDS = { "car", "bike", "walk", "boat", "tram" }

function Decode.lanes(modules: { any }): { Lane }
	local out = {}
	for _, line in Decode.lines(modules) do
		local t = tokens(line)
		local y = tonumber(t[6]) or 0
		local l: Lane = {
			kind = LANE_KINDS[tonumber(t[1]) or 1] or "car",
			width = (tonumber(t[2]) or 0) * DM,
			oneway = bit32.band(tonumber(t[3]) or 0, 2) ~= 0,
			j0 = tonumber(t[4]) or 0,
			j1 = tonumber(t[5]) or 0,
			y = if y <= -990 then nil else y * DM,
			xs = {},
			zs = {},
		}
		points(t, 8, tonumber(t[7]) or 0, l.xs, l.zs)
		if #l.xs >= 2 then
			table.insert(out, l)
		end
	end
	return out
end

Decode.DM = DM

return Decode
