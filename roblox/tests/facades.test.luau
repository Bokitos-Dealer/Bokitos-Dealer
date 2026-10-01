-- Makes every facade detail of each real city once and checks the numbers:
-- no broken parts, and not too many parts around any one spot.
-- (run via tests/run.sh)

local Build = require(shared.Build)
local Decode = require(shared.Real.Decode)
local Facades = require(shared.Real.Facades)

local failures = 0
local function check(cond: boolean, msg: string)
	if not cond then
		failures += 1
		if failures < 20 then
			print("  FAIL: " .. msg)
		end
	end
end

local CELL = 64 * 3
for _, name in { "Amsterdam", "Paris", "NewYork" } do
	local data = require(shared.CityData[name])
	local style = data.meta.style
	local t0 = os.clock()
	local buildings = Decode.buildings(data.buildings)
	local perCell = {}
	local total = 0
	for i, bld in buildings do
		local b = Build.new()
		Facades.building(b, bld, style, Build.rng(i * 7919 + 13))
		for _, p in b.prims do
			check(p.sx > 0 and p.sy > 0 and p.sz > 0, name .. ": bad size")
			check(p.x == p.x and p.y == p.y and p.z == p.z and p.roll == p.roll, name .. ": NaN")
		end
		local k = math.floor(bld.xs[1] / CELL) .. "," .. math.floor(bld.zs[1] / CELL)
		perCell[k] = (perCell[k] or 0) + #b.prims
		total += #b.prims
	end
	local roads = Decode.roads(data.roads)
	local marks = 0
	for _, r in roads do
		local b = Build.new()
		Facades.road(b, r, style)
		marks += #b.prims
	end
	local worst, cells = 0, 0
	for _, n in perCell do
		worst = math.max(worst, n)
		cells += 1
	end
	-- the client shows about 9 cells around the player
	print(string.format("%-10s facade parts=%7d  road marks=%6d  cells=%4d  busiest cell=%5d  avg=%4d  (%.2fs)", name, total, marks, cells, worst, total // math.max(1, cells), os.clock() - t0))
	check(worst < 6000, name .. ": a cell has too many detail parts")
end
print(if failures == 0 then "ALL FACADE TESTS PASSED" else ("FAILURES: " .. failures))
