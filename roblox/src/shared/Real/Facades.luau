--!strict
-- Small facade details (windows, doors, shop fronts, Dutch gable tops, Paris
-- balconies and dormers, New York fire escapes) and road markings. The client
-- makes these only for the streets around the player, so the city can be
-- detailed without millions of parts.

local Build = require(script.Parent.Parent.Build)
local Buildings = require(script.Parent.Buildings)
local Decode = require(script.Parent.Decode)
local Look = require(script.Parent.Look)

type BuildList = Build.BuildList
type Opts = Build.Opts
type Building = Decode.Building

local Facades = {}

local M = Look.M
local MAX_FLOORS = 14 -- windows above this are left to the plain wall

local function boxAt(b: BuildList, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number, o: Opts)
	if sx < 0.05 or sy < 0.05 or sz < 0.02 then
		return -- too small to see (or a building part too short for this detail)
	end
	local op: Opts = table.clone(o) :: Opts
	op.yaw = yaw
	op.coll = false
	op.shadow = false
	b:box(x, y, z, sx, sy, sz, op)
end

--- Walk along one street front: calls fn(s) for `count` evenly spaced bays.
local function bays(L: number, bay: number, fn: (number, number) -> ())
	local count = math.floor(L / bay)
	if count < 1 then
		return
	end
	local spacing = L / count
	for j = 1, count do
		fn((j - 0.5) * spacing, j)
	end
end

type Edge = {
	ax: number,
	az: number,
	ux: number,
	uz: number,
	nx: number,
	nz: number,
	L: number,
	yaw: number,
	shop: boolean,
}

local function edges(bld: Building): { Edge }
	local out = {}
	local n = bld.n
	for i = 1, n do
		local c = string.byte(bld.flags, i)
		if not c or c < 50 then -- "2" (street) or "3" (shop) only
			continue
		end
		local j = i % n + 1
		local ax, az = bld.xs[i], bld.zs[i]
		local dx, dz = bld.xs[j] - ax, bld.zs[j] - az
		local L = math.sqrt(dx * dx + dz * dz)
		if L < 2.2 * M then
			continue
		end
		local ux, uz = dx / L, dz / L
		table.insert(out, { ax = ax, az = az, ux = ux, uz = uz, nx = -uz, nz = ux, L = L, yaw = math.atan2(-uz, ux), shop = c == 51 })
	end
	return out
end

--- A framed window: light frame with dark glass in front of it.
local function window(b: BuildList, e: Edge, s: number, y: number, w: number, h: number, look: Look.CityLook, framed: boolean, rng: Build.Rng)
	local x, z = e.ax + e.ux * s, e.az + e.uz * s
	if framed then
		boxAt(b, x + e.nx * 0.06, y, z + e.nz * 0.06, w + 0.5, h + 0.5, 0.12, e.yaw, { mat = "SmoothPlastic", col = look.frame })
	end
	-- about half the windows light up at night
	boxAt(b, x + e.nx * 0.12, y, z + e.nz * 0.12, w, h, 0.14, e.yaw, { mat = "Glass", col = look.glass, refl = 0.25, tag = if rng:chance(0.45) then "NightWindow" else nil })
end

local function door(b: BuildList, e: Edge, s: number, y0: number, look: Look.CityLook, rng: Build.Rng, stoop: boolean)
	local x, z = e.ax + e.ux * s, e.az + e.uz * s
	local w, h = 1.1 * M, 2.4 * M
	boxAt(b, x + e.nx * 0.06, y0 + h / 2 + 0.1, z + e.nz * 0.06, w + 0.5, h + 0.4, 0.12, e.yaw, { mat = "SmoothPlastic", col = look.frame })
	boxAt(b, x + e.nx * 0.12, y0 + h / 2, z + e.nz * 0.12, w, h, 0.14, e.yaw, { mat = "WoodPlanks", col = rng:pick(look.doorColors) })
	if stoop then
		boxAt(b, x + e.nx * 0.6 * M, y0 + 0.25 * M, z + e.nz * 0.6 * M, w + 1.2, 0.5 * M, 1.2 * M, e.yaw, { mat = "Granite", col = 0x8E8A84 })
	end
end

