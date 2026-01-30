## Colorist’s Blueprint
### Nodes
Nodes are the assembly-line working to apply changes from input to output
- **Alt+S — Add Node**
- Correcting an Image in the Clip Node, then use the Timeline Node to change once normalized
- Can Group Shots — select, right click, add new group
	- Opens two new panels — Group Pre-Clip and Post-Clip
		- Affect before clip-level changes, and after
- Key Inputs and Outputs — 
	- Ex. Apply a Mask/Power-Window in Node 1, drag blue Key-Input into Node 2, those changes are then reflected accordingly
- Types of Nodes:
	- Serial Node — basic node, any operations are pushed to subsequent nodes
	- Parallel Node — acts as a blender between multiple operations in parallel
	- Layer Node — as parallel, but instead of blending, stacks
	- Outside Node — a serial node taking key info (power-window), but inverts the selection
### Color Management
#### Key Terms:
- Color-Management — system that translates source image into the truest representation possible, on any particular output device.
	- How we can transform image info from camera (designed to capture large amounts of color-info) into something viewable by destination devices
- Color-Space — Specified range of all possible color and luminance values (examples below)
	- REC.709
	- ARRI LOG C
	- Canon LOG
- Scene-Referred — color space that closely represents the original scene, without display based limitations to color and dynamic range
	- ACES CCT
- Display-Referred — color space with limitations based on the color and luminance values a display is capable of producing 
	- REC.709
#### Clip-Level Project Management
- Group Clips by color space shot on, camera used, etc.
	- Tip to avoid duplicative slections — clips > smart-filters > create “NO-GROUP” smart filter
		- Color-Timeline Properties > Group > is > (blank)
	- Tip to adjust hero-image for each clip — click and drag across the clip to scrub for keyframe
- Figure out three things — three color-spaces
	- What color space was it shot in? (ideally something flat, but depends on camera)
		- CLOG, Canon Cinema Gamut, etc.
	- What color space do we want to work in? (want something broader, capable of showing lots)
		- ARRI Wide Gamut, ACES, DaVinci Wide Gamut, etc.
	- What color space do we want to render in? (typically REC.709 or another linear)
- Color Space Transform (input color space to working color space)
	- (in the group pre-clip node tree)
	- Select the input color space, and the input gamma
	- Select the output color space (ACESAP1), and the output gamma (ACEScct)
- Color Space Transform (working color space to display-referred color space)
	- (in the timeline node tree)
	- Select input color space (ACESAP1), and the input gamma (ACEScct)
	- Select output color space (REC.709), and the output gamma (Gamma 2.4)
	- Tone Mapping — usually DaVinci works just fine, but play around
#### Project-Level Project Management
There’s some extra benefit to using management at the project level.
	Instead of using groups, can group scenes together, and aren’t limited to grading the whole timeline the exact same way.
How to Manage Colors at the Project Level:
- Project Settings > Color Management > Color Space and Transforms
	- Color Science — DaVinci YRGB, DaVinci Color Managed, ACEScc, ACEScct
	- Deselect automatic color management
	- Color Processing Mode — Custom
		- Input Color Space — color space that the footage was shot in
		- Timeline Color Space — what do we want to work in (ACEScct, Davinci Wide Gamut, etc)
		- Output Color Space (REC.709, Gamma 2.4)
- What about the clips not shot on the same color space?
	- Go to specific clip, right click > Input Color Space > (select correct Color Space)
	- Can also do in the media tab, by selecting something like all clips within a folder
- What about clips that don’t have a color space (graphics, etc)
	- right click clip > Bypass Color Management
### Color Correction and Passes
Definition — Color Correction is the phase of the process where we neutralize the image and accounting for color-imbalances from recording
#### Why Take Passes?
- We tend to block out noise once we’re exposed too long — one image too long, might not be receptive to components of a clip in *reference* to clips around it
- Go through one gentle pass, click on and off to see if it’s beneficial, then repeat multiple pass
	- Passes also give more context to the image and what’s around it (can make better decisions)
#### Big Paintbrush and Little Paintbrush
- Step 1 — Evaluate the Image (e.g. does it need exposure correction?)
	- Start Broad, with the “Big Paintbrushes” — offset, 
	- Work Narrower, with “Little Paintbrushes”
- Ideal is to make as few changes as possible — clear node-labeling helps ID when changes occur
#### Order of Operations within the Node Tree
- Primaries — resembles in-camera adjustments (tint, exposure, white-balance)
- Secondaries — more regional
- Windows — bringing attention to specific part of the frame
#### Building a Fixed Node Tree
A Fixed Node-Tree is a general framework of nodes to use for each shot, that you can return to for each project
- Primaries (3 Serial Nodes) — Exposure, Balance, Contrast
- Secondaries (3 Serial Nodes, in Parallel to the Primaries)
- Windows (a few Parallel Nodes) — place *after* the parallel mixer of the primaries/secondaries
How to Save a Power-Grade (a framework of nodes to be used as a “template” for later)
- Right Click in the Gallery > New Powergrade Album
#### Practical Demo — Real-Time Color Correction Session

### Color Grading
(Tool Callout: Look Designer — built in color management, film LUTs, etc. Lots of features)
#### What Makes a Good Color Grade?
Main Goal — Serves the Story
- Invisible, Fits the Genre, Works on Multiple Shots, No Broken Images
How to Serve the Story?
- Should mesh with the video just as much as the music/score does
- Not a one-size-fits-all, everything is individual to the given project
#### Look Development
- Timeline Nodes — Primaries, Look Designer, Output
	- Look Designer
		- Negative Options > Negative Stock Gen 2 > Ektachrome 7207
		- Print Option > Contrast Option > KODAK 2383
		- Print Option > Print Stock > Kodak
	- Primaries
		- Adjustments through contrast can mess with skin-tones
			- Needed to add more red back into the gamma
	- Adding a GRAIN Node
		- Film Grain — 16mm 500T (plus some minor adjustments)
	- Adding a GLOW Node
		- Effects > Glow
		- Shine Threshold Low, Composite Type to Softlight
			- Oversaturated, then dialed back the opacity
- Clip Nodes — EXP, BAL, CON
	- Exposure — 
	- Contrast Tip — Settings > General Options > Disabling S-Curve for Contrast
		- Can be a choice when wanting to draw out components in the shadows
### Shot Matching
Where to Shot-Match?
- Mostly at the Clip-Level — 
- First Question — Does this image need anything?
	- Find a good hero-image > Right-Click > “Grab a Still”
	- Split-Screen to view side by side (make sure dropdown is set to “Selected Still Images”)