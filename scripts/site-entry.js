import { deriveTinySwordsExperience } from '../src/core/runtime-environment.js'

// Select before parsing either page. Public availability is compiled into this
// versioned entry; engine availability remains a separate runtime control.
// The parser-blocking entry keeps the selected app on the original document's
// load lifecycle. No intermediate navigation or asynchronous document reset.
document.write(deriveTinySwordsExperience(window.location, __EDENIA_TINY_SWORDS_PUBLIC_ENABLED__)
  ? __EDENIA_TESTER_HTML__ : __EDENIA_PRODUCTION_HTML__)