local function shopFront(b: BuildList, e: Edge, y0: number, gf: number, look: Look.CityLook, rng: Build.Rng)
	local w = math.min(e.L * 0.82, e.L - 1.2 * M)
	if w < 2 * M then
		return
	end
	local s = e.L / 2
	local x, z = e.ax + e.ux * s, e.az + e.uz * s
	local h = gf * 0.62
	boxAt(b, x + e.nx * 0.12, y0 + 0.5 * M + h / 2, z + e.nz * 0.12, w, h, 0.14, e.yaw, { mat = "Glass", col = 0x3A4A55, refl = 0.3, tag = "NightWindow" })
	boxAt(b, x + e.nx * 0.08, y0 + 0.5 * M + h + 0.6 * M, z + e.nz * 0.08, w + 0.6, 1.0 * M, 0.2, e.yaw, { mat = "SmoothPlastic", col = rng:pick(look.awnings) })
	-- sloping awning
	local depth = 1.4 * M
	local op: Opts = { yaw = e.yaw, pitch = -0.35, mat = "Fabric", col = rng:pick(look.awnings), coll = false, shadow = true }
	b:box(x + e.nx * depth / 2, y0 + 0.5 * M + h + 0.15 * M, z + e.nz * depth / 2, w, 0.12, depth * 1.06, op)
end

-- Amsterdam gable tops ------------------------------------------------------------------------
local function gable(b: BuildList, bld: Building, f: Buildings.Frame, rng: Build.Rng, look: Look.CityLook)
	local gh = Buildings.gableHeight(bld, f)
	local eave = bld.top - gh
	local W = f.width
	local wall: Opts = { mat = Look.MAT[bld.mat] or "Brick", col = bld.wall, coll = false }
	local trim: Opts = { mat = "SmoothPlastic", col = 0xF2F0EA, coll = false, shadow = false }
	local roof: Opts = { mat = "Slate", col = bld.roof, coll = false }
	local function at(lx: number, lz: number): (number, number)
		return f.x + f.ux * lx + f.nx * lz, f.z + f.uz * lx + f.nz * lz
	end
	-- roof tiles on both slopes of the gable roof
	local slopeLen = math.sqrt((W / 2) ^ 2 + gh ^ 2)
	local ang = math.atan2(gh, W / 2)
	for _, side in { -1, 1 } do
		local x, z = at(side * W / 4, -f.depth / 2)
		local op = table.clone(roof) :: Opts
		op.yaw = f.yaw
		op.roll = -side * ang
		b:box(x, eave + gh / 2 + 0.15, z, slopeLen + 0.4, 0.25, f.depth + 0.3, op)
	end
	local kind = rng:int(1, 5)
	local front = 0.25
	if kind == 1 then
		-- step gable
		local steps = if W > 7 * M then 4 else 3
		for k = 0, steps - 1 do
			local w = W * (1 - k / steps)
			local h = gh / steps
			local x, z = at(0, front)
			local op = table.clone(wall) :: Opts
			op.yaw = f.yaw
			b:box(x, eave + (k + 0.5) * h, z, w, h, 0.5, op)
			for _, side in { -1, 1 } do
				local cx, cz = at(side * (w / 2 - 0.3), front + 0.05)
				local t = table.clone(trim) :: Opts
				t.yaw = f.yaw
				b:box(cx, eave + (k + 1) * h + 0.1, cz, 0.9, 0.2, 0.62, t)
			end
		end
	elseif kind == 2 or kind == 3 then
		-- neck or bell gable: a tall middle part with white edges
		local nw = W * (if kind == 2 then 0.42 else 0.55)
		local x, z = at(0, front)
		local op = table.clone(wall) :: Opts
		op.yaw = f.yaw
		b:box(x, eave + gh * 0.55, z, nw, gh * 1.1, 0.5, op)
		local t = table.clone(trim) :: Opts
		t.yaw = f.yaw
		b:box(x, eave + gh * 1.1 + 0.15, z, nw + 0.6, 0.35, 0.65, t)
		if kind == 3 then
			b:ball(x, eave + gh * 1.1 + 0.7, z, 0.45, { mat = "SmoothPlastic", col = 0xF2F0EA, coll = false })
		end
		for _, side in { -1, 1 } do
			local sx, sz = at(side * (nw / 2 + (W - nw) / 4), front)
			local wop = table.clone(wall) :: Opts
			wop.yaw = f.yaw + (if side < 0 then math.pi / 2 else -math.pi / 2)
			b:wedge(sx, eave + gh * 0.22, sz, 0.5, gh * 0.44, (W - nw) / 2, wop)
		end
	elseif kind == 4 then
		-- straight cornice front hiding the roof
		local x, z = at(0, front)
		local op = table.clone(wall) :: Opts
		op.yaw = f.yaw
		b:box(x, eave + gh * 0.4, z, W, gh * 0.8, 0.5, op)
		local t = table.clone(trim) :: Opts
		t.yaw = f.yaw
		b:box(x, eave + gh * 0.8 + 0.25, z, W + 0.6, 0.5, 0.9, t)
	else
		-- spout gable: white edges along the slopes
		for _, side in { -1, 1 } do
			local x, z = at(side * W / 4, front)
			local t = table.clone(trim) :: Opts
			t.yaw = f.yaw
			t.roll = -side * ang
			b:box(x, eave + gh / 2, z, slopeLen, 0.35, 0.6, t)
		end
	end
	-- attic window / loading door and the hoist beam
	local x, z = at(0, 0.1)
	boxAt(b, x, eave + gh * 0.35, z, math.min(1.1 * M, W * 0.3), gh * 0.38, 0.3, f.yaw, { mat = "SmoothPlastic", col = look.frame })
	boxAt(b, x + f.nx * 0.1, eave + gh * 0.35, z + f.nz * 0.1, math.min(0.9 * M, W * 0.24), gh * 0.32, 0.32, f.yaw, { mat = "WoodPlanks", col = rng:pick(look.doorColors) })
	if rng:chance(0.7) then
		local hx, hz = at(0, 0.6 * M)
		boxAt(b, hx, eave + gh * 0.82, hz, 0.35 * M, 0.35 * M, 1.4 * M, f.yaw, { mat = "WoodPlanks", col = 0x2A2420 })
	end
