--!strict
-- Turns a build list (plain data) into parts, terrain water, lights and signs.

local CollectionService = game:GetService("CollectionService")
local Workspace = game:GetService("Workspace")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Build = require(Shared.Build)
local PartFactory = require(Shared.PartFactory)
local Raster = require(Shared.Real.Raster)

local Materializer = {}

local color = PartFactory.color
Materializer.color = color

local function makeSign(origin: Vector3, s: Build.Sign, parent: Instance)
	local part = Instance.new("Part")
	part.Anchored = true
	part.CanCollide = false
	part.CanQuery = false
	part.CanTouch = false
	part.Size = Vector3.new(s.w, s.h, 0.4)
	part.CFrame = CFrame.new(origin.X + s.x, origin.Y + s.y, origin.Z + s.z) * CFrame.Angles(0, s.yaw, 0)
	part.Color = color(s.bg)
	part.Material = Enum.Material.SmoothPlastic
	local gui = Instance.new("SurfaceGui")
	gui.Face = Enum.NormalId.Front
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 20
	gui.LightInfluence = 0
	gui.Parent = part
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Text = s.text
	label.TextScaled = true
	label.Font = Enum.Font.FredokaOne
	label.TextColor3 = color(s.col)
	label.Parent = gui
	part.Parent = parent
end

export type Built = {
	folder: Folder,
	portals: { BasePart },
	kiosks: { BasePart },
}

--- Create everything in `b` at `origin`, under a new Folder in `parent`.
--- Yields every so often so big cities don't time out the script.
function Materializer.build(b: Build.BuildList, origin: Vector3, name: string, parent: Instance): Built
	local folder = Instance.new("Folder")
	folder.Name = name
	local result: Built = { folder = folder, portals = {}, kiosks = {} }
	-- group parts into chunks so the explorer stays readable
	local chunks: { [string]: Model } = {}
	local function chunkFor(x: number, z: number): Model
		local key = string.format("%d_%d", math.floor(x / 400), math.floor(z / 400))
		local found = chunks[key]
		if found then
			return found
		end
		local m = Instance.new("Model")
		m.Name = "Chunk_" .. key
		-- far away chunks are drawn as simple shapes, so the skyline stays
		pcall(function()
			m.LevelOfDetail = Enum.ModelLevelOfDetail.StreamingMesh
		end)
		m.Parent = folder
		chunks[key] = m
		return m
	end
	-- landmarks get their own model that every player always has loaded
	local groups: { [string]: Model } = {}
	local function groupModel(name: string): Model
		local found = groups[name]
		if found then
			return found
		end
		local m = Instance.new("Model")
		m.Name = name
		m.ModelStreamingMode = Enum.ModelStreamingMode.Persistent
		m.Parent = folder
		groups[name] = m
		return m
	end
	local made = 0
	for _, p in b.prims do
		local part = PartFactory.make(p, origin)
		if p.light then
			local light = Instance.new("PointLight")
			light.Range = p.light.range
			light.Brightness = p.light.brightness
			light.Color = color(p.light.col)
			light.Shadows = false
			light.Enabled = false -- switched on at night by the client
			light.Parent = part
		end
		local tag = p.tag
		if tag then
			if string.sub(tag, 1, 7) == "Portal:" then
				part:SetAttribute("City", string.sub(tag, 8))
				part.CanTouch = true
				CollectionService:AddTag(part, "Portal")
				table.insert(result.portals, part)
			elseif tag == "ShopKiosk" then
				table.insert(result.kiosks, part)
				CollectionService:AddTag(part, tag)
			else
				CollectionService:AddTag(part, tag)
			end
		end
		local group = p.group
		part.Parent = if group then groupModel(group) else chunkFor(p.x, p.z)
		made += 1
		if made % 1500 == 0 then
			task.wait()
		end
	end
	for _, s in b.signs do
		makeSign(origin, s, folder)
	end
	-- terrain water with a muddy bottom
	local terrain = Workspace.Terrain
	for i, w in b.water do
		local cf = CFrame.new(origin.X + w[1], origin.Y + w[2], origin.Z + w[3]) * CFrame.Angles(0, w[7], 0)
		local size = Vector3.new(w[4], w[5], w[6])
		terrain:FillBlock(cf, size, Enum.Material.Water)
		terrain:FillBlock(cf * CFrame.new(0, -w[5] / 2 - 2, 0), Vector3.new(w[4], 4, w[6]), Enum.Material.Mud)
		if i % 100 == 0 then
			task.wait()
		end
	end
	local spec = (b :: any).terrain
	if spec then
		Materializer.terrain(spec, origin)
	end
	folder.Parent = parent
	return result
