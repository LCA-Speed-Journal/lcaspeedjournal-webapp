 ## Audio Mastery
### Why Master Audio
(Ref: thataudioguy.co)
- Don’t “Just Fix it in Post”
- It’s about Training the Ear
#### Understanding Acoustics
Environment Matters. 
- High vs Low Frequencies
	- Thinner Panels targets High-End (s-noises, etc.)
- Anything you can do with Rugs, Carpets, Couches, Blankets — work to absorb sound
	- Density is the Key
- When Choosing a Location to Film — Consider the Sound too!
### Acoustically Treating a Room on a Budget
### Settings — 44100HZ vs 48kHZ, 24-Bit vs 32-Bit
#### Sample Rate
441 — Music-Production
48k — Most filming, etc.
- Sample rate is how fast the audio is being captured on the device
- General idea — set all devices to the same sample-rate (48k, most likely)
#### Bit-Rate
- The problem with 32-Float
	- when assuming with “infinite headroom”, can make you lazy — Ignoring mic-placement, etc.
	- Mismatch in Post — conversion issues (takes 24 at face-value) before you even edit it
- When to use it — when you can’t monitor the audio
- For things like dialogue, if you’re monitoring levels, stick to 24
- When you can’t monitor, use 32, but don’t get lazy — know what you’re getting into
### Lav Mics — Placement and Setup
- SD cards can’t go above 32GB within the audio-recorder
	- Generally will get you at least a day or two, sometimes 3-4 days
- Mic-Gain — Low or Medium-Low
	- Depends on the subject
- Low-Cut — always default to on
- Limiter — default for on, because you never now if people are going to yell
- Auto-Level — default to off, as it tries to compensate and can lead to higher floor
- Sample-Rate — default to 48k
- File-Type — Mono if you’re doing a single, can group together if multi-mic
- Dual-Record — On at -12DB
- Placement — clip to inside or outside, but if inside, can expect rustling
	- Can clip right below the mouth — yes, in frame, but closer to mough
		- When you have poeple with deeper skulls, on collar can muffle
	- Center of Chest tends to be a good middle-ground
	- When using tape, tape to the noisiest clothes
	- Want to hide the wire, but still have clean audio
### Boom Mics — Placement and Setup
### Storytelling with Audio
How to setup a Studio Mic
- Do you want it to sound like voiceover, or on set? Adjusts placement, environment to record
- Audio should follow the camera, how the scene is being shot
### Headphones vs Speakers for Mixing
The Case for Headphones
- Can’t afford studio speakers, can’t afford acoustic treatment
- Want things with a Flat Output — Senheiser, Shure
- Problem w Consumer Headphones — not Flat
	- ex. Beats — inflating the low-end
	- Audio-Technica called out as popular, but not as flat as could be desired
Tips
- Reference other mixes — what sounds good in a similar genre can be emulated
Speaker Tips
- Even an okay pair of speakers, when placed properly, can be solid
- Tweeters at ear-level
- Equilateral Triangle — L Speakers, R Speakers, Listener
### What Mic to Buy/Use?
### Post-Production
#### Parker’s OG Audio-Workflow
- Soft Compression
	- Threshold — telling you when to start bringing in the compression
- Parametric Equalizer
	- Vocal Enhancer — High-Pass Filter
- Denoiser
#### Denoising Audio
Denoising lowers your peaks, raises the valleys — compresses the waveform
- If there’s a noise-floor, it brings it closer to the signal
- Denoiser should come first, before compression — get rid of noise-floor beforehand
	- Starting between 3-6db reduction
- Ideally, less denoising is better
#### Applying an EQ
- Step 1 — Low-Cut (High-Pass Filter)
	- Human Voice — males can get down to 80, but general place tends to be 90-100
- Step 2 — EQ Hunting
	- Take a Bell-Curve, sweep the spectrum, and listen for “things bothering”
	- 200-300Hz — Chunky/Muddy Range, can be interpreted as “stuffy”
	- Adjusting Highs — aiming for more of a shelf than a bell, tends to be more gentle
		- Bright Vocals can get annoying with longer-format content, just be aware
		- Short-Form Content can benefit from a slight boost in the highs
	- So long as it sounds clear and intelligible, audience will be forgiving
	- Phones sound brighter than standard speakers
- Sidebar — Applying an EQ to a Lav-Mic
	- Can come across stuffy (mids)
	- Cut before Boosting
	- On a cheaper lav, high-end is going to be “your enemy” and expose the cheapness
	- Struggling to feel alive? If you’re trying to use a lav-only, can run into problems
#### Applying Compression
- Recording Levels are different than Mixing Levels, are different than Delivery Levels
- Need to either Level or Bring More Forward
	- Makeup Gain is to match
	- Ratio — 2 to 4
	- Aim for peaks being at most -6db
	- Threshold — relative to how loud you recorded 
		- Choking too much can cause distortion
- Do not have to use a Compressor — again, when you need to level or bring more forward
#### Finalizing Audio (Loudness)
- Insert Hard-Limiter on the **Master Track**
	- Max Amplitude — threshold at which nothing gets past
- Open youlean-loudness meter (free on youlean.co)
	- Note — Youtube normalizes to -14 LUFS (Integrated Loudness)
	- General Tip — aim for that –14 for most content platforms (TV is special)
- The Goal is to get Youtube to do nothing
	- Only look at final delivery volume after you’ve done mixing for each track individually
- The Ultimate Tip — use your ears, don’t just go by measurements
- Nothing wrong with tweaking settings after applying a limiter — tweak de-noise, etc.
#### Export Settings
- AAC Format
	- If Exporting Just Audio — Waveform is a good format
- Sample Rate — 48k
- Bit-Rate — always go for highest rate possible (not going to increase file-size dramatically)
#### 10 Tips to Improve you Audio
- 1) Choose a Location Wisely
	- limited background noise, limited reverb, hardwood floors
	- If only spot, find things to dampen/muffle, like couches, blankets, foam, etc.
- 2) Get the mic as close to the subject as possible
	- 6-14” is the ideal — not always feasible, but a good “ideal-state”
- 3) Lav-Mic Placement — depending on jaw-shape, can do collar
- 4) Get Creative with Mic-Placement
- 5) Test Recording-Levels before you Start Filming
	- Make sure you’re not clipping, and not too low
	- Aiming for between -18 and -12db for general recording, leaves enough wiggle-room
- 6) Windscreen or “Dead Cat” — use, helps a lot when it comes to plosives, etc.
- 7) Do a Sync-Clap before Each Take — helping match external audio with in-camera audio
	- Plural Eyes — third-party software, syncs numerous tracks at once
- 8) Record with Two Mics at the same time
- 9) Ue Editing Tools to help with Audio Cleanup
	- Parametric EQ and Compression (compression helps reduce high-db and raise low-db)
- 10) Listen to Audio through different speakers and headphones
	- Speaker quality can adjust how the mix sounds, so test in numerous scenarios