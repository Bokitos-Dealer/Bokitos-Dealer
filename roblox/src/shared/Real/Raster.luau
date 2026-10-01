--!strict
-- Paints polygons (water, parks, squares) into a grid of terrain cells, one
-- byte per cell. Pure Luau so it can be tested outside Roblox.

local Raster = {}

export type Grid = {
	cell: number, -- studs per cell
	x0: number, -- city coordinates of the grid's corner (studs)
	z0: number,
	nx: number,
	nz: number,
	data: buffer, -- one code per cell (0 = plain ground)
}

function Raster.new(x0: number, z0: number, x1: number, z1: number, cell: number): Grid
	-- line the grid up with Roblox's 4-stud terrain voxels
	local gx0 = math.floor(x0 / cell) * cell
	local gz0 = math.floor(z0 / cell) * cell
	local nx = math.ceil((x1 - gx0) / cell)
	local nz = math.ceil((z1 - gz0) / cell)
	return { cell = cell, x0 = gx0, z0 = gz0, nx = nx, nz = nz, data = buffer.create(nx * nz) }
end

function Raster.get(g: Grid, ix: number, iz: number): number
	return buffer.readu8(g.data, iz * g.nx + ix)
end

--- Fill rings (even-odd, so holes work) with `code`. With `grow` > 0 the
--- shape is made that many studs bigger (used for water, so the ground never
--- pokes out in front of a quay wall).
function Raster.paint(g: Grid, rings: { { number } }, code: number, grow: number)
	local cell, x0, z0, nx, nz = g.cell, g.x0, g.z0, g.nx, g.nz
	-- bucket the edges by the rows they cross
	local buckets: { [number]: { number } } = {}
	local zmin, zmax = math.huge, -math.huge
	for _, ring in rings do
		local n = #ring // 2
		for i = 1, n do
			local j = i % n + 1
			local ax, az, bx, bz = ring[2 * i - 1], ring[2 * i], ring[2 * j - 1], ring[2 * j]
			if az ~= bz then
				local r0 = math.max(0, math.floor((math.min(az, bz) - grow - z0) / cell))
				local r1 = math.min(nz - 1, math.floor((math.max(az, bz) + grow - z0) / cell))
				for r = r0, r1 do
					local bk = buckets[r]
					if not bk then
						bk = {}
						buckets[r] = bk
					end
					table.insert(bk, ax)
					table.insert(bk, az)
					table.insert(bk, bx)
					table.insert(bk, bz)
				end
				zmin = math.min(zmin, az, bz)
				zmax = math.max(zmax, az, bz)
			end
		end
	end
	local samples: { number } = if grow > 0 then { -grow, 0, grow } else { 0 }
	local xs: { number } = {}
	for r, edges in buckets do
		local zc = z0 + (r + 0.5) * cell
		for _, off in samples do
			local zs = zc + off
			table.clear(xs)
			for e = 1, #edges, 4 do
				local ax, az, bx, bz = edges[e], edges[e + 1], edges[e + 2], edges[e + 3]
				if (az <= zs and zs < bz) or (bz <= zs and zs < az) then
					table.insert(xs, ax + (zs - az) * (bx - ax) / (bz - az))
				end
			end
			table.sort(xs)
			for k = 1, #xs - 1, 2 do
				local c0 = math.max(0, math.ceil((xs[k] - grow - x0) / cell - 0.5))
				local c1 = math.min(nx - 1, math.floor((xs[k + 1] + grow - x0) / cell - 0.5))
				local base = r * nx
				for c = c0, c1 do
					buffer.writeu8(g.data, base + c, code)
				end
			end
		end
	end
end

--- Is any cell in this block of the grid not plain ground?
function Raster.blockUsed(g: Grid, ix0: number, iz0: number, sx: number, sz: number): boolean
	for iz = iz0, math.min(g.nz - 1, iz0 + sz - 1) do
		local base = iz * g.nx
		for ix = ix0, math.min(g.nx - 1, ix0 + sx - 1) do
			if buffer.readu8(g.data, base + ix) ~= 0 then
				return true
			end
		end
	end
	return false
end

return Raster
