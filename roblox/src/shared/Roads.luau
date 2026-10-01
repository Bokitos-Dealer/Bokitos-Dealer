--!strict
-- Streets, curved streets, quay walls, canal water and bridges (pure data).
-- Polar helpers use the convention x = r*sin(theta), z = r*cos(theta).

local Build = require(script.Parent.Build)

type BuildList = Build.BuildList
type Opts = Build.Opts

local Roads = {}

local THICK = 0.6

export type Surface = { mat: string, col: number }

Roads.SURF = {
	klinker = { mat = "Brick", col = 0x7a4436 },
	strip = { mat = "Cobblestone", col = 0x6e5a50 },
	asphalt = { mat = "Asphalt", col = 0x3d3e42 },
	bike = { mat = "Asphalt", col = 0x9a3b33 },
	side = { mat = "Pavement", col = 0x9d9891 },
	granite = { mat = "Granite", col = 0xa7a39b },
	plaza = { mat = "Pavement", col = 0xb4ac9d },
	grass = { mat = "Grass", col = 0x4d7a35 },
	gravel = { mat = "Sand", col = 0xc9b48a },
	stone = { mat = "Limestone", col = 0xd8ccb0 },
	brick = { mat = "Brick", col = 0x6b3426 },
	ground = { mat = "Ground", col = 0x5a4a3f },
}

--- Heights of the different surfaces (top face), in studs.
Roads.TOP = { road = 0.2, bike = 0.25, strip = 0.22, side = 0.65, edge = 0.6, plaza = 0.3, base = 0 }

--- Flat strip between two points, top at `top`.
function Roads.seg(b: BuildList, ax: number, az: number, bx: number, bz: number, width: number, top: number, s: Surface, o: Opts?): Build.Prim?
	local dx, dz = bx - ax, bz - az
	local len = math.sqrt(dx * dx + dz * dz)
	if len < 0.05 then
		return nil
	end
	if len > 1900 then
		-- parts can be at most 2048 studs long: split in two
		local mx, mz = (ax + bx) / 2, (az + bz) / 2
		Roads.seg(b, ax, az, mx, mz, width, top, s, o)
		return Roads.seg(b, mx, mz, bx, bz, width, top, s, o)
	end
	local op: Opts = table.clone(o or {}) :: Opts
	op.yaw = math.atan2(dx, dz)
	op.mat = s.mat
	op.col = s.col
	return b:box((ax + bx) / 2, top - THICK / 2, (az + bz) / 2, width, THICK, len, op)
end

