--!strict
-- Spins wheels and pedals and turns the handlebars of every player's bike.
-- Our own bike uses the physics state; other bikes are animated from how
-- they move. Head lamps switch on at night.

local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Config = require(Shared.Config)
local State = require(script.Parent.State)

local M = Config.M

local Animator = {}

type Rig = {
	root: BasePart,
	rear: Motor6D?,
	front: Motor6D?,
	steerJoint: Motor6D?,
	crank: Motor6D?,
	beam: SpotLight?,
	rearLight: BasePart?,
	wheelR: number, -- metres
	lastPos: Vector3?,
	lastYaw: number,
	speed: number,
	steer: number,
	wheel: number,
	crankA: number,
}

local rigs: { [Model]: Rig } = {}

local function makeRig(m: Model): Rig?
	local root = m.PrimaryPart or m:FindFirstChild("Root") :: BasePart?
	if not root then
		return nil
	end
	local steerPart = m:FindFirstChild("Steer")
	local wheelPart = m:FindFirstChild("Wheel") :: BasePart?
	local lamp = m:FindFirstChild("HeadLamp")
	return {
		root = root,
		rear = root:FindFirstChild("RearWheel") :: Motor6D?,
		crank = root:FindFirstChild("Crank") :: Motor6D?,
		steerJoint = root:FindFirstChild("SteerJoint") :: Motor6D?,
		front = if steerPart then steerPart:FindFirstChild("FrontWheel") :: Motor6D? else nil,
		beam = if lamp then lamp:FindFirstChild("Beam") :: SpotLight? else nil,
		rearLight = m:FindFirstChild("RearLight") :: BasePart?,
		wheelR = if wheelPart then wheelPart.Size.Y / 2 / M else 0.35,
		lastPos = nil,
		lastYaw = 0,
		speed = 0,
		steer = 0,
		wheel = 0,
		crankA = 0,
	}
end

local function yawOf(cf: CFrame): number
	local lv = cf.LookVector
	return math.atan2(-lv.X, -lv.Z)
end

local function update(dt: number)
	local folder = Workspace:FindFirstChild("Bikes")
	if not folder or dt <= 0 then
		return
	end
	local mine = State.ride.model
	local night = State.night
	for _, child in folder:GetChildren() do
		if not child:IsA("Model") then
			continue
		end
		local rig = rigs[child]
		if not rig then
			local made = makeRig(child)
			if not made then
				continue
			end
			rig = made
			rigs[child] = made
		end
		local r = rig :: Rig
		local wheelA, crankA, steer
		if child == mine then
			local ride = State.ride
			wheelA, crankA, steer = ride.wheel, ride.crank, ride.steer
		else
			-- estimate from movement
			local cf = r.root.CFrame
			local p = cf.Position
			local y = yawOf(cf)
			local last = r.lastPos
			if last then
				local delta = p - last
				local flat = Vector3.new(delta.X, 0, delta.Z)
				local sgn = if flat:Dot(cf.LookVector) >= 0 then 1 else -1
				local v = sgn * flat.Magnitude / M / dt
				if v ~= v or math.abs(v) > 40 then
					v = 0
				end
				r.speed += (v - r.speed) * math.min(1, dt * 8)
				local dy = (y - r.lastYaw + math.pi) % (2 * math.pi) - math.pi
				local yawRate = dy / dt
				local target = 0
				if math.abs(r.speed) > 0.8 then
					target = math.clamp(math.atan(-yawRate * 1.1 / r.speed), -0.6, 0.6)
				end
				r.steer += (target - r.steer) * math.min(1, dt * 6)
			end
			r.lastPos = p
			r.lastYaw = y
			r.wheel += r.speed * dt / r.wheelR
			if r.speed > 0.5 then
				r.crankA += r.speed / 4.3 * math.pi * 2 * dt
			end
			wheelA, crankA, steer = r.wheel, r.crankA, r.steer
		end
		if r.rear then
			r.rear.Transform = CFrame.Angles(-wheelA, 0, 0)
		end
		if r.front then
			r.front.Transform = CFrame.Angles(-wheelA, 0, 0)
		end
		if r.crank then
			r.crank.Transform = CFrame.Angles(-crankA, 0, 0)
		end
		if r.steerJoint then
			r.steerJoint.Transform = CFrame.Angles(0, -steer, 0)
		end
		if r.beam and r.beam.Enabled ~= night then
			r.beam.Enabled = night
			if r.rearLight then
				r.rearLight.Material = if night then Enum.Material.Neon else Enum.Material.SmoothPlastic
			end
		end
	end
	for m in rigs do
		if not m.Parent then
			rigs[m] = nil
		end
	end
end

function Animator.init()
	RunService.PreSimulation:Connect(update)
end

return Animator
