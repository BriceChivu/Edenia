# CHANGES:
Minor changes:
- BRICE to think about: rewrite the walkthrough to make it shorter and in correct order
- small duck walking around/popup giving motivational quotes
- Photoshop: add the duck on the island. sometimes shifting to different locations (like on the deck, in the water floating, or in front of the door of the house)
- FIX: when Edenia loads it shows the level 1 picture for some time before switching to the current level.
- separate info from buttons. I want a "How to" section that can be expanded and that reveals info about: how pts are scored, what is Anki and how to connect to it, a typical Edenia workflow



Big changes:
- make the video cards draggable 
- Add a "View filter" button next to the "video status filter" button that allows to display videos to watch by date (from newer to older, all channels mixed together) or by channel (filtered by channel first then within each channel by date, newer to older)
- How feasible/complicated this is? Being able to view videos on the website itself (e.g., pop up window when video is clicked). When pausing, the in progress timestamp should be populated automatically in hh:mm:ss format
- Build Android app

Sandbox:

Mobile:
- the video grid filter buttons should be aligned in the following manner: status (e.g., in progress) and Add video buttons should have the same length, length of {All channels} button should be equal to length of {Undo + spacing + Redo} buttons such that they aligned nicely
- the number of Undo in parentheses should be next to Undo, not bellow
- in the summary study table, the videos watched per day button should be invisible, like the one for the pts. That means, I can click on it but there shouldn't be any visuals indicating that I can click on it 
- Any popup window shouldn't be placed in the center of my mobile's screen and static. They should be below (or above in some cases if it's better) the button clicked and moved alongside the screen when scrolled. Currently, the popup of the video grid buttons are correctly attached to the button, but that's not the case for the summary study table daily pts popup for example. Those need to be fixed
- the buttons of the video cards (e.g., put in progress) should be more elegant and subtle (maybe remove the circle around the logo of the button? Or find another elegant way I don't know)
- there is a subtle visual bug: there is a light blue line in the study history at the top edge of the rectangle of the study summary table
- every time I press a button, I can briefly see the blue rectangle of the actual button. This is not elegant


For later:
- Go through the entire code and flag any potential bugs or incoherence. Do not fix anything, just tell me.
- Go through the entire README.md and update it to reflect the current status of the codebase.
- Go through the different languages and make sure the translations from English are correct

# NOTES:
- How to keep images consistent over time when using AI?
- How to upscale images (pixelbin model from https://www.upscale.media/zh/upload was good but no more credit)








