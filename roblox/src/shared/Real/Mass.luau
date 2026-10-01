--!strict
-- Solid shapes for real-world footprints: boxes, and upright triangular
-- prisms made of WedgeParts (a footprint triangle needs one or two wedges).

local Build = require(script.Parent.Parent.Build)

type BuildList = Build.BuildList
type Opts = Build.Opts

local Mass = {}

local EPS = 0.05

--- Upright prism over a right triangle: right angle at R, legs to P and Q.
--- A WedgePart's cross-section is a right triangle; we stand it on its side
--- (local X up) so the triangle lies flat and the part's length is the height.
local function rightPrism(b: BuildList, rx: number, rz: number, px: number, pz: number, qx: number, qz: number, y0: number, y1: number, o: Opts?)
	local zx, zz = rx - px, rz - pz -- local Z: from P to R
	local yx, yz = qx - rx, qz - rz -- local Y: from R to Q
	local lz = math.sqrt(zx * zx + zz * zz)
	local ly = math.sqrt(yx * yx + yz * yz)
	if lz < EPS or ly < EPS or y1 - y0 < EPS then
		return
	end
	local yaw = math.atan2(zx / lz, zz / lz)
	-- with roll = +90 degrees local Y points along (-cos yaw, 0, sin yaw)
	local roll = if yx * -math.cos(yaw) + yz * math.sin(yaw) >= 0 then math.pi / 2 else -math.pi / 2
	local op: Opts = table.clone(o or {}) :: Opts
	op.yaw = yaw
	op.pitch = 0
	op.roll = roll
	b:wedge((px + qx) / 2, (y0 + y1) / 2, (pz + qz) / 2, y1 - y0, ly, lz, op)
end
Mass.rightPrism = rightPrism

--- Upright prism over any triangle ABC between heights y0 and y1.
function Mass.triPrism(b: BuildList, ax: number, az: number, bx: number, bz: number, cx: number, cz: number, y0: number, y1: number, o: Opts?)
	-- use the longest side as the base so the foot of the height lies on it
	local lab = (bx - ax) ^ 2 + (bz - az) ^ 2
	local lbc = (cx - bx) ^ 2 + (cz - bz) ^ 2
	local lca = (ax - cx) ^ 2 + (az - cz) ^ 2
	if lbc >= lab and lbc >= lca then
		ax, az, bx, bz, cx, cz = bx, bz, cx, cz, ax, az
		lab = lbc
	elseif lca >= lab and lca >= lbc then
		ax, az, bx, bz, cx, cz = cx, cz, ax, az, bx, bz
		lab = lca
	end
	if lab < EPS * EPS then
		return
	end
	local t = ((cx - ax) * (bx - ax) + (cz - az) * (bz - az)) / lab
	local dx, dz = ax + (bx - ax) * t, az + (bz - az) * t
	if (cx - dx) ^ 2 + (cz - dz) ^ 2 < EPS * EPS then
		return -- flat triangle
	end
	rightPrism(b, dx, dz, ax, az, cx, cz, y0, y1, o)
	rightPrism(b, dx, dz, bx, bz, cx, cz, y0, y1, o)
end

--- A box with its own yaw (local X = width, local Z = depth).
function Mass.rect(b: BuildList, cx: number, cz: number, w: number, d: number, yaw: number, y0: number, y1: number, o: Opts?)
	if w < EPS or d < EPS or y1 - y0 < EPS then
		return
	end
	local op: Opts = table.clone(o or {}) :: Opts
	op.yaw = yaw
	if w > 2000 or d > 2000 then
		-- parts can be at most 2048 studs: split the long side
		local c, s = math.cos(yaw), math.sin(yaw)
		if w >= d then
			local hx, hz = c * w / 4, -s * w / 4
			Mass.rect(b, cx - hx, cz - hz, w / 2, d, yaw, y0, y1, o)
			Mass.rect(b, cx + hx, cz + hz, w / 2, d, yaw, y0, y1, o)
		else
			local hx, hz = s * d / 4, c * d / 4
			Mass.rect(b, cx - hx, cz - hz, w, d / 2, yaw, y0, y1, o)
			Mass.rect(b, cx + hx, cz + hz, w, d / 2, yaw, y0, y1, o)
		end
		return
	end
	b:box(cx, (y0 + y1) / 2, cz, w, y1 - y0, d, op)
end

--- Triangulate a simple polygon (flat list x1, z1, x2, z2...) by ear clipping.
--- Returns 1-based vertex index triples.
function Mass.earClip(ring: { number }): { number }
	local n = #ring // 2
	local out = {}
	if n < 3 then
		return out
	end
	local idx = {}
	-- signed area to know the winding
	local area = 0
	for i = 1, n do
		local j = i % n + 1
		area += ring[2 * i - 1] * ring[2 * j] - ring[2 * j - 1] * ring[2 * i]
		idx[i] = i
	end
	local ccw = area > 0
	local function x(i: number): number
		return ring[2 * i - 1]
	end
	local function z(i: number): number
		return ring[2 * i]
	end
	local function convex(a: number, b2: number, c: number): boolean
		local cr = (x(b2) - x(a)) * (z(c) - z(a)) - (z(b2) - z(a)) * (x(c) - x(a))
		return if ccw then cr > 1e-9 else cr < -1e-9
	end
	local function inside(p: number, a: number, b2: number, c: number): boolean
		local function s(u: number, v: number): number
			return (x(v) - x(u)) * (z(p) - z(u)) - (z(v) - z(u)) * (x(p) - x(u))
		end
		local d1, d2, d3 = s(a, b2), s(b2, c), s(c, a)
		local neg = d1 < 0 or d2 < 0 or d3 < 0
		local pos = d1 > 0 or d2 > 0 or d3 > 0
		return not (neg and pos)
	end
	local guard = 0
	while #idx > 3 and guard < n * n do
		guard += 1
		local m = #idx
		local clipped = false
		for k = 1, m do
			local a, b2, c = idx[(k - 2) % m + 1], idx[k], idx[k % m + 1]
			if convex(a, b2, c) then
				local ok = true
				for _, p in idx do
					if p ~= a and p ~= b2 and p ~= c and inside(p, a, b2, c) then
						ok = false
						break
					end
				end
				if ok then
					table.insert(out, a)
					table.insert(out, b2)
					table.insert(out, c)
					table.remove(idx, k)
					clipped = true
					break
				end
			end
		end
		if not clipped then
			break -- bad polygon: give up on the rest
		end
	end
	if #idx == 3 then
		table.insert(out, idx[1])
		table.insert(out, idx[2])
		table.insert(out, idx[3])
	end
	return out
end

--- Fill a polygon ring (flat list) as a solid slab between y0 and y1.
function Mass.fillRing(b: BuildList, ring: { number }, y0: number, y1: number, o: Opts?)
	local tris = Mass.earClip(ring)
	for i = 1, #tris, 3 do
		local a, c, d = tris[i], tris[i + 1], tris[i + 2]
		Mass.triPrism(b, ring[2 * a - 1], ring[2 * a], ring[2 * c - 1], ring[2 * c], ring[2 * d - 1], ring[2 * d], y0, y1, o)
	end
end

return Mass
