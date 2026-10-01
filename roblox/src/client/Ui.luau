--!strict
-- Small helpers for building a bright, chunky, kid-friendly UI in code.

local TweenService = game:GetService("TweenService")

local Ui = {}

Ui.Font = Enum.Font.FredokaOne
Ui.Colors = {
	panel = Color3.fromRGB(255, 255, 255),
	panelDark = Color3.fromRGB(32, 40, 62),
	ink = Color3.fromRGB(40, 44, 60),
	blue = Color3.fromRGB(48, 120, 255),
	green = Color3.fromRGB(46, 196, 104),
	orange = Color3.fromRGB(255, 150, 30),
	red = Color3.fromRGB(240, 70, 70),
	purple = Color3.fromRGB(150, 90, 230),
	gold = Color3.fromRGB(255, 200, 40),
	grey = Color3.fromRGB(150, 156, 170),
	light = Color3.fromRGB(240, 244, 252),
}

--- Create an instance with properties and children.
function Ui.new(className: string, props: { [string]: any }?, children: { Instance }?): any
	local inst = Instance.new(className) :: any
	local parent = nil
	if props then
		for k, v in props do
			if k == "Parent" then
				parent = v
			else
				inst[k] = v
			end
		end
	end
	if children then
		for _, c in children do
			c.Parent = inst
		end
	end
	if parent then
		inst.Parent = parent
	end
	return inst
end

function Ui.corner(parent: Instance, radius: number?): UICorner
	return Ui.new("UICorner", { CornerRadius = UDim.new(0, radius or 14), Parent = parent })
end

function Ui.stroke(parent: Instance, color: Color3?, thickness: number?): UIStroke
	return Ui.new("UIStroke", {
		Color = color or Color3.fromRGB(20, 24, 40),
		Thickness = thickness or 3,
		ApplyStrokeMode = Enum.ApplyStrokeMode.Border,
		Parent = parent,
	})
end

function Ui.pad(parent: Instance, px: number)
	Ui.new("UIPadding", {
		PaddingLeft = UDim.new(0, px),
		PaddingRight = UDim.new(0, px),
		PaddingTop = UDim.new(0, px),
		PaddingBottom = UDim.new(0, px),
		Parent = parent,
	})
end

--- A text label with the game font and an outline.
function Ui.label(props: { [string]: any }): TextLabel
	local base: { [string]: any } = {
		BackgroundTransparency = 1,
		Font = Ui.Font,
		TextColor3 = Color3.new(1, 1, 1),
		TextScaled = true,
		TextStrokeTransparency = 0.6,
	}
	for k, v in props do
		base[k] = v
	end
	local maxText = base.MaxTextSize or 40
	base.MaxTextSize = nil
	local l = Ui.new("TextLabel", base) :: TextLabel
	if l.TextScaled then
		Ui.new("UITextSizeConstraint", { MaxTextSize = maxText, Parent = l })
	end
	return l
end

--- A big round button that squishes when pressed.
function Ui.button(text: string, color: Color3, props: { [string]: any }?): TextButton
	local base: { [string]: any } = {
		BackgroundColor3 = color,
		Font = Ui.Font,
		Text = text,
		TextColor3 = Color3.new(1, 1, 1),
		TextScaled = true,
		AutoButtonColor = true,
		TextStrokeTransparency = 0.7,
	}
	local extra: { [string]: any } = props or {}
	for k, v in extra do
		base[k] = v
	end
	local maxText = base.MaxTextSize or 30
	base.MaxTextSize = nil
	local b = Ui.new("TextButton", base) :: TextButton
	Ui.corner(b, 14)
	Ui.stroke(b, Color3.fromRGB(20, 24, 40), 2.5)
	Ui.new("UITextSizeConstraint", { MaxTextSize = maxText, Parent = b })
	Ui.new("UIPadding", { PaddingLeft = UDim.new(0, 6), PaddingRight = UDim.new(0, 6), PaddingTop = UDim.new(0, 4), PaddingBottom = UDim.new(0, 4), Parent = b })
	local scale = Ui.new("UIScale", { Parent = b }) :: UIScale
	b.MouseButton1Down:Connect(function()
		TweenService:Create(scale, TweenInfo.new(0.06), { Scale = 0.92 }):Play()
	end)
	local function up()
		TweenService:Create(scale, TweenInfo.new(0.12, Enum.EasingStyle.Back), { Scale = 1 }):Play()
	end
	b.MouseButton1Up:Connect(up)
	b.MouseLeave:Connect(up)
	return b