end

--- Add the details of one building. `y0` is where its street front starts.
function Facades.building(b: BuildList, bld: Building, style: string, rng: Build.Rng)
	local s = bld.style
	if s == 6 or s == 9 then
		return
	end
	local look = Look.get(style)
	local list = edges(bld)
	if #list == 0 then
		return
	end
	local base = bld.base
	local eave = Buildings.eave(bld)
	local gf = look.groundFloor * M
	local fh = look.floor * M
	local ww, wh = look.window[1] * M, look.window[2] * M
	local floors = math.min(MAX_FLOORS, math.floor((eave - base - gf - 0.5 * M) / fh))
	local tall = (bld.top - base) > 45 * M
	local glass = s == 4 or bld.mat == 4
	local framed = style ~= "newyork" and not glass
	for _, e in list do
		if glass then
			-- curtain wall: slim mullions and floor bands near the street
			local bandTop = math.min(eave, base + gf + MAX_FLOORS * fh)
			bays(e.L, 1.6 * M, function(sx)
				local x, z = e.ax + e.ux * sx, e.az + e.uz * sx
				boxAt(b, x + e.nx * 0.1, (base + bandTop) / 2, z + e.nz * 0.1, 0.12 * M, bandTop - base, 0.2, e.yaw, { mat = "Metal", col = 0x9AA3AA })
			end)
			for k = 0, math.floor((bandTop - base) / fh) - 1, 2 do
				local x, z = e.ax + e.ux * e.L / 2, e.az + e.uz * e.L / 2
				boxAt(b, x + e.nx * 0.1, base + gf + k * fh, z + e.nz * 0.1, e.L, 0.35 * M, 0.2, e.yaw, { mat = "Metal", col = 0x8A939A })
			end
			continue
		end
		if s == 5 or (tall and style == "newyork") then
			-- tower: dark window columns up the front
			local colTop = math.min(eave - 1.5 * M, base + gf + MAX_FLOORS * fh)
			bays(e.L, look.bay * M, function(sx)
				local x, z = e.ax + e.ux * sx, e.az + e.uz * sx
				boxAt(b, x + e.nx * 0.12, (base + gf + colTop) / 2, z + e.nz * 0.12, ww, colTop - base - gf, 0.14, e.yaw, { mat = "Glass", col = look.glass, refl = 0.2, tag = "NightWindow" })
			end)
		else
			-- upper floors
			for k = 1, floors do
				local y = base + gf + (k - 0.5) * fh
				local h = if style == "paris" and (k == 1 or k == 4) then wh * 1.08 else wh
				bays(e.L, look.bay * M, function(sx)
					window(b, e, sx, y, ww, math.min(h, fh * 0.78), look, framed, rng)
				end)
			end
		end
		-- ground floor
		if base < 0.5 * M then
			if e.shop then
				shopFront(b, e, base, gf, look, rng)
			else
				local count = math.floor(e.L / (look.bay * M))
				if count >= 2 then
					local doorBay = rng:int(1, count)
					local spacing = e.L / count
					for j = 1, count do
						local sx = (j - 0.5) * spacing
						if j == doorBay then
							door(b, e, sx, base, look, rng, style == "amsterdam" or (style == "newyork" and s == 3 and rng:chance(0.4)))
						else
							window(b, e, sx, base + gf * 0.55, ww, math.min(wh, gf * 0.55), look, framed, rng)
						end
					end
				elseif count == 1 then
					door(b, e, e.L / 2, base, look, rng, style == "amsterdam")
				end
			end
		end
		-- city specials
		if style == "paris" and s == 2 then
			local x, z = e.ax + e.ux * e.L / 2, e.az + e.uz * e.L / 2
			-- stone band above the shops, balconies on the 2nd and 5th floor, cornice
			boxAt(b, x + e.nx * 0.15, base + gf + 0.15 * M, z + e.nz * 0.15, e.L, 0.3 * M, 0.3, e.yaw, { mat = "Limestone", col = 0xE8DFCB })
			for _, k in { 1, 4 } do
				if k <= floors then
					local y = base + gf + (k - 1) * fh + 0.1
					boxAt(b, x + e.nx * 0.45 * M, y, z + e.nz * 0.45 * M, e.L - 0.4, 0.15 * M, 0.9 * M, e.yaw, { mat = "Limestone", col = 0xE0D4BA })
					boxAt(b, x + e.nx * 0.88 * M, y + 0.5 * M, z + e.nz * 0.88 * M, e.L - 0.4, 0.9 * M, 0.08, e.yaw, { mat = "Metal", col = 0x1E2420, transp = 0.25 })
				end
			end
			boxAt(b, x + e.nx * 0.4, eave + 0.2 * M, z + e.nz * 0.4, e.L + 0.4, 0.45 * M, 0.9, e.yaw, { mat = "Limestone", col = 0xE8DFCB })
			-- dormer windows in the zinc roof
			if bld.mode == 2 then
				bays(e.L, look.bay * M * 2, function(sx)
					local dx, dz = e.ax + e.ux * sx - e.nx * 0.9 * M, e.az + e.uz * sx - e.nz * 0.9 * M
					boxAt(b, dx, eave + 1.5 * M, dz, 1.4 * M, 2 * M, 1.6 * M, e.yaw, { mat = "Slate", col = bld.roof })
					boxAt(b, dx + e.nx * 0.82 * M, eave + 1.45 * M, dz + e.nz * 0.82 * M, 0.9 * M, 1.3 * M, 0.1, e.yaw, { mat = "Glass", col = look.glass, tag = "NightWindow" })
				end)
			else
				boxAt(b, x + e.nx * 0.1, (eave + bld.top) / 2, z + e.nz * 0.1, e.L, bld.top - eave, 0.2, e.yaw, { mat = "Slate", col = bld.roof })
			end
		elseif style == "newyork" and s == 3 and floors >= 3 and e.L > 6 * M and rng:chance(0.4) then
			-- fire escape: a platform and a ladder on every floor
			local fw = math.min(e.L * 0.5, 7 * M)
			local cx, cz = e.ax + e.ux * e.L * 0.5 + e.nx * 0.6 * M, e.az + e.uz * e.L * 0.5 + e.nz * 0.6 * M
			for k = 1, math.min(floors, 8) do
				local y = base + gf + (k - 1) * fh
				boxAt(b, cx, y, cz, fw, 0.12 * M, 1.1 * M, e.yaw, { mat = "Metal", col = 0x2B2B2B })
				boxAt(b, cx + e.nx * 0.5 * M, y + 0.5 * M, cz + e.nz * 0.5 * M, fw, 0.06 * M, 0.06 * M, e.yaw, { mat = "Metal", col = 0x2B2B2B })
				if k < floors then
					local op: Opts = { yaw = e.yaw, roll = math.atan2(fh, fw * 0.8), mat = "Metal", col = 0x2B2B2B, coll = false, shadow = false }
					b:box(cx, y + fh / 2, cz, math.sqrt((fw * 0.8) ^ 2 + fh ^ 2), 0.08 * M, 0.5 * M, op)
				end
			end
		elseif style == "amsterdam" and base < 0.5 * M and not e.shop and rng:chance(0.3) then
			-- flower boxes or a bench in front of the house
			local x, z = e.ax + e.ux * e.L * 0.3 + e.nx * 0.5 * M, e.az + e.uz * e.L * 0.3 + e.nz * 0.5 * M
			boxAt(b, x, 0.35 * M, z, 1.6 * M, 0.5 * M, 0.5 * M, e.yaw, { mat = "WoodPlanks", col = 0x5A4636 })
			b:ball(x, 0.75 * M, z, 0.45 * M, { mat = "LeafyGrass", col = rng:pick({ 0xD94A4A, 0xF2C230, 0xE87AB0, 0x5E8A3F }), coll = false, shadow = false })
		end
	end
	if s == 1 then
		local f = Buildings.frame(bld)
		if f then
			gable(b, bld, f, rng, look)
		end
	end