--- Vertical wall from A to B between heights y0..y1 (split if very long).
function Roads.wall(b: BuildList, ax: number, az: number, bx: number, bz: number, thick: number, y0: number, y1: number, s: Surface, o: Opts?)
	local dx, dz = bx - ax, bz - az
	local len = math.sqrt(dx * dx + dz * dz)
	if len < 0.05 then
		return
	end
	if len > 1900 then
		local mx, mz = (ax + bx) / 2, (az + bz) / 2
		Roads.wall(b, ax, az, mx, mz, thick, y0, y1, s, o)
		Roads.wall(b, mx, mz, bx, bz, thick, y0, y1, s, o)
		return
	end
	local op: Opts = table.clone(o or {}) :: Opts
	op.yaw = math.atan2(dx, dz)
	op.mat = s.mat
	op.col = s.col
	b:box((ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2, thick, y1 - y0, len, op)
end

--- Polar point.
function Roads.P(r: number, th: number): (number, number)
	return r * math.sin(th), r * math.cos(th)
end

--- Curved band between radii r0..r1 and angles th0..th1, approximated by
--- straight boxes about `segLen` studs long.
function Roads.arc(b: BuildList, r0: number, r1: number, th0: number, th1: number, top: number, s: Surface, segLen: number?, o: Opts?)
	local rm = (r0 + r1) / 2
	local w = r1 - r0
	local span = th1 - th0
	if span <= 0 then
		return
	end
	local n = math.max(1, math.ceil(rm * span / (segLen or 36)))
	local d = span / n
	for i = 0, n - 1 do
		local ta = th0 + i * d
		local tm = ta + d / 2
		local len = 2 * rm * math.sin(d / 2) + w * d * 0.55 + 0.2
		local x, z = Roads.P(rm, tm)
		local op: Opts = table.clone(o or {}) :: Opts
		op.yaw = math.atan2(math.cos(tm), -math.sin(tm))
		op.mat = s.mat
		op.col = s.col
		-- alternate a hair in height so overlapping ends never z-fight
		local dy = if i % 2 == 0 then 0 else 0.02
		b:box(x, top - THICK / 2 + dy, z, w, THICK, len, op)
	end
end

--- Vertical wall along an arc (canal edges). `face` = +1 wall faces outward.
function Roads.arcWall(b: BuildList, r: number, th0: number, th1: number, y0: number, y1: number, thick: number, s: Surface, segLen: number?)
	local span = th1 - th0
	if span <= 0 then
		return
	end
	local n = math.max(1, math.ceil(r * span / (segLen or 30)))
	local d = span / n
	for i = 0, n - 1 do
		local tm = th0 + (i + 0.5) * d
		local len = 2 * r * math.sin(d / 2) + 0.4
		local x, z = Roads.P(r, tm)
		b:box(x, (y0 + y1) / 2, z, thick, y1 - y0, len, { yaw = math.atan2(math.cos(tm), -math.sin(tm)), mat = s.mat, col = s.col })
	end
end

--- Terrain water along an arc band.
function Roads.arcWater(b: BuildList, r0: number, r1: number, th0: number, th1: number, top: number, depth: number)
	local rm = (r0 + r1) / 2
	local w = r1 - r0
	local span = th1 - th0
	local n = math.max(1, math.ceil(rm * span / 40))
	local d = span / n
	for i = 0, n - 1 do
		local tm = th0 + (i + 0.5) * d
		local len = 2 * rm * math.sin(d / 2) + w * d * 0.6 + 1
		local x, z = Roads.P(rm, tm)
		b:addWater(x, top - depth / 2, z, w, depth, len, math.atan2(math.cos(tm), -math.sin(tm)))
	end
end

--- Bridge profile: smooth hump of height H over half-length L (u in [-L, L]).
function Roads.hump(u: number, H: number, L: number): number
	local t = math.abs(u) / L
	if t >= 1 then
		return 0
	end
	return H * (1 - t * t) * (1 - t * t)
end

export type BridgeOpts = { deck: Surface?, wall: Surface?, segs: number?, railCol: number?, lights: boolean? }

--- Arched bridge along a straight line from A to B (A,B on the two banks,
--- including ramps). `span` = length of open water in the middle.
--- Returns nothing; adds deck, parapets, spandrel walls with an arch.
function Roads.bridge(b: BuildList, ax: number, az: number, bx: number, bz: number, width: number, H: number, waterTop: number, span: number, opts: BridgeOpts?)
	local op: BridgeOpts = opts or {}
	local deck: Surface = op.deck or Roads.SURF.klinker
	local wall: Surface = op.wall or Roads.SURF.brick
	local dx, dz = bx - ax, bz - az
	local len = math.sqrt(dx * dx + dz * dz)
	local ux, uz = dx / len, dz / len
	local nx, nz = uz, -ux -- sideways
	local L = len / 2
	local n = op.segs or math.max(6, math.floor(len / 9))
	local yaw = math.atan2(dx, dz)
	local function hAt(u: number): number
		return Roads.hump(u, H, L)
	end
	for i = 0, n - 1 do
		local u0 = -L + (2 * L) * i / n
		local u1 = -L + (2 * L) * (i + 1) / n
		local h0, h1 = hAt(u0), hAt(u1)
		local um = (u0 + u1) / 2
		local cx, cz = ax + ux * (um + L), az + uz * (um + L)
		local segLen = (u1 - u0) / math.cos(math.atan2(h1 - h0, u1 - u0)) + 0.3
		local pitch = -math.atan2(h1 - h0, u1 - u0)
		local hm = (h0 + h1) / 2
		-- deck top sits a little above street level so the ramps never z-fight
		b:box(cx, hm + 0.3 - 0.5, cz, width, 1.0, segLen, { yaw = yaw, pitch = pitch, mat = deck.mat, col = deck.col })
		for _, side in { -1, 1 } do
			local px, pz = cx + nx * side * (width / 2 - 0.4), cz + nz * side * (width / 2 - 0.4)
			-- parapet
			b:box(px, hm + 1.6, pz, 0.8, 2.6, segLen, { yaw = yaw, pitch = pitch, mat = wall.mat, col = wall.col })
			-- spandrel wall down to the arch (open arch in the middle)
			local archTop
			if math.abs(um) < span / 2 then
				local t = um / (span / 2)
				archTop = waterTop + (hm - 2.2 - waterTop) * math.sqrt(math.max(0, 1 - t * t))
			else
				archTop = waterTop - 1
			end
			local wallH = hm - 0.3 - archTop
			if wallH > 0.4 then
				local wx, wz = cx + nx * side * (width / 2 - 0.5), cz + nz * side * (width / 2 - 0.5)
				b:box(wx, archTop + wallH / 2, wz, 1.0, wallH, segLen, { yaw = yaw, mat = wall.mat, col = wall.col })
			end
		end
		-- bridge lights on the parapet
		if op.lights and i % 2 == 0 then
			for _, side in { -1, 1 } do
				local px, pz = cx + nx * side * (width / 2 - 0.4), cz + nz * side * (width / 2 - 0.4)
				b:box(px, hm + 3.05, pz, 0.35, 0.35, 0.35, { mat = "SmoothPlastic", col = 0xffe2a0, tag = "BridgeBulb", coll = false, shadow = false })
			end
		end
	end
end

--- Height of a bridge deck at distance u from its centre (for lanes/coins).
function Roads.bridgeHeight(u: number, H: number, L: number): number
	return Roads.hump(u, H, L) + 0.2
end

return Roads