end

local TERRAIN: { [number]: Enum.Material } = {
	[0] = Enum.Material.Pavement,
	[2] = Enum.Material.Grass,
	[3] = Enum.Material.LeafyGrass,
	[4] = Enum.Material.Sand,
	[5] = Enum.Material.LeafyGrass,
	[8] = Enum.Material.Cobblestone,
}

--- Ground, water and parks of a real city, written into Roblox terrain.
function Materializer.terrain(spec: any, origin: Vector3)
	local bd = spec.bounds
	local wl: number = spec.waterLevel
	local g = Raster.new(bd[1], bd[2], bd[3], bd[4], 4)
	for _, poly in spec.polys do
		if poly.kind ~= 1 then
			Raster.paint(g, poly.rings, poly.kind, 0)
		end
	end
	task.wait()
	for _, poly in spec.polys do
		if poly.kind == 1 then
			-- a little bigger than the real water: the quay walls cover the edge
			Raster.paint(g, poly.rings, 1, 2.2)
		end
	end
	task.wait()
	local terrain = Workspace.Terrain
	local yBottom = math.floor((wl - 16) / 4) * 4
	local ny = math.floor(-yBottom / 4)
	local x0w, z0w = origin.X + g.x0, origin.Z + g.z0
	local W, D = g.nx * 4, g.nz * 4
	-- plain pavement everywhere first
	for tx = 0, W - 1, 1024 do
		for tz = 0, D - 1, 1024 do
			local sx, sz = math.min(1024, W - tx), math.min(1024, D - tz)
			terrain:FillBlock(CFrame.new(x0w + tx + sx / 2, origin.Y - 4, z0w + tz + sz / 2), Vector3.new(sx, 8, sz), Enum.Material.Pavement)
		end
	end
	-- then every block that has water, grass or squares in it
	local B = 32
	local written = 0
	for bz = 0, g.nz - 1, B do
		for bx = 0, g.nx - 1, B do
			if not Raster.blockUsed(g, bx, bz, B, B) then
				continue
			end
			local sx, sz = math.min(B, g.nx - bx), math.min(B, g.nz - bz)
			local mats, occ = {}, {}
			for ix = 1, sx do
				local mcol, ocol = {}, {}
				for iy = 1, ny do
					local mrow, orow = {}, {}
					local yb = yBottom + (iy - 1) * 4
					for iz = 1, sz do
						local code = Raster.get(g, bx + ix - 1, bz + iz - 1)
						local m, o = Enum.Material.Air, 0
						if code == 1 then
							if yb >= wl - 12 and yb + 4 <= wl then
								m, o = Enum.Material.Water, 1
							elseif yb >= wl - 16 and yb < wl - 12 then
								m, o = Enum.Material.Mud, 1
							end
						elseif yb >= -8 and yb + 4 <= 0 then
							m, o = TERRAIN[code] or Enum.Material.Pavement, 1
						end
						mrow[iz] = m
						orow[iz] = o
					end
					mcol[iy] = mrow
					ocol[iy] = orow
				end
				mats[ix] = mcol
				occ[ix] = ocol
			end
			local minV = Vector3.new(x0w + bx * 4, origin.Y + yBottom, z0w + bz * 4)
			terrain:WriteVoxels(Region3.new(minV, minV + Vector3.new(sx * 4, ny * 4, sz * 4)), 4, mats, occ)
			written += 1
			if written % 10 == 0 then
				task.wait()
			end
		end
	end
end

return Materializer