end

-- Road markings ---------------------------------------------------------------------------------
local LINE_TOP = 0.2

local function strip(b: BuildList, ax: number, az: number, bx: number, bz: number, w: number, y: number, col: number, mat: string?)
	local dx, dz = bx - ax, bz - az
	local len = math.sqrt(dx * dx + dz * dz)
	if len < 0.2 then
		return
	end
	b:box((ax + bx) / 2, y, (az + bz) / 2, w, 0.05, len, { yaw = math.atan2(dx, dz), mat = mat or "SmoothPlastic", col = col, coll = false, shadow = false })
end

function Facades.road(b: BuildList, r: Decode.Road, style: string)
	local bridge = bit32.band(r.flags, 1) ~= 0
	local y = LINE_TOP + (if bridge then 0.65 else 0)
	local xs, zs = r.xs, r.zs
	if r.kind == 6 then
		-- tram rails
		for i = 1, #xs - 1 do
			local dx, dz = xs[i + 1] - xs[i], zs[i + 1] - zs[i]
			local len = math.sqrt(dx * dx + dz * dz)
			if len > 0.2 then
				local nx, nz = -dz / len, dx / len
				for _, side in { -0.72 * M, 0.72 * M } do
					strip(b, xs[i] + nx * side, zs[i] + nz * side, xs[i + 1] + nx * side, zs[i + 1] + nz * side, 0.1 * M, y + 0.01, 0x6E6A66, "Metal")
				end
			end
		end
		return
	end
	if r.kind ~= 1 then
		return
	end
	local centre = bit32.band(r.flags, 64) ~= 0
	local bikeLanes = bit32.band(r.flags, 32) ~= 0
	for i = 1, #xs - 1 do
		local ax, az, bx, bz = xs[i], zs[i], xs[i + 1], zs[i + 1]
		local dx, dz = bx - ax, bz - az
		local len = math.sqrt(dx * dx + dz * dz)
		if len < 0.5 then
			continue
		end
		local ux, uz, nx, nz = dx / len, dz / len, -dz / len, dx / len
		if centre and bit32.band(r.flags, 2) == 0 then
			if style == "newyork" then
				for _, off in { -0.12 * M, 0.12 * M } do
					strip(b, ax + nx * off, az + nz * off, bx + nx * off, bz + nz * off, 0.1 * M, y, 0xE8B92E)
				end
			else
				-- dashes: 3 m line, 6 m gap
				local s = 1.5 * M
				while s < len - 1.5 * M do
					strip(b, ax + ux * (s - 1.5 * M), az + uz * (s - 1.5 * M), ax + ux * (s + 1.5 * M), az + uz * (s + 1.5 * M), 0.12 * M, y, 0xEDEDE8)
					s += 9 * M
				end
			end
		end
		if bikeLanes and r.width > 7 * M then
			local col = if style == "amsterdam" then 0x9A3D33 elseif style == "newyork" then 0x3E8A4E else 0x4A4B50
			for _, side in { -1, 1 } do
				local off = side * (r.width / 2 - 0.9 * M)
				strip(b, ax + nx * off, az + nz * off, bx + nx * off, bz + nz * off, 1.6 * M, y - 0.01, col, "Asphalt")
				local lo = side * (r.width / 2 - 1.75 * M)
				strip(b, ax + nx * lo, az + nz * lo, bx + nx * lo, bz + nz * lo, 0.12 * M, y + 0.01, 0xEDEDE8)
			end
		end
	end
end

--- Zebra crossing across a street (from the props list).
function Facades.crossing(b: BuildList, p: Decode.Prop, style: string)
	local width = math.max(p.extra * Decode.DM, 6 * M)
	local stripes = math.floor(width / (1.0 * M))
	local long = if style == "newyork" then 3.5 * M else 3 * M
	for k = 0, stripes - 1 do
		local lx = -width / 2 + (k + 0.5) * (width / stripes)
		b:obox(p.x, p.z, p.yaw, lx, LINE_TOP, 0, 0.5 * M, 0.05, long, { mat = "SmoothPlastic", col = 0xEDEDE8, coll = false, shadow = false })
	end
end

return Facades
