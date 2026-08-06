const BASE_CURATED_CHANNEL_CATALOG = [
  {
    id: 'mandarin-grace',
    language: 'mandarin',
    input: '@GraceMandarinChinese',
    name: 'Grace Mandarin Chinese',
    levels: ['starting'],
    style: 'Clear explanations',
    description: 'Practical pronunciation, vocabulary, and culture lessons.'
  },
  {
    id: 'mandarin-espresso-chinese',
    language: 'mandarin',
    input: '@espressochinese',
    name: 'Espresso Chinese - John Wang',
    levels: ['starting'],
    style: 'Clear explanations'
  },
  {
    id: 'mandarin-everyday-chinese',
    language: 'mandarin',
    input: '@EverydayChinese',
    name: 'Everyday Chinese',
    levels: ['starting'],
    style: 'Structured lessons'
  },
  {
    id: 'mandarin-chinese-for-us',
    language: 'mandarin',
    input: '@ChineseForUsOfficial',
    name: 'ChineseFor.Us',
    levels: ['starting'],
    style: 'Structured lessons'
  },
  {
    id: 'mandarin-stickynote',
    language: 'mandarin',
    input: '@Stickynote.Chinese',
    name: 'Jun - Stickynote Chinese',
    levels: ['starting', 'beginner'],
    style: 'Comprehensible input'
  },
  {
    id: 'mandarin-harbin',
    language: 'mandarin',
    input: '@HarbinMandarin',
    name: 'Harbin Mandarin',
    levels: ['starting'],
    style: 'Comprehensible input'
  },
  {
    id: 'mandarin-xiaogua',
    language: 'mandarin',
    input: '@xiaoguachinese',
    name: 'Xiaogua Chinese',
    levels: ['beginner'],
    style: 'Comprehensible input'
  },
  {
    id: 'mandarin-lazy',
    language: 'mandarin',
    input: '@Lazy-Chinese',
    name: 'Lazy Chinese - Comprehensible Input',
    levels: ['beginner'],
    style: 'Comprehensible input'
  },
  {
    id: 'mandarin-chinese-with-ben',
    language: 'mandarin',
    input: '@chinesewithben',
    name: 'Chinese with Ben',
    levels: ['beginner'],
    style: 'Clear explanations'
  },
  {
    id: 'mandarin-richard-chinese',
    language: 'mandarin',
    input: '@RichardChineseLanguage',
    name: '理查老师的中文直播课 - Richard Chinese',
    levels: ['beginner'],
    style: 'Structured lessons'
  },
  {
    id: 'mandarin-chinese-at-dawn',
    language: 'mandarin',
    input: '@chinese-at-dawn',
    name: 'Chinese at Dawn',
    levels: ['beginner'],
    style: 'Comprehensible input'
  },
  {
    id: 'mandarin-dashu',
    language: 'mandarin',
    input: '@dashumandarin',
    name: 'Dashu Mandarin 大叔中文',
    levels: ['intermediate'],
    style: 'Conversations and interviews'
  },
  {
    id: 'mandarin-annie-kerin',
    language: 'mandarin',
    input: '@LearnChinesewithAnnieandKerin',
    name: '俩北京姑娘闲聊',
    levels: ['intermediate'],
    style: 'Casual conversations'
  },
  {
    id: 'mandarin-corner',
    language: 'mandarin',
    input: '@MandarinCorner2',
    name: 'Mandarin Corner',
    levels: ['intermediate'],
    style: 'Conversations and stories',
    description: 'Long-form listening, street interviews, and everyday Mandarin.'
  },
  {
    id: 'mandarin-free-to-learn',
    language: 'mandarin',
    input: '@DANLIAOFreeToLearnChinese',
    name: 'Free To Learn Chinese',
    levels: ['intermediate'],
    style: 'Natural Mandarin'
  },
  {
    id: 'mandarin-shenglan-podcast',
    language: 'mandarin',
    input: '@chinesepodcastwithshenglan',
    name: 'Chinese Podcast With Shenglan',
    levels: ['intermediate'],
    style: 'Podcast'
  },
  {
    id: 'mandarin-sophia-c',
    language: 'mandarin',
    input: '@sonargalc',
    name: 'Sophia C.',
    levels: ['intermediate'],
    style: 'Natural Mandarin'
  },
  {
    id: 'mandarin-out-of-office',
    language: 'mandarin',
    input: '@theOutofOfficePodcast',
    name: '不上班 / Out of Office',
    levels: ['advanced'],
    style: 'Podcast'
  },
  {
    id: 'mandarin-muerstalk',
    language: 'mandarin',
    input: '@muerstalk',
    name: '周慕姿放心說',
    levels: ['advanced'],
    style: 'Psychology and conversations'
  },
  {
    id: 'mandarin-bailingguo',
    language: 'mandarin',
    input: '@bailingguo',
    name: 'Bailingguo News',
    levels: ['advanced'],
    style: 'News and commentary'
  },
  {
    id: 'mandarin-mediastorm',
    language: 'mandarin',
    input: '@mediastorm6801',
    name: 'Mediastorm影视飓风',
    levels: ['advanced'],
    style: 'Film and technology'
  },
  {
    id: 'mandarin-hahatai',
    language: 'mandarin',
    input: '@Hahatai',
    name: 'HahaTai 哈哈台',
    levels: ['advanced'],
    style: 'Street interviews'
  },
  {
    id: 'mandarin-one-in-billion',
    language: 'mandarin',
    input: '@One-In-a-Billion',
    name: '亿点点不一样',
    levels: ['advanced'],
    style: 'Native entertainment'
  },
]
const CURATED_CHANNEL_LEVEL_OVERRIDES = {}
const EXPANDED_CURATED_CHANNEL_DATA = [
  ['japanese-pod101', 'japanese', '@JapanesePod101', 'Learn Japanese with JapanesePod101.com', 'starting', 'Structured lessons'],
  ['japanese-kanako-journey', 'japanese', '@KanakosJapaneseJourney', 'Kanako’s Japanese Journey! | かなこ', 'starting', 'Clear explanations'],
  ['japanese-mochi-real', 'japanese', '@mochirealjapanese3430', 'Mochi Real Japanese', 'starting', 'Comprehensible input'],
  ['japanese-learn-japanese-channel', 'japanese', '@LearnJapaneseChannel', 'Learn Japanese Channel', 'starting', 'Structured lessons'],
  ['japanese-yuta', 'japanese', '@ThatJapaneseManYuta', 'That Japanese Man Yuta', 'starting', 'Clear explanations'],
  ['japanese-sushi-room', 'japanese', '@sushiroomjapaneselesson689', 'SUSHI ROOM（Japanese Lesson）', 'starting', 'Structured lessons'],
  ['japanese-beginners-channel', 'japanese', '@JapaneseBeginnersChannel', 'Learn Japanese for beginners 【 あいう 】', 'beginner', 'Structured lessons'],
  ['japanese-japarrot', 'japanese', '@Japarrot_LetsLearnJP', "Japarrot!- Let's Learn Japanese", 'beginner', 'Comprehensible input'],
  ['japanese-shun', 'japanese', '@JapanesewithShun', 'Japanese with Shun', 'beginner', 'Podcast'],
  ['japanese-bonbon', 'japanese', '@bonbonsJapaneseLesson', "BonBon's Japanese Lesson", 'beginner', 'Clear explanations'],
  ['japanese-chibi', 'japanese', '@ChibiJapanese-z7r', 'Chibi Japanese', 'beginner', 'Comprehensible input'],
  ['japanese-ayano', 'japanese', '@am_japanese_vocab_beginners', '彩乃老師 / 日語入門單字與片語', 'beginner', 'Structured lessons'],
  ['japanese-taka-dojo', 'japanese', '@takanihongodojo', 'Taka Nihongo Dojo', 'intermediate', 'Clear explanations'],
  ['japanese-super-immersion', 'japanese', '@JSI55', 'Japanese super immersion', 'intermediate', 'Comprehensible input'],
  ['japanese-tanaka', 'japanese', '@japanese_tanakasan', 'Learn Japanese with Tanaka san', 'intermediate', 'Comprehensible input'],
  ['japanese-joy', 'japanese', '@JoyofJapanese', 'Ren – Joy of Japanese', 'intermediate', 'Comprehensible input'],
  ['japanese-speak-naturally', 'japanese', '@SpeakJapaneseNaturally', 'Speak Japanese Naturally', 'intermediate', 'Clear explanations'],
  ['japanese-chienowa', 'japanese', '@chienowajapanese1101', 'Chienowa Japanese', 'intermediate', 'Comprehensible input'],
  ['japanese-kevin', 'japanese', '@KevinsEnglishRoom', "Kevin's English Room / 掛山ケビ志郎", 'advanced', 'Native entertainment'],
  ['japanese-jiro', 'japanese', '@JiroJapanese', 'Jiro, just Japanese', 'advanced', 'Native entertainment'],
  ['japanese-atashinchi', 'japanese', '@Atashinchi', '【アニメ】あたしンち公式チャンネル', 'advanced', 'Native entertainment'],
  ['japanese-kohei', 'japanese', '@japanesewithKohei', 'ジャパラボ JapaneseLab Kohei', 'advanced', 'Casual conversations'],
  ['japanese-tbs-news-dig', 'japanese', '@tbsnewsdig', 'TBS NEWS DIG Powered by JNN', 'advanced', 'News and commentary'],
  ['japanese-tokai-on-air', 'japanese', '@TokaiOnAir', '東海オンエア', 'advanced', 'Native entertainment'],

  ['korean-gobilly', 'korean', '@GoBillyKorean', 'Learn Korean with GO! Billy Korean', 'starting', 'Structured lessons'],
  ['korean-class101', 'korean', '@KoreanClass101', 'Learn Korean with KoreanClass101.com', 'starting', 'Structured lessons'],
  ['korean-tammy', 'korean', '@Tammy_Korean', 'Tammy Korean', 'starting', 'Clear explanations'],
  ['korean-delicious', 'korean', '@delicious_korean', 'Delicious Korean', 'starting', 'Clear explanations'],
  ['korean-hailey', 'korean', '@koreanfriendhailey', 'Hailey _Your Korean Friend', 'starting', 'Clear explanations'],
  ['korean-ttmik', 'korean', '@talktomeinkorean', 'Talk To Me In Korean', 'starting', 'Lessons and conversations'],
  ['korean-mina', 'korean', '@Koreanwithmina', 'Korean with Mina', 'beginner', 'Clear explanations'],
  ['korean-seemile', 'korean', '@seemile', 'seemile Korean', 'beginner', 'Structured lessons'],
  ['korean-pronounce', 'korean', '@Pronounce-Korean', 'Pronounce Korean', 'beginner', 'Pronunciation'],
  ['korean-tutorial', 'korean', '@TheKoreanTutorial', 'The Korean Tutorial', 'beginner', 'Structured lessons'],
  ['korean-spark', 'korean', '@spark_korean', 'Spark Korean', 'beginner', 'Structured lessons'],
  ['korean-youngssam', 'korean', '@YoungSsamKorean', 'Learn Korean with YoungSsam', 'beginner', 'Structured lessons'],
  ['korean-jaerim', 'korean', '@DailyKoreanwithJaerim', 'Daily Korean with Jaerim', 'intermediate', 'Comprehensible input'],
  ['korean-morip', 'korean', '@morip.korean', '몰입한국어 Immersion in Korean', 'intermediate', 'Comprehensible input'],
  ['korean-joshua-cho', 'korean', '@JOSHUACHOPH', 'JOSHUA CHO', 'intermediate', 'Comprehensible input'],
  ['korean-tingssam', 'korean', '@tingssam_korean', 'Tingssam 팅쌤 | Decoding Korea', 'intermediate', 'Clear explanations'],
  ['korean-jinny', 'korean', '@Jinnykoreanpodcast', "Jinny's Korean Podcast", 'intermediate', 'Podcast'],
  ['korean-miss-vicky', 'korean', '@KoreanwithMissVicky', 'Korean with Miss Vicky 빅키쌤', 'intermediate', 'Clear explanations'],
  ['korean-jadoo', 'korean', '@LearnKoreanWithJadoo', 'Learn Korean with Jadoo', 'advanced', 'Native entertainment'],
  ['korean-sbs-news', 'korean', '@sbsnews8', 'SBS 뉴스', 'advanced', 'News and commentary'],
  ['korean-didi', 'korean', '@DidiKoreanPodcast', 'Didi의 한국문화 Podcast', 'advanced', 'Podcast'],
  ['korean-ria', 'korean', '@RiaKoreaOfficial', 'Ria Korea 리아 코리아', 'advanced', 'Native entertainment'],
  ['korean-morning', 'korean', '@koreanmorning', 'Real Korean with Morning', 'advanced', 'Podcast'],
  ['korean-zip-daesung', 'korean', '@ZIP_DS', '집대성', 'advanced', 'Native entertainment'],

  ['spanish-pod101', 'spanish', '@spanishpod101', 'Learn Spanish with SpanishPod101.com', 'starting', 'Structured lessons'],
  ['spanish-babbel', 'spanish', '@LearnSpanishBabbel', 'Learn Spanish With Babbel', 'starting', 'Structured lessons'],
  ['spanish-carlos', 'spanish', '@Carlos-Spanish', 'Carlos Spanish', 'starting', 'Clear explanations'],
  ['spanish-language-tutor', 'spanish', '@TheLanguageTutor', 'The Language Tutor - Spanish', 'starting', 'Structured lessons'],
  ['spanish-my-daily', 'spanish', '@holamydailyspanish', 'My Daily Spanish', 'starting', 'Clear explanations'],
  ['spanish-wes', 'spanish', '@SpanishWithWes', 'Spanish with Wes!', 'starting', 'Clear explanations'],
  ['spanish-after-hours', 'spanish', '@spanishafterhours', 'Spanish After Hours', 'beginner', 'Comprehensible input'],
  ['spanish-ali', 'spanish', '@espanolconali', 'Español con Ali', 'beginner', 'Clear explanations'],
  ['spanish-butterfly', 'spanish', '@ButterflySpanish', 'Butterfly Spanish', 'beginner', 'Clear explanations'],
  ['spanish-liliana', 'spanish', '@SpanishWithLiliana', 'Spanish With Liliana', 'beginner', 'Clear explanations'],
  ['spanish-breakthrough', 'spanish', '@BreakthroughSpanish', 'Breakthrough Spanish', 'beginner', 'Structured lessons'],
  ['spanish-speak-faster', 'spanish', '@SpeakSpanishFaster', 'Speak Spanish Faster', 'beginner', 'Structured lessons'],
  ['spanish-dreaming', 'spanish', '@DreamingSpanish', 'Dreaming Spanish', 'intermediate', 'Comprehensible input'],
  ['spanish-boost-martin', 'spanish', '@spanishboostmartin', 'Spanish Boost with Martin', 'intermediate', 'Comprehensible input'],
  ['spanish-easy', 'spanish', '@EasySpanish', 'Easy Spanish', 'intermediate', 'Street interviews'],
  ['spanish-hola', 'spanish', '@HolaSpanish', 'Hola Spanish', 'intermediate', 'Structured lessons'],
  ['spanish-handy', 'spanish', '@handyspanish', 'Handyspanish', 'intermediate', 'Casual conversations'],
  ['spanish-light-speed', 'spanish', '@LightSpeedSpanishChannel', 'LightSpeed Spanish', 'intermediate', 'Structured lessons'],
  ['spanish-erre', 'spanish', '@ErrequeELE', 'Erre que ELE', 'advanced', 'Casual conversations'],
  ['spanish-juan', 'spanish', '@espanolconjuan', 'Español con Juan', 'advanced', 'Podcast'],
  ['spanish-telemundo', 'spanish', '@noticias', 'Noticias Telemundo', 'advanced', 'News and commentary'],
  ['spanish-dw', 'spanish', '@dwespanol', 'DW Español', 'advanced', 'News and commentary'],
  ['spanish-tiene-sentido', 'spanish', '@TieneSentidoPodcast', 'Tiene Sentido Pódcast', 'advanced', 'Podcast'],
  ['spanish-franco-escamilla', 'spanish', 'UCUjrDJokSX8JavRwy5iUOkA', 'Franco Escamilla', 'advanced', 'Native entertainment'],

  ['french-pod101', 'french', '@frenchpod101', 'Learn French with FrenchPod101.com', 'starting', 'Structured lessons'],
  ['french-poodle', 'french', '@french-with-poodle', 'French with Poodle', 'starting', 'Clear explanations'],
  ['french-leo', 'french', '@LeoFrenchTeacher', 'Leo French Teacher', 'starting', 'Clear explanations'],
  ['french-learn-with-fun', 'french', '@LearnFrench-9', 'Learn French With Fun', 'starting', 'Structured lessons'],
  ['french-dylane', 'french', '@TheperfectfrenchwithDylane', 'The perfect French with Dylane', 'starting', 'Detailed lessons'],
  ['french-lexie', 'french', '@LearnFrenchwithLexie', 'Learn French with Lexie', 'starting', 'Clear explanations'],
  ['french-nlf', 'french', '@NLF-Academy', 'NLF Academy | Real French Classes', 'beginner', 'Structured lessons'],
  ['french-alexa', 'french', '@learnfrenchwithalexa', 'Learn French With Alexa', 'beginner', 'Structured lessons'],
  ['french-piece', 'french', '@pieceoffrench', 'Piece of French', 'beginner', 'Casual conversations'],
  ['french-elisabeth', 'french', '@elisabeth_hellofrench', 'Learn French with Elisabeth - HelloFrench', 'beginner', 'Clear explanations'],
  ['french-facile', 'french', '@FrenchFacile12', 'French Facile', 'beginner', 'Comprehensible input'],
  ['french-adeline', 'french', '@AdelineTalks', 'Adeline Talks', 'beginner', 'Clear explanations'],
  ['french-input', 'french', '@FrenchComprehensibleInput', 'French Comprehensible Input', 'intermediate', 'Comprehensible input'],
  ['french-alice', 'french', '@aliceayel', 'alice ayel', 'intermediate', 'Comprehensible input'],
  ['french-school-tv', 'french', '@FrenchSchoolTV', 'French School TV', 'intermediate', 'Structured lessons'],
  ['french-easy', 'french', '@EasyFrench', 'Easy French', 'intermediate', 'Street interviews'],
  ['french-inner', 'french', '@innerFrench', 'innerFrench', 'intermediate', 'Podcast'],
  ['french-elisa', 'french', '@FrenchmorningswithElisa', 'French mornings with Elisa', 'intermediate', 'Clear explanations'],
  ['french-konbini', 'french', '@konbini', 'Konbini', 'advanced', 'Conversations and interviews'],
  ['french-palmashow', 'french', '@Palmashow', 'Palmashow', 'advanced', 'Native entertainment'],
  ['french-studio-bagel', 'french', '@StudioBagel', 'Studio Bagel', 'advanced', 'Native entertainment'],
  ['french-tv5monde', 'french', '@TV5MONDEInfo', 'TV5MONDE Info', 'advanced', 'News and commentary'],
  ['french-arte', 'french', '@arte', 'ARTE', 'advanced', 'News and commentary'],
  ['french-planete-rap', 'french', '@PlaneteRap', 'Planète Rap', 'advanced', 'Conversations and interviews'],

  ['german-slow', 'german', '@SlowGerman_yt', 'Slow German', 'starting', 'Comprehensible input'],
  ['german-anja', 'german', '@LearnGermanwithAnja', 'Learn German with Anja', 'starting', 'Clear explanations'],
  ['german-famo', 'german', '@learngermanwithfamo', 'Learn German with Famo', 'starting', 'Clear explanations'],
  ['german-easy-breezy', 'german', '@EasyBreezyGerman', 'Easy Breezy German', 'starting', 'Clear explanations'],
  ['german-from-zero', 'german', '@LearnGermanFromZero', 'Learn German From Zero', 'starting', 'Structured lessons'],
  ['german-jannika', 'german', '@JannikaDeutsch', 'Jannika Deutsch', 'starting', 'Clear explanations'],
  ['german-eleos', 'german', '@eleoscorner', 'eleos corner | learn german', 'beginner', 'Clear explanations'],
  ['german-pod101', 'german', '@Germanpod101', 'Learn German with GermanPod101.com', 'beginner', 'Structured lessons'],
  ['german-naturlich', 'german', '@naturlichgerman2021', 'Natürlich German', 'beginner', 'Comprehensible input'],
  ['german-teacher', 'german', '@yourgermanteacher', 'YourGermanTeacher', 'beginner', 'Structured lessons'],
  ['german-smartergerman', 'german', '@SmarterGermanBerlin', 'SmarterGerman', 'beginner', 'Structured lessons'],
  ['german-vocabulary-every-day', 'german', '@learngermanvocabulary1', 'Learn German Every Day', 'beginner', 'Structured lessons'],
  ['german-easy', 'german', '@EasyGerman', 'Easy German', 'intermediate', 'Street interviews'],
  ['german-lets-go', 'german', '@letsgo.germanonline', "Let's GO! Deutsch mit Laura und Theresa", 'intermediate', 'Clear explanations'],
  ['german-lingoni', 'german', '@lingoniGERMAN', 'lingoni GERMAN', 'intermediate', 'Structured lessons'],
  ['german-original', 'german', '@LearnGermanOriginal', 'Learn German', 'intermediate', 'Structured lessons'],
  ['german-dw-learn', 'german', '@dwlearngerman', 'Deutsch lernen mit der DW', 'intermediate', 'Structured lessons'],
  ['german-claudia', 'german', '@SpeakGermanwithClaudia', 'Speak German with Claudia', 'intermediate', 'Clear explanations'],
  ['german-mikel', 'german', '@MikelHyperpolyglotDeutsch', 'Mikel spricht Deutsch', 'advanced', 'Clear explanations'],
  ['german-los', 'german', '@LearnGermanLOSSprachschule', 'Learn German - LOS! Sprachschule', 'advanced', 'Structured lessons'],
  ['german-rieke', 'german', '@deutschmitrieke', 'Deutsch mit Rieke', 'advanced', 'Detailed lessons'],
  ['german-expertly', 'german', '@expertlygerman', 'ExpertlyGerman', 'advanced', 'Clear explanations'],
  ['german-arte', 'german', '@ARTEde', 'ARTEde', 'advanced', 'News and commentary'],
  ['german-kurzgesagt', 'german', '@KurzgesagtDE', 'Dinge Erklärt – Kurzgesagt', 'advanced', 'Clear explanations'],

  ['english-bbc', 'english', '@bbclearningenglish', 'BBC Learning English', 'beginner', 'Structured lessons'],
  ['english-maria', 'english', '@EnglishWithMariaFicano', 'English with Maria', 'beginner', 'Clear explanations'],
  ['english-cozy-chat', 'english', '@englishcozychat', 'English Cozy Chat', 'beginner', 'Casual conversations'],
  ['english-volka', 'english', '@VolkaEnglish', 'Volka English', 'beginner', 'Comprehensible input'],
  ['english-slow-podcast', 'english', '@Slow_English_Podcast', 'Miss Honey 🍯', 'beginner', 'Podcast'],
  ['english-lukes-podcast', 'english', '@LukesEnglishPodcast', "Luke's English Podcast", 'beginner', 'Podcast'],
  ['english-high-level-listening', 'english', '@highlevellistening', 'High Level Listening Advanced English Podcast', 'intermediate', 'Podcast'],
  ['english-easy', 'english', '@EasyEnglishVideos', 'Easy British English', 'intermediate', 'Street interviews'],
  ['english-lucy', 'english', '@EnglishwithLucy', 'English with Lucy', 'intermediate', 'Clear explanations'],
  ['english-vanessa', 'english', '@SpeakEnglishWithVanessa', 'Speak English With Vanessa', 'intermediate', 'Clear explanations'],
  ['english-class101', 'english', '@EnglishClass101', 'Learn English with EnglishClass101.com', 'intermediate', 'Structured lessons'],
  ['english-tv-series', 'english', '@LearnEnglishWithTVSeries', 'Learn English With TV Series', 'intermediate', 'Comprehensible input'],
  ['english-fallon', 'english', '@fallontonight', 'The Tonight Show Starring Jimmy Fallon', 'advanced', 'Native entertainment'],
  ['english-bbc-news', 'english', '@BBCNews', 'BBC News', 'advanced', 'News and commentary'],
  ['english-bad-friends', 'english', '@BadFriends', 'Bad Friends', 'advanced', 'Casual conversations'],
  ['english-comedy-central-stand-up', 'english', '@standup', 'Comedy Central Stand-Up', 'advanced', 'Native entertainment'],
  ['english-comedy-central', 'english', '@ComedyCentral', 'Comedy Central', 'advanced', 'Native entertainment'],
  ['english-bbc-earth', 'english', '@bbcearth', 'BBC Earth', 'advanced', 'Clear explanations']
]
const EXPANDED_CURATED_CHANNEL_CATALOG = EXPANDED_CURATED_CHANNEL_DATA.map(([id, language, input, name, level, style]) => ({
  id,
  language,
  input,
  name,
  levels: [level],
  style
}))
export const CURATED_CHANNEL_CATALOG = [
  ...BASE_CURATED_CHANNEL_CATALOG.map(channel => ({
    ...channel,
    levels: CURATED_CHANNEL_LEVEL_OVERRIDES[channel.id] || channel.levels
  })),
  ...EXPANDED_CURATED_CHANNEL_CATALOG
]
export const CURATED_CHANNEL_SEARCH_LANGUAGE_ALIASES = {
  mandarin: ['mandarin', 'mandarin chinese', 'chinese', '中文', '汉语', '漢語'],
  japanese: ['japanese', '日本語'],
  korean: ['korean', '한국어'],
  spanish: ['spanish', 'espanol', 'español'],
  french: ['french', 'francais', 'français'],
  german: ['german', 'deutsch'],
  english: ['english'],
  russian: ['russian', 'русский'],
  portuguese: ['portuguese', 'portugues', 'português']
}
export const CURATED_CHANNEL_SEARCH_IGNORED_WORDS = new Set([
  'a',
  'channel',
  'channels',
  'for',
  'language',
  'languages',
  'learn',
  'learning',
  'lesson',
  'lessons',
  'the',
  'to',
  'video',
  'videos',
  'with',
  'youtube'
])
export const CURATED_NOT_SURE_CHANNEL_IDS = {
  mandarin: [
    'mandarin-grace',
    'mandarin-stickynote',
    'mandarin-lazy',
    'mandarin-chinese-at-dawn',
    'mandarin-chinese-with-ben',
    'mandarin-corner'
  ],
  english: [
    'english-bbc',
    'english-maria',
    'english-cozy-chat',
    'english-high-level-listening',
    'english-easy',
    'english-fallon'
  ],
  french: [
    'french-pod101',
    'french-poodle',
    'french-leo',
    'french-nlf',
    'french-alexa',
    'french-input'
  ]
}
