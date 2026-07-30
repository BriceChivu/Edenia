# CHANGES:
Minor changes:
- small duck walking around/popup giving motivational quotes
- Photoshop: add the duck on the island. sometimes shifting to different locations (like on the deck, in the water floating, or in front of the door of the house)
- Add an addictive sound when clicking on "Level up" and "mark as watched". Add a pleasant sound when scrolling in the waveform. 
- add more supported languages
- add more suggested languages to learn
- in the search bar, remove "saved" in "Search saved videos by title or channel."
- onboarding languages recommended channels: dreaming spanish, linguriosa


Big changes:
- How feasible/complicated this is? Being able to view videos on the website itself (e.g., pop up window when video is clicked). When pausing, the in progress timestamp should be populated automatically in hh:mm:ss format
- Build Android app
- Next to Heatmap: dashboard, with detailed views, etc. (Plus or premium version)
- have a small duck pop up next to Edenia title that says stuff like "You studied 4h 20m across 7 sessions this week. See what drove your strongest days with Edenia Plus." or "You started building this town 3 months ago. Upgrade to Plus to revisit every week and see how your consistency has changed.". It pops up only to say those things and then the user can close the dialogue box.
- continue adding youtube channels to the catalog
- DOPAMINE and motivation: Remove the weekly goal progress bar panel. Instead, have a progress bar at the bottom (sticky like the top panel) that correspond to the gap between the current level to the next level. Each time there is some Video time watched, make the bar progress with a nice animation. The score milestones and the point scoring should be scaled by 10. E.g., watching 1h gives 30 pts.
- Here is a big change. Read carefully and fully grasp the idea.
I want the user to be able to mark a video as watched only when:
- the timestamp of the iframe reached the end OR
- the user clicked the Open in youtube button and the time elapsed between the "continue at" timestamp and the end of the video has been reached
In both cases, there should be a pop up on top of the iframe saying 

Sandbox:

Mobile:
- the buttons of the video cards (e.g., put in progress) should be more elegant and subtle (maybe remove the circle around the logo of the button? Or find another elegant way I don't know)
- there is a subtle visual bug: there is a light blue line in the study history at the top edge of the rectangle of the study summary table


Gamification and design:
- https://www.youtube.com/watch?v=LXX_qOA5D8E
- https://www.youtube.com/watch?v=Du2lkZ_cux8

For later:
- Go through the entire code and flag any potential bugs or incoherence. Do not fix anything, just tell me.
- Go through the entire README.md and update it to reflect the current status of the codebase.
- Go through the different languages and make sure the translations from English are correct

# NOTES:
- How to keep images consistent over time when using AI?
- How to upscale images (pixelbin model from https://www.upscale.media/zh/upload was good but no more credit)







