--!strict
-- Paris, built from real OpenStreetMap data (see tools/osm_to_luau.py).
-- Map data (c) OpenStreetMap contributors, ODbL.

local Generate = require(script.Parent.Parent.Real.Generate)
local Landmarks = require(script.Parent.Parent.Real.Landmarks)
local Data = require(script.Parent.Parent.CityData.Paris)

local City = {}

City.data = Data

function City.generate()
	return Generate.city(Data, Landmarks.build)
end

function City.lanes()
	return Generate.lanes(Data)
end

return City
