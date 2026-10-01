--!strict
-- Turns a build list (plain data) into parts, terrain water, lights and signs.

local CollectionService = game:GetService("CollectionService")
local Workspace = game:GetService("Workspace")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Build = require(Shared.Build)

local Materializer = {}

local MATERIALS: { [string]: Enum.Material } = {
	SmoothPlastic = Enum.Material.SmoothPlastic,
	Plastic = Enum.Material.Plastic,
	Brick = Enum.Material.Brick,
	Cobblestone = Enum.Material.Cobblestone,
	Concrete = Enum.Material.Concrete,
	Asphalt = Enum.Material.Asphalt,
	Pavement = Enum.Material.Pavement,
	Granite = Enum.Material.Granite,
	Limestone = Enum.Material.Limestone,
	Sandstone = Enum.Material.Sandstone,
	Marble = Enum.Material.Marble,
	Slate = Enum.Material.Slate,
	Wood = Enum.Material.Wood,
	WoodPlanks = Enum.Material.WoodPlanks,
	Metal = Enum.Material.Metal,
	Glass = Enum.Material.Glass,
	Neon = Enum.Material.Neon,
	Fabric = Enum.Material.Fabric,
	Grass = Enum.Material.Grass,
	LeafyGrass = Enum.Material.LeafyGrass,
	Ground = Enum.Material.Ground,
	Sand = Enum.Material.Sand,
	Mud = Enum.Material.Mud,
	Rubber = Enum.Material.Rubber,
	Leather = Enum.Material.Leather,
	Plaster = Enum.Material.Plaster,
	ClayRoofTiles = Enum.Material.ClayRoofTiles,
	RoofShingles = Enum.Material.RoofShingles,
	ForceField = Enum.Material.ForceField,
	Foil = Enum.Material.Foil,
}

local function color(hex: number): Color3
	return Color3.fromRGB(bit32.extract(hex, 16, 8), bit32.extract(hex, 8, 8), bit32.extract(hex, 0, 8))
end
Materializer.color = color

local function cframeOf(origin: Vector3, p: Build.Prim): CFrame
	return CFrame.new(origin.X + p.x, origin.Y + p.y, origin.Z + p.z)
		* CFrame.Angles(0, p.yaw, 0)
		* CFrame.Angles(p.pitch, 0, 0)
		* CFrame.Angles(0, 0, p.roll)
end

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
		m.Parent = folder
		chunks[key] = m
		return m
	end
	local made = 0
	for _, p in b.prims do
		local part: BasePart
		if p.k == "wedge" then
			part = Instance.new("WedgePart")
		elseif p.k == "cwedge" then
			part = Instance.new("CornerWedgePart")
		else
			local pp = Instance.new("Part")
			if p.k == "cyl" then
				pp.Shape = Enum.PartType.Cylinder
			elseif p.k == "ball" then
				pp.Shape = Enum.PartType.Ball
			end
			part = pp
		end
		part.Anchored = true
		part.Size = Vector3.new(p.sx, p.sy, p.sz)
		part.CFrame = cframeOf(origin, p)
		part.Material = MATERIALS[p.mat] or Enum.Material.SmoothPlastic
		part.Color = color(p.col)
		part.CanCollide = p.coll
		part.CanTouch = false
		part.CanQuery = p.coll -- the bike's raycasts only need solid things
		part.CastShadow = p.shadow
		part.TopSurface = Enum.SurfaceType.Smooth
		part.BottomSurface = Enum.SurfaceType.Smooth
		if p.transp > 0 then
			part.Transparency = p.transp
		end
		if p.refl > 0 then
			part.Reflectance = p.refl
		end
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
		part.Parent = chunkFor(p.x, p.z)
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
	folder.Parent = parent
	return result
end

return Materializer
