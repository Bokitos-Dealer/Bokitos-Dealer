-- Checks the maths that turns footprint triangles into WedgeParts, by
-- rebuilding each wedge's corners with the same rotation Roblox uses.
-- (run via tests/run.sh)

local Build = require(shared.Build)
local Mass = require(shared.Real.Mass)

local failures = 0
local function check(cond: boolean, msg: string)
	if not cond then
		failures += 1
		print("  FAIL: " .. msg)
	end
end

-- 3x3 rotation for CFrame.Angles(0,yaw,0) * Angles(pitch,0,0) * Angles(0,0,roll)
local function mul(a, b)
	local r = {}
	for i = 1, 3 do
		r[i] = {}
		for j = 1, 3 do
			r[i][j] = a[i][1] * b[1][j] + a[i][2] * b[2][j] + a[i][3] * b[3][j]
		end
	end
	return r
end
local function rotY(t)
	local c, s = math.cos(t), math.sin(t)
	return { { c, 0, s }, { 0, 1, 0 }, { -s, 0, c } }
end
local function rotX(t)
	local c, s = math.cos(t), math.sin(t)
	return { { 1, 0, 0 }, { 0, c, -s }, { 0, s, c } }
end
local function rotZ(t)
	local c, s = math.cos(t), math.sin(t)
	return { { c, -s, 0 }, { s, c, 0 }, { 0, 0, 1 } }
end
local function apply(m, v)
	return {
		m[1][1] * v[1] + m[1][2] * v[2] + m[1][3] * v[3],
		m[2][1] * v[1] + m[2][2] * v[2] + m[2][3] * v[3],
		m[3][1] * v[1] + m[3][2] * v[2] + m[3][3] * v[3],
	}
end

-- corners of a WedgePart's triangle (bottom-front, bottom-back, top-back) in world space
local function wedgeTriangle(p)
	local R = mul(mul(rotY(p.yaw), rotX(p.pitch)), rotZ(p.roll))
	local out = {}
	for _, c in { { -1, -1 }, { -1, 1 }, { 1, 1 } } do
		local v = apply(R, { 0, c[1] * p.sy / 2, c[2] * p.sz / 2 })
		table.insert(out, { p.x + v[1], p.z + v[3] })
	end
	-- the extrusion (local X) must be vertical
	local up = apply(R, { 1, 0, 0 })
	check(math.abs(math.abs(up[2]) - 1) < 1e-6, "wedge length is not vertical")
	return out
end

local function area(t)
	return math.abs((t[2][1] - t[1][1]) * (t[3][2] - t[1][2]) - (t[3][1] - t[1][1]) * (t[2][2] - t[1][2])) / 2
end

local function inTri(px, pz, t)
	local function s(a, b)
		return (b[1] - a[1]) * (pz - a[2]) - (b[2] - a[2]) * (px - a[1])
	end
	local d1, d2, d3 = s(t[1], t[2]), s(t[2], t[3]), s(t[3], t[1])
	local neg = d1 < -1e-6 or d2 < -1e-6 or d3 < -1e-6
	local pos = d1 > 1e-6 or d2 > 1e-6 or d3 > 1e-6
	return not (neg and pos)
end

local rng = Build.rng(7)
for case = 1, 300 do
	local tri = {}
	for k = 1, 3 do
		tri[k] = { rng:range(-50, 50), rng:range(-50, 50) }
	end
	local A = area(tri)
	if A < 5 then
		continue
	end
	local b = Build.new()
	Mass.triPrism(b, tri[1][1], tri[1][2], tri[2][1], tri[2][2], tri[3][1], tri[3][2], 0, 10)
	local sum = 0
	for _, p in b.prims do
		local t = wedgeTriangle(p)
		sum += area(t)
		for _, c in t do
			check(inTri(c[1], c[2], tri), "case " .. case .. ": wedge corner outside the triangle")
		end
		check(math.abs(p.y - 5) < 1e-6 and math.abs(p.sx - 10) < 1e-6, "case " .. case .. ": wrong height")
	end
	check(math.abs(sum - A) < 1e-3 * A, string.format("case %d: wedges cover %.2f of %.2f", case, sum, A))
end

-- ear clipping fills the whole polygon
local ring = { 0, 0, 10, 0, 10, 10, 5, 4, 0, 10 }
local tris = Mass.earClip(ring)
check(#tris == 9, "concave pentagon should give 3 triangles")
print(if failures == 0 then "ALL GEOMETRY TESTS PASSED" else ("FAILURES: " .. failures))

-- terrain painting: a square of water with a hole of grass
local Raster = require(shared.Real.Raster)
local g = Raster.new(0, 0, 100, 100, 4)
Raster.paint(g, { { 20, 20, 80, 20, 80, 80, 20, 80 } }, 1, 0)
Raster.paint(g, { { 40, 40, 60, 40, 60, 60, 40, 60 } }, 2, 0)
check(Raster.get(g, 2, 2) == 0, "outside should stay ground")
check(Raster.get(g, 7, 7) == 1, "inside should be water")
check(Raster.get(g, 12, 12) == 2, "middle should be grass")
check(Raster.blockUsed(g, 0, 0, 4, 4) == false, "corner block is plain ground")
check(Raster.blockUsed(g, 4, 4, 4, 4) == true, "block with water is used")
print(if failures == 0 then "ALL RASTER TESTS PASSED" else ("FAILURES: " .. failures))
