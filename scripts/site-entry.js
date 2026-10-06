import { deriveTinySwordsExperience } from '../src/core/runtime-environment.js'

// Select before parsing either page: ordinary visits never discover game or
// trailer asset URLs. Keep the address, query and fragment exactly as supplied.
// The parser-blocking entry keeps the selected app on the original document's
// load lifecycle. No intermediate navigation or asynchronous document reset.
document.write(deriveTinySwordsExperience(window.location)
  ? __EDENIA_TESTER_HTML__ : __EDENIA_PRODUCTION_HTML__)