end

--- Pop an element bigger for a moment (for coins, rewards...).
function Ui.pop(guiObject: GuiObject, amount: number?)
	local scale = guiObject:FindFirstChildOfClass("UIScale") or Ui.new("UIScale", { Parent = guiObject })
	scale.Scale = amount or 1.25
	TweenService:Create(scale, TweenInfo.new(0.35, Enum.EasingStyle.Back), { Scale = 1 }):Play()
end

function Ui.tween(inst: Instance, time: number, props: { [string]: any }, style: Enum.EasingStyle?)
	local t = TweenService:Create(inst, TweenInfo.new(time, style or Enum.EasingStyle.Quad, Enum.EasingDirection.Out), props)
	t:Play()
	return t
end

--- A centred pop-up window with a title and a close button.
--- Returns the window and the frame to put content in.
function Ui.window(parent: Instance, title: string, accent: Color3): (Frame, Frame)
	local win = Ui.new("Frame", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.52),
		Size = UDim2.fromScale(0.94, 0.84),
		BackgroundColor3 = Ui.Colors.light,
		Visible = false,
		Parent = parent,
	}) :: Frame
	Ui.new("UISizeConstraint", { MaxSize = Vector2.new(820, 520), Parent = win })
	Ui.corner(win, 22)
	Ui.stroke(win, accent, 5)
	local head = Ui.new("Frame", { Size = UDim2.new(1, 0, 0, 56), BackgroundColor3 = accent, Parent = win })
	Ui.corner(head, 22)
	-- square off the bottom of the header
	Ui.new("Frame", { Position = UDim2.new(0, 0, 1, -22), Size = UDim2.new(1, 0, 0, 22), BackgroundColor3 = accent, BorderSizePixel = 0, Parent = head })
	Ui.label({ Position = UDim2.fromOffset(18, 6), Size = UDim2.new(1, -90, 0, 44), Text = title, TextXAlignment = Enum.TextXAlignment.Left, MaxTextSize = 34, TextStrokeTransparency = 0.5, ZIndex = 2, Parent = head })
	local close = Ui.button("✕", Ui.Colors.red, { AnchorPoint = Vector2.new(1, 0), Position = UDim2.new(1, -10, 0, 8), Size = UDim2.fromOffset(44, 40), ZIndex = 2, MaxTextSize = 26, Parent = head })
	close.Activated:Connect(function()
		win.Visible = false
	end)
	local content = Ui.new("Frame", { Position = UDim2.fromOffset(12, 64), Size = UDim2.new(1, -24, 1, -74), BackgroundTransparency = 1, Parent = win }) :: Frame
	return win, content
end

--- A scrolling grid for cards.
function Ui.grid(parent: Instance, cell: Vector2): ScrollingFrame
	local sf = Ui.new("ScrollingFrame", {
		Size = UDim2.fromScale(1, 1),
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		ScrollBarThickness = 8,
		ScrollBarImageColor3 = Ui.Colors.grey,
		AutomaticCanvasSize = Enum.AutomaticSize.Y,
		CanvasSize = UDim2.new(),
		ScrollingDirection = Enum.ScrollingDirection.Y,
		Parent = parent,
	}) :: ScrollingFrame
	Ui.new("UIGridLayout", {
		CellSize = UDim2.fromOffset(cell.X, cell.Y),
		CellPadding = UDim2.fromOffset(10, 10),
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		SortOrder = Enum.SortOrder.LayoutOrder,
		Parent = sf,
	})
	Ui.new("UIPadding", { PaddingTop = UDim.new(0, 4), PaddingBottom = UDim.new(0, 8), Parent = sf })
	return sf
end

--- 1234567 -> "1,234,567"
function Ui.commas(n: number): string
	local s = tostring(math.floor(n))
	local out = s
	while true do
		local k
		out, k = string.gsub(out, "^(-?%d+)(%d%d%d)", "%1,%2")
		if k == 0 then
			break
		end
	end
	return out
end

return Ui
