--!strict
-- Builds bike models out of parts. Used for player bikes (server) and the
-- cyclists in the city (client). Forward is -Z (like any Roblox model).
--
-- Joints the client animates every frame:
--   Root.SteerJoint (Motor6D)   -> rotate about Y to steer
--   Steer.FrontWheel (Motor6D)  -> rotate about X to roll
--   Root.RearWheel (Motor6D)    -> rotate about X to roll
--   Root.Crank (Motor6D)        -> rotate about X to pedal

local CollectionService = game:GetService("CollectionService")

local BikeModel = {}

local M = 3
BikeModel.RootHeight = 1.5 -- studs between the ground and the Root part's centre

export type Look = {
	style: string, -- "city" | "bmx" | "cargo" | "racer"
	color: Color3,
	wheel: number, -- metres
	cosmetics: { [string]: boolean }?,
	gold: boolean?,
}

local CHROME = Color3.fromRGB(185, 188, 192)
local BLACK = Color3.fromRGB(20, 20, 22)
local BROWN = Color3.fromRGB(74, 50, 33)

local function newPart(parent: Instance, size: Vector3, cf: CFrame, color: Color3, material: Enum.Material, shape: Enum.PartType?): Part
	local p = Instance.new("Part")
	p.Size = size
	p.CFrame = cf
	p.Color = color
	p.Material = material
	if shape then
		p.Shape = shape
	end
	p.Anchored = false
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.Massless = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Parent = parent
	return p
end

local function weld(a: BasePart, b: BasePart)
	local w = Instance.new("WeldConstraint")
	w.Part0 = a
	w.Part1 = b
	w.Parent = b
end

--- A round rod between two points (bike-local), welded to `to`.
local function rod(parent: Instance, origin: CFrame, a: Vector3, b: Vector3, thick: number, color: Color3, to: BasePart, mat: Enum.Material?): Part?
	local len = (b - a).Magnitude
	if len < 0.01 then
		return nil
	end
	local mid = (a + b) / 2
	local cf = origin * CFrame.lookAt(mid, b) * CFrame.Angles(0, math.pi / 2, 0)
	-- cylinders run along X; lookAt points -Z at b, so turn 90 degrees
	local p = newPart(parent, Vector3.new(len, thick, thick), cf, color, mat or Enum.Material.Metal, Enum.PartType.Cylinder)
	weld(to, p)
	return p
end

local function box(parent: Instance, origin: CFrame, center: Vector3, size: Vector3, color: Color3, to: BasePart, mat: Enum.Material?, rot: CFrame?): Part
	local p = newPart(parent, size, origin * CFrame.new(center) * (rot or CFrame.identity), color, mat or Enum.Material.SmoothPlastic)
	weld(to, p)
	return p
end

local function motor(name: string, p0: BasePart, p1: BasePart, c0: CFrame): Motor6D
	local m = Instance.new("Motor6D")
	m.Name = name
	m.Part0 = p0
	m.Part1 = p1
	m.C0 = c0
	m.C1 = CFrame.identity
	m.Parent = p0
	return m
end

local function wheel(parent: Instance, origin: CFrame, axle: Vector3, r: number, gold: boolean): Part
	local tire = newPart(parent, Vector3.new(0.32, r * 2, r * 2), origin * CFrame.new(axle), BLACK, Enum.Material.Rubber, Enum.PartType.Cylinder)
	local rim = newPart(parent, Vector3.new(0.36, r * 1.62, r * 1.62), origin * CFrame.new(axle), if gold then Color3.fromRGB(255, 200, 60) else CHROME, Enum.Material.Metal, Enum.PartType.Cylinder)
	rim.Transparency = 0.15
	weld(tire, rim)
	-- two "spokes" so you can see the wheel turn
	for k = 0, 1 do
		local s = newPart(parent, Vector3.new(0.1, r * 1.55, 0.12), origin * CFrame.new(axle) * CFrame.Angles(k * math.pi / 2, 0, 0), CHROME, Enum.Material.Metal)
		weld(tire, s)
	end
	local hub = newPart(parent, Vector3.new(0.5, 0.4, 0.4), origin * CFrame.new(axle), CHROME, Enum.Material.Metal, Enum.PartType.Cylinder)
	weld(tire, hub)
	tire.Name = "Wheel"
	return tire
