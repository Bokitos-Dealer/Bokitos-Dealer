-- Runs every city generator and prints part counts and sanity checks.
-- (run via tests/run.sh; `require` and `shared` are provided by the bundler)

local Cities = { "Hub", "Amsterdam", "Paris", "NewYork" }
local totalParts = 0
local failures = 0

local function check(cond: boolean, msg: string)
	if not cond then
		failures += 1
		print("  FAIL: " .. msg)
	end
end

for _, name in Cities do
	local ok, mod = pcall(function()
		return require(shared.Cities[name])
	end)
	if not ok then
		print(name .. ": failed to load: " .. tostring(mod))
		failures += 1
		continue
	end
	local t0 = os.clock()
	local ok2, b = pcall(mod.generate)
	if not ok2 then
		print(name .. ": generate() error: " .. tostring(b))
		failures += 1
		continue
	end
	local dt = os.clock() - t0
	local kinds = {}
	local tagged = {}
	local lights = 0
	for _, p in b.prims do
		kinds[p.k] = (kinds[p.k] or 0) + 1
		if p.tag then
			tagged[p.tag] = (tagged[p.tag] or 0) + 1
		end
		if p.light then
			lights += 1
		end
		check(p.sx > 0 and p.sy > 0 and p.sz > 0, name .. ": non-positive size " .. p.k)
		check(p.sx <= 2048 and p.sy <= 2048 and p.sz <= 2048, name .. ": part too big " .. p.sx .. "x" .. p.sy .. "x" .. p.sz)
		check(p.x == p.x and p.y == p.y and p.z == p.z and p.yaw == p.yaw and p.pitch == p.pitch, name .. ": NaN in prim")
	end
	local laneKinds = {}
	if mod.lanes then
		for _, l in mod.lanes() do
			laneKinds[l.kind] = (laneKinds[l.kind] or 0) + 1
			for i = 1, #l.xs do
				check(l.xs[i] == l.xs[i] and l.zs[i] == l.zs[i], name .. ": NaN in lane")
			end
		end
	else
		for _, l in b.lanes do
			laneKinds[l.kind] = (laneKinds[l.kind] or 0) + 1
			for _, pt in l.pts do
				check(pt[1] == pt[1] and pt[2] == pt[2] and pt[3] == pt[3], name .. ": NaN in lane")
			end
		end
	end
	local groups = {}
	for _, p in b.prims do
		if p.group then
			groups[p.group] = (groups[p.group] or 0) + 1
		end
	end
	local terrain = (b :: any).terrain
	local function fmt(t)
		local parts = {}
		for k, v in t do
			table.insert(parts, k .. "=" .. v)
		end
		table.sort(parts)
		return table.concat(parts, " ")
	end
	totalParts += #b.prims
	print(string.format("%-10s parts=%6d water=%4d lights=%4d landmarks=%2d coins=%4d doors=%4d shops=%2d  (%.2fs)", name, #b.prims, #b.water, lights, #b.landmarks, #b.coins, #b.doors, #b.shops, dt))
	print("           kinds: " .. fmt(kinds))
	print("           tags:  " .. fmt(tagged))
	print("           lanes: " .. fmt(laneKinds))
	print("           landmark models: " .. fmt(groups))
	if terrain then
		local kinds2 = {}
		for _, poly in terrain.polys do
			kinds2[poly.kind] = (kinds2[poly.kind] or 0) + 1
		end
		print("           terrain: " .. fmt(kinds2))
		check(terrain.bounds[3] > terrain.bounds[1] and terrain.bounds[4] > terrain.bounds[2], name .. ": bad terrain bounds")
	end
	check(#b.prims < 190000, name .. ": too many parts for the server")
	check(#b.landmarks >= 3 or name == "Hub", name .. ": too few landmarks")
	check(b.spawn ~= nil, name .. ": no spawn")
	if name ~= "Hub" then
		check(#b.doors >= 20, name .. ": too few delivery doors")
		check(#b.shops >= 2, name .. ": too few shops")
		check(#b.coins >= 50, name .. ": too few coins")
	end
end
print("TOTAL parts: " .. totalParts)
print(if failures == 0 then "ALL CHECKS PASSED" else ("FAILURES: " .. failures))
