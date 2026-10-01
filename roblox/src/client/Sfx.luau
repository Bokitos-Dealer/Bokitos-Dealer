--!strict
-- Little sound helper. Sound IDs come from Config.Sounds; empty ones fall
-- back to sounds that ship with Roblox.

local SoundService = game:GetService("SoundService")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local Config = require(Shared.Config)

local Sfx = {}

local FALLBACK: { [string]: string } = {
	Bell = "rbxasset://sounds/electronicpingshort.wav",
	Coin = "rbxasset://sounds/electronicpingshort.wav",
	Landmark = "rbxasset://sounds/electronicpingshort.wav",
	Purchase = "rbxasset://sounds/electronicpingshort.wav",
	Splash = "rbxasset://sounds/impact_water.mp3",
	Click = "rbxasset://sounds/electronicpingshort.wav",
	Bump = "rbxasset://sounds/action_jump_land.mp3",
}

-- pitch for the fallback sounds, so they don't all sound the same
local FALLBACK_PITCH: { [string]: number } = {
	Bell = 1.6,
	Coin = 2.2,
	Landmark = 0.8,
	Purchase = 1.2,
	Click = 3,
}

local function idFor(name: string): (string, number)
	local id = (Config.Sounds :: { [string]: string })[name]
	if id and id ~= "" then
		return id, 1
	end
	return FALLBACK[name] or "", FALLBACK_PITCH[name] or 1
end

--- Play a sound once. With `at` (a part) it is a 3D sound from that part.
function Sfx.play(name: string, at: BasePart?, volume: number?, pitch: number?)
	local id, basePitch = idFor(name)
	if id == "" then
		return
	end
	local s = Instance.new("Sound")
	s.SoundId = id
	s.Volume = volume or 0.6
	s.PlaybackSpeed = basePitch * (pitch or 1)
	if at then
		s.RollOffMaxDistance = 120
		s.Parent = at
		s:Play()
		s.Ended:Once(function()
			s:Destroy()
		end)
		task.delay(6, function()
			s:Destroy()
		end)
	else
		s.Parent = SoundService
		SoundService:PlayLocalSound(s)
		task.delay(6, function()
			s:Destroy()
		end)
	end
end

--- The bell goes "ring-ring". The uploaded bell.wav already rings twice;
--- the built-in fallback ping is played twice instead.
function Sfx.bell(at: BasePart?)
	Sfx.play("Bell", at, 0.7)
	if Config.Sounds.Bell == "" then
		task.delay(0.16, function()
			Sfx.play("Bell", at, 0.6, 1.06)
		end)
	end
end

return Sfx
