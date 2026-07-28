export const LEARNER_LANGUAGE_OPTIONS = [
  { id: 'mandarin', label: 'Mandarin Chinese', shortLabel: 'Mandarin', icon: '中' },
  { id: 'japanese', label: 'Japanese', shortLabel: 'Japanese', icon: '日' },
  { id: 'korean', label: 'Korean', shortLabel: 'Korean', icon: '한' },
  { id: 'spanish', label: 'Spanish', shortLabel: 'Spanish', icon: 'ES' },
  { id: 'french', label: 'French', shortLabel: 'French', icon: 'FR' },
  { id: 'german', label: 'German', shortLabel: 'German', icon: 'DE' },
  { id: 'english', label: 'English', shortLabel: 'English', icon: 'EN' },
  { id: 'other', label: 'Other', shortLabel: 'Other', icon: '···' }
]

export const LEARNER_LEVEL_OPTIONS = [
  { id: 'starting', label: 'Just starting', detail: 'I understand very little so far.' },
  { id: 'beginner', label: 'Beginner', detail: 'I know basic words and sentences.' },
  { id: 'intermediate', label: 'Intermediate', detail: 'I can follow learner content and some native material.' },
  { id: 'advanced', label: 'Advanced', detail: 'I mostly learn through native content.' },
  { id: 'not-sure', label: 'Not sure', detail: 'Give me a balanced starter mix.' }
]

export const ONBOARDING_CHANNEL_STYLE_KEYS = {
  'Casual conversations': 'onboarding.channelStyle.casualConversations',
  'Clear explanations': 'onboarding.channelStyle.clearExplanations',
  'Comprehensible input': 'onboarding.channelStyle.comprehensibleInput',
  'Conversations and interviews': 'onboarding.channelStyle.conversationsInterviews',
  'Conversations and stories': 'onboarding.channelStyle.conversationsStories',
  'Detailed lessons': 'onboarding.channelStyle.detailedLessons',
  'Film and technology': 'onboarding.channelStyle.filmTechnology',
  'Lessons and conversations': 'onboarding.channelStyle.lessonsConversations',
  'Native entertainment': 'onboarding.channelStyle.nativeEntertainment',
  'Natural Mandarin': 'onboarding.channelStyle.naturalMandarin',
  'News and commentary': 'onboarding.channelStyle.newsCommentary',
  Podcast: 'onboarding.channelStyle.podcast',
  'Psychology and conversations': 'onboarding.channelStyle.psychologyConversations',
  'Street interviews': 'onboarding.channelStyle.streetInterviews',
  'Structured lessons': 'onboarding.channelStyle.structuredLessons'
}
