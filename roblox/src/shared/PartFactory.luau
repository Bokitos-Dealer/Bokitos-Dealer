--!strict
-- Turns one build-list primitive into a Roblox part. Used by the server
-- (whole cities) and by the client (facade details near the player).

local Build = require(script.Parent.Build)

local PartFactory = {}

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
PartFactory.MATERIALS = MATERIALS

function PartFactory.color(hex: number): Color3
	return Color3.fromRGB(bit32.extract(hex, 16, 8), bit32.extract(hex, 8, 8), bit32.extract(hex, 0, 8))
end

function PartFactory.cframe(origin: Vector3, p: Build.Prim): CFrame
	return CFrame.new(origin.X + p.x, origin.Y + p.y, origin.Z + p.z)
		* CFrame.Angles(0, p.yaw, 0)
		* CFrame.Angles(p.pitch, 0, 0)
		* CFrame.Angles(0, 0, p.roll)
end

--- A new anchored part for `p` (not parented). Tags and lights are left to
--- the caller.
function PartFactory.make(p: Build.Prim, origin: Vector3): BasePart
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
	part.CFrame = PartFactory.cframe(origin, p)
	part.Material = MATERIALS[p.mat] or Enum.Material.SmoothPlastic
	part.Color = PartFactory.color(p.col)
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
	return part
end

return PartFactory
