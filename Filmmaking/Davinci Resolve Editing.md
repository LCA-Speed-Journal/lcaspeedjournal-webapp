## Davinci Resolve Editing
### Data Management
- Editing Drive — Drives with Active Video Projects on
	- Need good amount of storage, and relatively fast speeds
	- Sandisk Extreme Pro SSD — Brandon’s Recommendation
- Carbon Copy Cloner — free 30-day trial, or $40
	- Backup from SSD to an actual hard-drive
- Main Folders  — assets and projects
	- Sub Folders break out into things like camera angle, project files, proxies, and renders
	- Can add more like music, SFX, etc, but keeping them on the root can prevent duplicates
### Starting a Project
(Demo shown on Davinci Resolve Studio 17, so is showing the paid features for some things)
- Project Manager Window — new project or open an existing project
	- New Project or “Untitled Project” both open a new project
- Navigation Tabs/Pages
	- Media — import footage
	- Cut — sift through and select best clips
	- Edit — piece things together, sequence things on the timeline
	- Fusion — adding special FX, motion graphics, titles, etc.
	- Color — grading and correction
	- Fairlight — mastering Audio
	- Deliver — exporting
- Autosave — not set by default, please turn on (preferences > user > save and load > “Live Save”)
- Project Settings — 1080p, 23.976 FPS, Video format also in HD 1080p 23.976
	- Can turn this into a preset by setting them, going to presets, saving, and setting as default
### Basic Navigation — Media Tab
- Can navigate through folders on the right, and drag and drop into the media pool at the bottom of the screen
	- Or, can drag in from default file-explorer
	- Dragging clips can prompt an FPS change, decline this
- Adding Bins or Folders — can then drag things into them
	- Audio, Video, Assets, etc.
- Smart-Bins — bins that auto-organize by parameters
	- e.g files that have file name containing “sample”
	- Can do this on lots of properties, like frame-rate, etc.
- There is an audio section within the media tab as well, can monitor
- There’s an inspector tab as well (color-coding clips, comments, video adjustments, etc.)
- Scene-Cut Detection — can take a finished video and break into clips by cut
	- Great for grabbing things for B-Roll later, something like a show-reel, etc.
### Sifting and Selecting Footage — Cut Tab
Doing a super-simple edit? Can honestly do the majority within the cut-page (yes, even export)
- Double Click a Clip to open it in the focused area of the screen
- Brandon’s keyboard shortcuts
	- J – K – L = “Reverse – Play – FastFWD”
	- I – O = “In-Point – Out-Point” — where you want the clip to start and end
	- , – . = “Place Clip on Nearest Cut to Playhead – Place Clip at End of Timeline”
	- Q – W = “Ripple-Delete Beginning of Clip – Ripple-Delete End of Clip”
	- Numbers (1, 2, etc.) = “Random Colors for Labeling Clips”
### Editing Clips Together — Edit Tab
- Brandon likes putting his music down first — can help with the flow of the edit
> [!NOTE] Slowing Clips — How Much? (on a 23.976 FPS Timeline)
> - 30 FPS — 80%
> - 60 FPS — 40%
> - 120 FPS — 20%

- Zooming In — + Key (- Key to Zoom Out)
- Speed Ramping — Retime Speed
	- Keyframe Ion — locking the properties up to that point
	- Need to use an eye-test to adjust — all by preference
- Ripple Delete — lock the audio layer once it’s dropped in 
	- (prevents it being caught in the ripple)
- Digital Zoom — easy way to add a bit of motion to edits
	- Be gentle with the amount of zoom, a little can go a long way
#### Adding Text, Effects, and Motion Graphics — Fusion Tab
Lots of things that can be done in the Fusion Tab — for most edits, might not need to go there at all
- Master > Right Click > New Fusion Composition
	- Blank Fusion Clip that you can apply effects to
	- Can add fusion components to clips themselves
- Nodes — equivalent to “Layers” in After-Effects or other editing tools
	- Working from Left-to-Right
	- Nodes more right will appear “on top of” nodes more left
- Gray Box on R-Hand Side — connector node to connect in sequence
	- e.g. Connecting Background 1 to Media-Out “places” the background on the final output
### Basic Color Correction and Grading — Color Tab
Davinci is well-known among colorists for its powerful color-grading tools. 
(Can be a lot. It’s an entire industry, after all.)
- L Green Dot — Input Clip
- R Green Dot — Output Clip
- Nodes along the way from L to R — applying adjustments to the clip(s)
Correcting Footage:
- Add Corrector Node
	- Connect the L Green Dot to the L Green Arrow
- Color Wheels — basic adjustments
- Adding LUTs — Gear Icon > Color Management > Lookup Tables
	- Open the LUT Folder, Make sure your desired LUT is on the clipboard
	- After pasting into LUT Folder, exit and click “Update Lists”
- Adjusting LUTs — Key Output, adjust the Gain to change the intensity of the LUT
### Mastering Audio — Fairlight Tab
- If you need to add SFX within Fairlight tab, need to open the Media Pool, and add it there
- Effects Tab — where things like your limiters, compressors, etc. live
### Exporting Your Video — Deliver Tab
---
### Bonus Content
#### Lift, Gamma, Gain vs Shadows, Mids, and Highlights
##### Log Wheels — Shadow, Midtone, and Highlights
Log Wheels are the things that folks are used to seeing in Premiere Pro.
- Narrow focus — only the shadows, only the mids, etc.
- More for Creating a specific Look
##### Primary Wheels — Lift, Gamma, and Gain
Primary Wheels work in a much more gradual way than the Log Wheels do
- Not as harsh a line (shadows to mids, mids to highs) when adjusting things like lift/gain
- Generally more for Color Correcting
#### Color-Correction 101