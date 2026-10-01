--!strict
-- Game settings. Edit prices, Robux item IDs and cities here.
--
-- ROBUX ITEMS: create each Game Pass / Developer Product on the Roblox
-- Creator Dashboard (create.roblox.com > your experience > Monetization),
-- then paste its ID below. Items with id = 0 show "Coming soon" in the shop.

local Config = {}

Config.GameName = "Bike the World"

-- 1 metre = 3 studs (a Roblox character is about 1.7 m tall)
Config.M = 3

-- Coins you earn by playing
Config.Rewards = {
	PerKilometre = 12, -- riding distance
	CoinPickup = 5, -- spinning coins on the streets
	Landmark = 50, -- first visit of a famous place
	DeliveryBase = 30, -- delivering an order
	DeliveryTimeBonus = 30, -- extra when you are fast
	DailyBonus = 75, -- once per day
}

export type BikeDef = {
	id: string,
	name: string,
	price: number, -- coins (0 = free)
	gamePass: string?, -- key into Config.GamePasses if it is a Robux bike
	topSpeed: number, -- metres per second without boost
	power: number, -- acceleration multiplier
	handling: number, -- steering multiplier
	wheel: number, -- wheel radius in metres
	style: string, -- model style
	color: Color3,
	description: string,
}

Config.Bikes = {
	{ id = "city", name = "Dutch City Bike", price = 0, topSpeed = 7.5, power = 1.0, handling = 1.0, wheel = 0.355, style = "city", color = Color3.fromRGB(25, 25, 28), description = "The classic Dutch 'omafiets'. Comfy and cool." },
	{ id = "bmx", name = "BMX", price = 250, topSpeed = 8.0, power = 1.3, handling = 1.35, wheel = 0.26, style = "bmx", color = Color3.fromRGB(0, 170, 255), description = "Small, quick and super nimble." },
	{ id = "cargo", name = "Cargo Bike", price = 400, topSpeed = 7.0, power = 0.95, handling = 0.8, wheel = 0.3, style = "cargo", color = Color3.fromRGB(60, 110, 70), description = "A Dutch bakfiets with a big box in front." },
	{ id = "racer", name = "Racing Bike", price = 900, topSpeed = 10.5, power = 1.35, handling = 0.95, wheel = 0.34, style = "racer", color = Color3.fromRGB(220, 40, 40), description = "Thin tyres, drop bars, very fast!" },
	{ id = "ebike", name = "E-Bike", price = 1500, topSpeed = 10.0, power = 1.8, handling = 1.0, wheel = 0.35, style = "city", color = Color3.fromRGB(240, 240, 240), description = "An electric motor helps you pedal." },
	{ id = "golden", name = "Golden Bike", price = 0, gamePass = "GoldenBike", topSpeed = 11.0, power = 1.6, handling = 1.25, wheel = 0.35, style = "racer", color = Color3.fromRGB(255, 196, 40), description = "Shiny gold and the fastest bike in town." },
} :: { BikeDef }

export type ColorDef = { id: string, name: string, price: number, color: Color3 }
Config.Colors = {
	{ id = "black", name = "Black", price = 0, color = Color3.fromRGB(25, 25, 28) },
	{ id = "red", name = "Red", price = 0, color = Color3.fromRGB(205, 45, 45) },
	{ id = "blue", name = "Blue", price = 50, color = Color3.fromRGB(40, 100, 220) },
	{ id = "mint", name = "Mint", price = 50, color = Color3.fromRGB(130, 210, 180) },
	{ id = "pink", name = "Pink", price = 50, color = Color3.fromRGB(255, 120, 190) },
	{ id = "orange", name = "Orange", price = 50, color = Color3.fromRGB(255, 140, 30) },
	{ id = "purple", name = "Purple", price = 50, color = Color3.fromRGB(140, 80, 210) },
	{ id = "white", name = "White", price = 50, color = Color3.fromRGB(240, 240, 240) },
} :: { ColorDef }

export type CosmeticDef = { id: string, name: string, price: number, gamePass: string?, description: string }
Config.Cosmetics = {
	{ id = "helmet", name = "Helmet", price = 100, description = "Safety first!" },
	{ id = "flowers", name = "Flower Basket", price = 150, description = "Tulips in your front basket." },
	{ id = "streamers", name = "Streamers", price = 80, description = "Colourful streamers on the handlebars." },
	{ id = "rainbow", name = "Rainbow Trail", price = 0, gamePass = "RainbowTrail", description = "Leave a rainbow behind you." },
	{ id = "puppy", name = "Puppy in Basket", price = 0, gamePass = "Puppy", description = "A happy puppy rides along." },
} :: { CosmeticDef }

export type PassDef = { id: number, name: string, suggestedPrice: number, description: string }

-- Robux: Game Passes (bought once, kept forever)
Config.GamePasses = {
	DoubleCoins = { id = 0, name = "2x Coins", suggestedPrice = 199, description = "Earn double coins from everything." },
	GoldenBike = { id = 0, name = "Golden Bike", suggestedPrice = 149, description = "The fastest bike, in shiny gold." },
	RainbowTrail = { id = 0, name = "Rainbow Trail", suggestedPrice = 99, description = "A rainbow trail behind your bike." },
	Puppy = { id = 0, name = "Puppy in Basket", suggestedPrice = 99, description = "A puppy that rides in your basket." },
} :: { [string]: PassDef }

-- Robux: Developer Products (can be bought many times)
export type ProductDef = { key: string, id: number, coins: number, suggestedPrice: number }
Config.Products = {
	{ key = "Coins100", id = 0, coins = 100, suggestedPrice = 25 },
	{ key = "Coins550", id = 0, coins = 550, suggestedPrice = 99 },
	{ key = "Coins1500", id = 0, coins = 1500, suggestedPrice = 249 },
} :: { ProductDef }

export type CityDef = {
	id: string,
	name: string,
	country: string,
	origin: Vector3,
	color: Color3,
	food: { string },
	rainChance: number,
	module: string,
}

Config.Cities = {
	{ id = "amsterdam", name = "Amsterdam", country = "Netherlands", origin = Vector3.new(9000, 0, 0), color = Color3.fromRGB(230, 60, 40), food = { "stroopwafels", "a cheese wheel", "poffertjes", "bitterballen", "a tulip bouquet" }, rainChance = 0.35, module = "Amsterdam" },
	{ id = "paris", name = "Paris", country = "France", origin = Vector3.new(-9000, 0, 0), color = Color3.fromRGB(40, 80, 200), food = { "croissants", "a baguette", "macarons", "crêpes", "a fresh flower bunch" }, rainChance = 0.1, module = "Paris" },
	{ id = "newyork", name = "New York", country = "USA", origin = Vector3.new(0, 0, 9000), color = Color3.fromRGB(250, 200, 40), food = { "a pizza slice", "bagels", "hot dogs", "a pretzel", "a big cookie" }, rainChance = 0.1, module = "NewYork" },
} :: { CityDef }

Config.HubOrigin = Vector3.new(0, 0, 0)

-- Day/night: one full day takes this many real minutes
Config.DayLengthMinutes = 24

-- Data store name (change the version suffix to wipe all saves)
Config.DataStoreName = "BikeTheWorld_v1"

-- Optional sound IDs (upload the WAV files from the roblox/assets folder,
-- or pick free sounds in the Creator Store, then paste "rbxassetid://123").
Config.Sounds = {
	Bell = "",
	Coin = "",
	Landmark = "",
	Purchase = "",
	Splash = "rbxasset://sounds/impact_water.mp3",
}

return Config