end

--- Build a bike model at `origin` (a CFrame on the ground, facing -Z).
function BikeModel.build(look: Look, origin: CFrame, parentTo: Instance?): Model
	local model = Instance.new("Model")
	model.Name = "Bike"
	local style = look.style
	local gold = look.gold == true
	local col = look.color
	local mat = if gold then Enum.Material.Foil else Enum.Material.SmoothPlastic
	local cos: { [string]: boolean } = look.cosmetics or {}
	local r = look.wheel * M
	local wb = (if style == "cargo" then 2.0 elseif style == "bmx" then 1.0 else 1.12) * M
	local rearAxle = Vector3.new(0, r, wb / 2)
	local frontAxle = Vector3.new(0, r, -wb / 2)
	local bb = Vector3.new(0, 0.29 * M, (if style == "cargo" then 0.45 else 0.03) * M)
	local headTop = Vector3.new(0, (if style == "bmx" then 0.8 else 0.98) * M, frontAxle.Z + 0.16 * M)
	local headBottom = Vector3.new(0, (if style == "bmx" then 0.55 else 0.72) * M, frontAxle.Z + 0.09 * M)
	local saddle = Vector3.new(0, (if style == "bmx" then 0.82 elseif style == "racer" then 1.03 else 1.0) * M, bb.Z + 0.19 * M)
	if style == "cargo" then
		headTop = Vector3.new(0, 0.98 * M, bb.Z - 0.42 * M)
		headBottom = Vector3.new(0, 0.72 * M, bb.Z - 0.48 * M)
	end

	-- root (invisible, carries the mass and the constraints)
	local root = newPart(model, Vector3.new(1, 1, 1), origin * CFrame.new(0, BikeModel.RootHeight, 0), BLACK, Enum.Material.SmoothPlastic)
	root.Name = "Root"
	root.Transparency = 1
	root.Massless = false
	model.PrimaryPart = root

	-- frame
	if style == "city" or style == "cargo" then
		rod(model, origin, headTop - Vector3.new(0, 0.05 * M, 0), Vector3.new(0, 0.42 * M, bb.Z - 0.12 * M), 0.22, col, root, mat)
		rod(model, origin, Vector3.new(0, 0.42 * M, bb.Z - 0.12 * M), bb, 0.22, col, root, mat)
		rod(model, origin, headBottom, Vector3.new(0, 0.36 * M, bb.Z - 0.1 * M), 0.2, col, root, mat)
	else
		rod(model, origin, headTop, saddle - Vector3.new(0, 0.12 * M, 0.02 * M), 0.2, col, root, mat)
		rod(model, origin, headBottom, bb, 0.24, col, root, mat)
	end
	rod(model, origin, bb, saddle - Vector3.new(0, 0.1 * M, 0), 0.2, col, root, mat)
	rod(model, origin, bb, rearAxle, 0.14, col, root, mat)
	rod(model, origin, saddle - Vector3.new(0, 0.15 * M, 0), rearAxle, 0.12, col, root, mat)
	rod(model, origin, headBottom, headTop, 0.26, col, root, mat)
	if style == "city" or style == "cargo" then
		-- closed chain case and rear rack
		local mid = (bb + rearAxle) / 2 + Vector3.new(0.22, 0, 0)
		local len = (rearAxle - bb).Magnitude
		box(model, origin, mid, Vector3.new(0.15, 0.48, len), BLACK, root, Enum.Material.SmoothPlastic, CFrame.Angles(math.atan2(rearAxle.Y - bb.Y, rearAxle.Z - bb.Z) * -1 + 0, 0, 0))
		box(model, origin, Vector3.new(0, 0.78 * M, rearAxle.Z - 0.05 * M), Vector3.new(0.45, 0.08, 1.5), BLACK, root, Enum.Material.Metal)
		-- mudguards
		box(model, origin, rearAxle + Vector3.new(0, r + 0.12, 0), Vector3.new(0.3, 0.08, 1.8), col, root, mat)
	end
	-- saddle (a real Seat so the avatar can sit on it)
	local seat = Instance.new("Seat")
	seat.Name = "Saddle"
	seat.Size = Vector3.new(0.9, 0.3, 1.2)
	seat.CFrame = origin * CFrame.new(saddle)
	seat.Color = if style == "racer" then BLACK else BROWN
	seat.Material = Enum.Material.Leather
	seat.CanCollide = false
	seat.CanTouch = false
	seat.CanQuery = false
	seat.Massless = true
	seat.TopSurface = Enum.SurfaceType.Smooth
	seat.Parent = model
	weld(root, seat)
	-- rear wheel and light
	local rw = wheel(model, origin, rearAxle, r, gold)
	motor("RearWheel", root, rw, CFrame.new(rearAxle - Vector3.new(0, BikeModel.RootHeight, 0)))
	local rearLight = box(model, origin, Vector3.new(0, 0.8 * M, rearAxle.Z + 0.6), Vector3.new(0.3, 0.2, 0.15), Color3.fromRGB(170, 20, 25), root, Enum.Material.SmoothPlastic)
	rearLight.Name = "RearLight"

	-- cranks and pedals
	local crank = newPart(model, Vector3.new(0.2, 0.4, 0.4), origin * CFrame.new(bb), CHROME, Enum.Material.Metal, Enum.PartType.Cylinder)
	crank.Name = "CrankHub"
	motor("Crank", root, crank, CFrame.new(bb - Vector3.new(0, BikeModel.RootHeight, 0)))
	for _, side in { -1, 1 } do
		local arm = newPart(model, Vector3.new(0.12, 0.17 * M, 0.18), origin * CFrame.new(bb + Vector3.new(side * 0.35, -side * 0.085 * M, 0)), BLACK, Enum.Material.Metal)
		weld(crank, arm)
		local pedal = newPart(model, Vector3.new(0.45, 0.1, 0.3), origin * CFrame.new(bb + Vector3.new(side * 0.55, -side * 0.17 * M, 0)), BLACK, Enum.Material.Rubber)
		weld(crank, pedal)
	end

	-- steering assembly: rotates about the head tube
	local axis = (headTop - headBottom).Unit
	-- local Y follows the head tube, local X points sideways
	local steerCF = CFrame.fromMatrix(headBottom, axis:Cross(Vector3.new(0, 0, 1)).Unit, axis)
	local steer = newPart(model, Vector3.new(0.3, 0.3, 0.3), origin * steerCF, BLACK, Enum.Material.SmoothPlastic)
	steer.Name = "Steer"
	steer.Transparency = 1
	motor("SteerJoint", root, steer, CFrame.new(-Vector3.new(0, BikeModel.RootHeight, 0)) * steerCF)
	-- fork
	for _, side in { -0.22, 0.22 } do
		rod(model, origin, headBottom + Vector3.new(side * 0.6, 0, 0), frontAxle + Vector3.new(side, 0, 0), 0.12, col, steer, mat)
	end
	-- handlebar
	local gripY = (if style == "racer" then 0.98 elseif style == "bmx" then 0.95 else 1.07) * M
	local gripZ = headTop.Z + (if style == "racer" then -0.08 elseif style == "bmx" then 0.02 else 0.22) * M
	local stem = headTop + Vector3.new(0, 0.07 * M, -0.03 * M)
	rod(model, origin, headTop, stem, 0.16, CHROME, steer)
	local half = (if style == "bmx" then 0.34 else 0.28) * M
	rod(model, origin, stem, Vector3.new(-half, gripY, gripZ), 0.13, CHROME, steer)
	rod(model, origin, stem, Vector3.new(half, gripY, gripZ), 0.13, CHROME, steer)
	for _, side in { -1, 1 } do
		local g = rod(model, origin, Vector3.new(side * half, gripY, gripZ), Vector3.new(side * (half + 0.45), gripY, gripZ + 0.15), 0.2, BLACK, steer, Enum.Material.Rubber)
		if g then
			g.Name = if side < 0 then "GripL" else "GripR"
		end
		if cos.streamers then
			for k = 0, 2 do
				local cols = { Color3.fromRGB(255, 80, 120), Color3.fromRGB(255, 220, 60), Color3.fromRGB(80, 200, 255) }
				box(model, origin, Vector3.new(side * (half + 0.6), gripY - 0.45, gripZ + 0.2 + k * 0.08), Vector3.new(0.06, 0.9, 0.06), cols[k + 1], steer, Enum.Material.Neon)
			end
		end
	end
	-- bell
	local bell = newPart(model, Vector3.new(0.25, 0.3, 0.3), origin * CFrame.new(-half + 0.35, gripY + 0.15, gripZ - 0.25), CHROME, Enum.Material.Metal, Enum.PartType.Cylinder)
	bell.Name = "Bell"
	weld(steer, bell)
	-- head light (SpotLight switched on at night by the client)
	local lamp = box(model, origin, Vector3.new(0, headBottom.Y - 0.2, frontAxle.Z - 0.15 + 0.3), Vector3.new(0.3, 0.3, 0.3), BLACK, steer, Enum.Material.SmoothPlastic)
	lamp.Name = "HeadLamp"
	local spot = Instance.new("SpotLight")
	spot.Name = "Beam"
	spot.Range = 40
	spot.Angle = 50
	spot.Brightness = 2.5
	spot.Face = Enum.NormalId.Front
	spot.Enabled = false
	spot.Parent = lamp
	-- front wheel
	local fw = wheel(model, origin, frontAxle, r, gold)
	local fwOffset = steerCF:Inverse() * CFrame.new(frontAxle)
	motor("FrontWheel", steer, fw, CFrame.new(fwOffset.Position))
	if style == "city" then
		box(model, origin, frontAxle + Vector3.new(0, r + 0.12, 0), Vector3.new(0.3, 0.08, 1.6), col, steer, mat)
	end

	-- front crate / cargo box
	local crateTop: Vector3? = nil
	if style == "city" then
		local c = Vector3.new(0, 0.88 * M, frontAxle.Z - 0.12 * M)
		local W, D, H = 0.42 * M, 0.34 * M, 0.26 * M
		local wood = Color3.fromRGB(138, 90, 51)
		box(model, origin, c, Vector3.new(W, 0.1, D), wood, steer, Enum.Material.WoodPlanks)
		box(model, origin, c + Vector3.new(0, H / 2, -D / 2), Vector3.new(W, H, 0.1), wood, steer, Enum.Material.WoodPlanks)
		box(model, origin, c + Vector3.new(0, H / 2, D / 2), Vector3.new(W, H, 0.1), wood, steer, Enum.Material.WoodPlanks)
		box(model, origin, c + Vector3.new(-W / 2, H / 2, 0), Vector3.new(0.1, H, D), wood, steer, Enum.Material.WoodPlanks)
		box(model, origin, c + Vector3.new(W / 2, H / 2, 0), Vector3.new(0.1, H, D), wood, steer, Enum.Material.WoodPlanks)
		crateTop = c
	elseif style == "cargo" then
		local c = Vector3.new(0, 0.62 * M, (bb.Z - 0.48 * M + frontAxle.Z) / 2 - 0.1 * M)
		local W, D, H = 0.7 * M, 0.85 * M, 0.45 * M
		box(model, origin, c, Vector3.new(W, H, D), col, root, Enum.Material.WoodPlanks)
		box(model, origin, c + Vector3.new(0, H / 2 + 0.05, 0), Vector3.new(W - 0.3, 0.1, D - 0.3), Color3.fromRGB(60, 45, 35), root, Enum.Material.Fabric)
		crateTop = c + Vector3.new(0, H / 2, 0)
	end
	if crateTop and cos.flowers then
		local cols = { Color3.fromRGB(226, 61, 61), Color3.fromRGB(242, 194, 48), Color3.fromRGB(240, 122, 176), Color3.fromRGB(255, 255, 255) }
		for k = 0, 5 do
			local off = Vector3.new(((k % 3) - 1) * 0.35, 0.65, (math.floor(k / 3) - 0.5) * 0.4)
			local f = newPart(model, Vector3.new(0.35, 0.35, 0.35), origin * CFrame.new(crateTop + off), cols[(k % 4) + 1], Enum.Material.SmoothPlastic, Enum.PartType.Ball)
			weld(if style == "cargo" then root else steer, f)
		end
	end
	if cos.puppy then
		local at = crateTop or Vector3.new(0, 0.85 * M, rearAxle.Z)
		local fur = Color3.fromRGB(205, 160, 105)
		local holder = if crateTop and style == "city" then steer else root
		box(model, origin, at + Vector3.new(0, 0.55, 0.1), Vector3.new(0.6, 0.6, 0.9), fur, holder, Enum.Material.Fabric)
		box(model, origin, at + Vector3.new(0, 1.05, -0.35), Vector3.new(0.55, 0.5, 0.55), fur, holder, Enum.Material.Fabric)
		box(model, origin, at + Vector3.new(0, 0.95, -0.7), Vector3.new(0.25, 0.2, 0.2), BLACK, holder, Enum.Material.SmoothPlastic)
		for _, s in { -1, 1 } do
			box(model, origin, at + Vector3.new(s * 0.3, 1.25, -0.3), Vector3.new(0.12, 0.35, 0.25), Color3.fromRGB(150, 105, 60), holder, Enum.Material.Fabric)
		end
		box(model, origin, at + Vector3.new(0, 0.85, 0.6), Vector3.new(0.12, 0.12, 0.45), fur, holder, Enum.Material.Fabric)
	end
	if cos.rainbow then
		local a0 = Instance.new("Attachment")
		a0.Position = Vector3.new(0, rearAxle.Y + 0.4 - BikeModel.RootHeight, rearAxle.Z)
		a0.Parent = root
		local a1 = Instance.new("Attachment")
		a1.Position = Vector3.new(0, rearAxle.Y + 1.6 - BikeModel.RootHeight, rearAxle.Z)
		a1.Parent = root
		local trail = Instance.new("Trail")
		trail.Attachment0 = a0
		trail.Attachment1 = a1
		trail.Lifetime = 0.9
		trail.LightEmission = 0.6
		trail.Color = ColorSequence.new({
			ColorSequenceKeypoint.new(0, Color3.fromRGB(255, 60, 60)),
			ColorSequenceKeypoint.new(0.2, Color3.fromRGB(255, 160, 40)),
			ColorSequenceKeypoint.new(0.4, Color3.fromRGB(255, 240, 60)),
			ColorSequenceKeypoint.new(0.6, Color3.fromRGB(60, 220, 90)),
			ColorSequenceKeypoint.new(0.8, Color3.fromRGB(60, 140, 255)),
			ColorSequenceKeypoint.new(1, Color3.fromRGB(170, 80, 255)),
		})
		trail.Transparency = NumberSequence.new(0.2, 1)
		trail.Parent = root
	end
	CollectionService:AddTag(model, "Bike")
	model:SetAttribute("Style", style)
	if parentTo then
		model.Parent = parentTo
	end
	return model
end

--- Pedal position (bike-local, studs, relative to the ground origin) for a
--- crank angle; side = -1 left, 1 right.
function BikeModel.pedalOffset(style: string, crank: number, side: number): Vector3
	local bbZ = (if style == "cargo" then 0.45 else 0.03) * M
	local a = crank + (if side > 0 then 0 else math.pi)
	return Vector3.new(side * 0.55, 0.29 * M - math.cos(a) * 0.17 * M, bbZ + math.sin(a) * 0.17 * M)
end

return BikeModel
