# CHANGES:

## BUGS:
- on mobiles: internal_test=1 is very slow, especially when setting a video as watch later or favorite
- on mobiles, in progress, watch later, favorite labels are at the same position as "new" label.
- on mobiles: "removed from in progress UNDO" should take 1 line if possible. The word "UNDO" should never be broken down in several lines.

## Usability:
- keep the last view of Videos/Shorts persisting accross sessions. And also each channel view should be recorded in PostHog.
- the Add channel search should also look for partial matches in chinese, japanese, korean, ... characters
- moving the mouse around while watching a video in the iframe makes the Youtube iframe buttons appear. I don't like the obstructing pause button in the middle.
- on mobiles, set the max zoom in to twice bigger as the current max
- add more supported languages
- add more suggested languages to learn    
- do not have more than 2 motivational insights in a row. Give more real analytics and data backed insights. (see Codex)
- autopost on THREADS. See Claude conversation

## Ideas
- Give users suggestions of other users tracked channels
- being able to add playlist instead of channels
- have a Discover page, where videos or playlist are suggested and then there is a prompt to add the channel in the feed
- have some kind of notes taking functionality (looking like Keep) (tldraw?)
- Trailer + onboarding: make it "what are you learning?", then one of them would be "learning a language"
- Build Android app
- Next to Heatmap: dashboard, with detailed views, etc. (Plus or premium version)
- let the user choose what to upgrade after a level
- streak unfreeze
- try https://github.com/img2threejs/img2threejs


## Feel and design:
- hover animations of video cards: video duration's animation is not smooth (top right corner of the video card)
- on small viewports and mobile, do not show the outer blue rounded rectangle around the "return to feed" icon. Similar to favorite heart button in watched. The Rectangle should remain on desktop and tablets though.
- revamp filter (All, unwatched, in progress, watch later, favorite) button and videos/shorts button
- revamp the ⋯ popup
- have in progress, watch later, favorite labels the same style/design as "New" but with their own colors and on top of the video card
- dedicated space for shorts? Mixing shorts and videos is not aesthetic
- change domain name to edenia.study (namecheap.com)
- town waveform bars height to be more more representative of the actual pts scored that day. E.g., 20 pts and 40 pts should not have the same bar height.
- on mobiles, the previous insights panel doesn't go all the way to the right edge.


## Plus version:
- heatmap: "You started building this town 3 months ago. Upgrade to Plus to revisit every week and see how your consistency has changed."
- insights:"You studied 4h 20m across 7 sessions this week. See what drove your strongest days with Edenia Plus."

## Dopamine:
- implement badges
- have the progress bar show up on top of the iframe and every Xmin the bar progresses?



Gamification and design:
- https://www.youtube.com/watch?v=LXX_qOA5D8E
- https://www.youtube.com/watch?v=Du2lkZ_cux8
- https://www.youtube.com/watch?v=8mMH6Pq8qnE

icons:
- https://heroicons.com/outline

For later:
- Go through the entire code and flag any potential bugs or incoherence. Do not fix anything, just tell me.
- Go through the entire README.md and update it to reflect the current status of the codebase.
- Go through the different languages and make sure the translations from English are correct

# NOTES:
- How to keep images consistent over time when using AI?
- How to upscale images (pixelbin model from https://www.upscale.media/zh/upload was good but no more credit)

