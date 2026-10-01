--!strict
-- Adds windows, doors, gable tops, balconies and road markings to the streets
-- around the player (made on this computer only, and removed again when you
-- ride away), so real cities look detailed without slowing anyone down.

local CollectionService = game:GetService("CollectionService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Config = require(Shared.Config)
local Build = require(Shared.Build)
local PartFactory = require(Shared.PartFactory)
local Decode = require(Shared.Real.Decode)
local Facades = require(Shared.Real.Facades)
local State = require(script.Parent.State)

local M = 3
local CELL = 64 * M -- studs per detail cell
local RADIUS = 115 * M -- how far around the player details are shown
local KEEP = RADIUS + CELL
local PARTS_PER_FRAME = 350

local Detail = {}

type Cell = { b: { number }, r: { { number } }, c: { number } }
type CityDetail = {
	id: string,
	origin: Vector3,
	style: string,
	buildings: { Decode.Building },
	roads: { Decode.Road },
	crossings: { Decode.Prop },
	cells: { [string]: Cell },
}
type Job = { key: string, prims: { Build.Prim }, i: number, model: Model }

local folder = Instance.new("Folder")
folder.Name = "Detail"
folder.Parent = Workspace

local city: CityDetail? = nil
local loadingId: string? = nil
local active: { [string]: Model } = {}
local jobs: { Job } = {}

local function cellKey(cx: number, cz: number): string
	return cx .. "," .. cz
end

local function cellOf(x: number, z: number): (number, number)
	return math.floor(x / CELL), math.floor(z / CELL)
end

local function getCell(cells: { [string]: Cell }, x: number, z: number): Cell
	local cx, cz = cellOf(x, z)
	local k = cellKey(cx, cz)
	local c = cells[k]
	if not c then
		c = { b = {}, r = {}, c = {} }
		cells[k] = c
	end
	return c
end

local function clear()
	table.clear(jobs)
	for _, m in active do
		m:Destroy()
	end
	table.clear(active)
end

--- Read a city's data (only real cities have it).
local function load(id: string): CityDetail?
	for _, c in Config.Cities do
		if c.id == id then
			local mod = Shared.Cities:FindFirstChild(c.module)
			if not mod then
				return nil
			end
			local gen = (require :: any)(mod)
			local data = gen.data
			if not data then
				return nil
			end
			local cd: CityDetail = {
				id = id,
				origin = c.origin,
				style = data.meta.style,
				buildings = Decode.buildings(data.buildings),
				roads = {},
				crossings = {},
				cells = {},
			}
			task.wait()
			for i, bld in cd.buildings do
				if string.find(bld.flags, "[23]") then
					table.insert(getCell(cd.cells, bld.xs[1], bld.zs[1]).b, i)
				end
			end
			task.wait()
			cd.roads = Decode.roads(data.roads)
			for ri, r in cd.roads do
				if r.kind ~= 1 and r.kind ~= 6 then
					continue
				end
				if r.kind == 1 and bit32.band(r.flags, 64 + 32) == 0 then
					continue
				end
				for i = 1, #r.xs - 1 do
					local cell = getCell(cd.cells, (r.xs[i] + r.xs[i + 1]) / 2, (r.zs[i] + r.zs[i + 1]) / 2)
					table.insert(cell.r, { ri, i })
				end
			end
			task.wait()
			for _, p in Decode.props(data.props) do
				if p.kind == 11 then
					table.insert(cd.crossings, p)
					table.insert(getCell(cd.cells, p.x, p.z).c, #cd.crossings)
				end
			end
			return cd
		end
	end
	return nil
end

local function makeCell(cd: CityDetail, key: string)
	local cell = cd.cells[key]
	local model = Instance.new("Model")
	model.Name = key
	active[key] = model
	if not cell then
		return
	end
	local b = Build.new()
	for _, bi in cell.b do
		Facades.building(b, cd.buildings[bi], cd.style, Build.rng(bi * 7919 + 13))
	end
	for _, rs in cell.r do
		local r = cd.roads[rs[1]]
		local i = rs[2]
		Facades.road(b, {
			kind = r.kind,
			width = r.width,
			surf = r.surf,
			flags = r.flags,
			xs = { r.xs[i], r.xs[i + 1] },
			zs = { r.zs[i], r.zs[i + 1] },
		}, cd.style)
	end
	for _, ci in cell.c do
		Facades.crossing(b, cd.crossings[ci], cd.style)
	end
	if #b.prims > 0 then
		table.insert(jobs, { key = key, prims = b.prims, i = 1, model = model })
	end
end

local function playerPos(): Vector3?
	local ride = State.ride
	if ride.onBike then
		return ride.pos
	end
	local char = Players.LocalPlayer.Character
	local hrp = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
	return if hrp then hrp.Position else nil
end

local function refresh()
	local id = State.city()
	if not city or city.id ~= id then
		if loadingId == id then
			return
		end
		clear()
		city = nil
		loadingId = id
		task.spawn(function()
			local ok, result = pcall(load, id)
			if loadingId == id then
				-- the hub has no map data: remember that with an empty city
				city = if ok and result then result else { id = id, origin = Vector3.zero, style = "", buildings = {}, roads = {}, crossings = {}, cells = {} }
				loadingId = nil
				if not ok then
					warn("[Bike the World] details failed: " .. tostring(result))
				end
			end
		end)
		return
	end
	local cd = city :: CityDetail
	local pos = playerPos()
	if not pos then
		return
	end
	local lx, lz = pos.X - cd.origin.X, pos.Z - cd.origin.Z
	-- drop cells that are far away
	for key, model in active do
		local cx, cz = string.match(key, "^(-?%d+),(-?%d+)$")
		local mx = (tonumber(cx) :: number + 0.5) * CELL
		local mz = (tonumber(cz) :: number + 0.5) * CELL
		if (mx - lx) ^ 2 + (mz - lz) ^ 2 > KEEP * KEEP then
			model:Destroy()
			active[key] = nil
			for i = #jobs, 1, -1 do
				if jobs[i].key == key then
					table.remove(jobs, i)
				end
			end
		end
	end
	-- add the nearest missing cells first
	local want = {}
	local c0x, c0z = cellOf(lx - RADIUS, lz - RADIUS)
	local c1x, c1z = cellOf(lx + RADIUS, lz + RADIUS)
	for cx = c0x, c1x do
		for cz = c0z, c1z do
			local mx, mz = (cx + 0.5) * CELL, (cz + 0.5) * CELL
			local d = (mx - lx) ^ 2 + (mz - lz) ^ 2
			local key = cellKey(cx, cz)
			if d < RADIUS * RADIUS and not active[key] then
				table.insert(want, { key = key, d = d })
			end
		end
	end
	table.sort(want, function(a, b)
		return a.d < b.d
	end)
	for i = 1, math.min(#want, 3) do
		makeCell(cd, want[i].key)
	end
end

local function work()
	local cd = city
	if not cd then
		return
	end
	local budget = PARTS_PER_FRAME
	while budget > 0 and #jobs > 0 do
		local job = jobs[1]
		local last = math.min(#job.prims, job.i + budget - 1)
		for i = job.i, last do
			local p = job.prims[i]
			local part = PartFactory.make(p, cd.origin)
			if p.tag then
				CollectionService:AddTag(part, p.tag)
			end
			part.Parent = job.model
		end
		budget -= last - job.i + 1
		job.i = last + 1
		if job.i > #job.prims then
			job.model.Parent = folder
			table.remove(jobs, 1)
		elseif not job.model.Parent then
			job.model.Parent = folder
		end
	end
end

function Detail.init()
	RunService.Heartbeat:Connect(work)
	task.spawn(function()
		while true do
			task.wait(0.35)
			local ok, err = pcall(function()
				refresh()
			end)
			if not ok then
				warn("[Bike the World] details: " .. tostring(err))
			end
		end
	end)
end

return Detail
