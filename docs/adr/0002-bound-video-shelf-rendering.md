# Bound video shelf rendering while preserving the complete library

- Status: Accepted — proceed to ticket planning; implementation not yet started
- Date: 2026-09-27

The live video feed accumulated 6,695 active cards and approximately 170,000 document elements. Chrome measured a 3.264-second status-filter interaction. The complete video library must remain available without requiring the browser to keep every card rendered.

## Agreed experience

Learners browse continuously through each channel shelf. Additional cards appear automatically as needed, with no Show more button or separate archive. Existing ordering and filters remain meaningful across the complete matching collection.

When study actions, favorites, or new uploads change a shelf, preserve the learner's position using the current video or its nearest remaining neighbor. Preserve ordering rules without jumping back to the beginning.

Edenia search continues to search the complete saved video library and reveal any matching video. Native browser Find is allowed to search only the rendered portion; this limitation is accepted. Keyboard navigation must still cross rendering boundaries.

## Implementation boundary

Use a moving window of rendered cards around the visible portion of each shelf, and defer shelves outside the page viewport. Keep focused cards and active previews available while they own focus or interaction. Release distant cards as browsing proceeds so visiting more history does not permanently grow the document. Preserve scroll geometry and derive counts and arrow availability from the full matching collection.

Search, Continue watching, study-history links, and other targeted navigation must bring the target into the rendered window before focusing or previewing it. Keep playback and progress persistence independent of card removal. Keep collapsed Watched and Removed sections unrendered until expansion or targeted navigation needs them.

Update affected cards and shelves for small changes rather than rebuilding the complete feed. All retained video records, study facts, organization, and recovery behavior remain available.

## Trade-off and validation

A moving window adds focus, scroll-position, and target-reveal complexity. Append-only batches were considered but would grow the document again during long browsing sessions. A separate archive or explicit pagination would change the continuous shelf experience.

Validate with a synthetic library of at least 7,000 videos. Cover initial load, repeated filter changes, extended scrolling in both directions, format switching, off-screen search and Continue watching targets, keyboard traversal, preview ownership, player close, and study-state updates. Verify that rendered card counts remain bounded after extended browsing and measure interaction responsiveness against the original multi-second stall. Target ordinary filter and card interactions below 200 ms on the investigation Mac under comparable, unthrottled conditions; record results rather than inferring performance from passing functional tests.

The YouTube daily quota remains unchanged. The agreed fetching behavior now distinguishes checking for newly published uploads from retrieving older uploads: automatic refresh checks for new uploads, while reaching the end of the saved collection requests older uploads as needed. Already saved records remain available. Rendering saved cards and fetching additional records are separate operations, even though both support continuous shelf browsing. Detailed fetching acceptance criteria belong in the implementation tickets.

Quota-exhaustion explanations remain in the existing activity log. No additional quota-specific banner, toast, dialog, or inline notice is required.
