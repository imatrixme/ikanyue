import type { Activity, Course, FacultyMember, LearnerStory } from '~/types/content'

export const primaryNav = [
  { label: '课程', to: '/courses' },
  { label: '教师', to: '/faculty' },
  { label: '活动', to: '/activities' },
  { label: '学员故事', to: '/stories' },
  { label: '关于看乐', to: '/about' },
]

export const courses: Course[] = [
  {
    slug: 'piano-foundation',
    title: '钢琴系统课程',
    audience: '儿童与成人均可',
    instrument: 'Piano',
    description: '从稳定的触键、节奏和听觉出发，建立能够长期进阶的演奏基础。',
    image: '/images/course-piano.webp',
    schedule: '一对一 · 每周固定课时',
  },
  {
    slug: 'guitar-songwriting',
    title: '吉他与弹唱',
    audience: '青少年与成人',
    instrument: 'Guitar',
    description: '把和声、节奏与歌曲表达放进真实曲目，在演奏中理解音乐结构。',
    image: '/images/course-guitar.webp',
    schedule: '一对一 / 小组课',
  },
  {
    slug: 'vocal-performance',
    title: '声乐与舞台表达',
    audience: '儿童、青少年与成人',
    instrument: 'Voice',
    description: '训练呼吸、音准与语言表达，并通过排练和舞台实践建立自信。',
    image: '/images/performance.webp',
    schedule: '一对一 · 定期舞台实践',
  },
  {
    slug: 'music-literacy',
    title: '乐理与音乐素养',
    audience: '所有学习阶段',
    instrument: 'Musicianship',
    description: '用听、唱、读谱和创作连接知识，让理论真正服务于演奏。',
    image: '/images/score.webp',
    schedule: '小组课 / 专项辅导',
  },
]

export const faculty: FacultyMember[] = [
  {
    slug: 'lin-yue',
    name: '林悦',
    role: '钢琴教师 · 课程负责人',
    specialties: ['古典钢琴', '儿童启蒙', '成人进阶'],
    statement: '好的基础不是重复得更多，而是每一次练习都知道自己在听什么。',
    image: '/images/course-piano.webp',
  },
  {
    slug: 'zhou-yan',
    name: '周言',
    role: '吉他与创作教师',
    specialties: ['民谣吉他', '弹唱', '歌曲创作'],
    statement: '曲目是入口，最终希望每位学员都能形成自己的音乐表达。',
    image: '/images/course-guitar.webp',
  },
  {
    slug: 'chen-xi',
    name: '陈曦',
    role: '声乐与舞台教师',
    specialties: ['流行演唱', '舞台表达', '合唱排练'],
    statement: '声音训练与人的状态紧密相关，舞台应当成为成长的自然结果。',
    image: '/images/performance.webp',
  },
]

export const learnerStories: LearnerStory[] = [
  {
    name: '安然',
    identity: '成人钢琴学员 · 学习 18 个月',
    course: '钢琴系统课程',
    quote: '下班后练琴不再是给自己增加任务，而是把一天重新整理一遍。',
  },
  {
    name: '小屿与妈妈',
    identity: '少儿钢琴学员家庭 · 学习 2 年',
    course: '钢琴系统课程',
    quote: '老师会告诉我们怎么听、怎么陪伴练习，家里少了催促，多了交流。',
  },
  {
    name: '程一',
    identity: '吉他学员 · 学习 10 个月',
    course: '吉他与弹唱',
    quote: '第一次完整弹唱时，我终于理解了节奏、和弦与表达是同一件事。',
  },
]

export const fallbackActivities: Activity[] = [
  {
    id: 'summer-studio-concert',
    title: '夏季学员音乐会',
    description: '儿童与成人学员共同完成的阶段舞台，包含独奏、重奏与弹唱。',
    startTime: '2026-08-22T11:00:00+08:00',
    endTime: '2026-08-22T16:30:00+08:00',
    location: '看乐艺术排演厅',
    coverImageUrl: '/images/performance.webp',
    tags: ['学员音乐会', '开放预约'],
  },
  {
    id: 'adult-open-class',
    title: '成人音乐学习开放课',
    description: '面向零基础成人的钢琴与吉他体验，了解课程方法与练习节奏。',
    startTime: '2026-09-05T14:00:00+08:00',
    endTime: '2026-09-05T16:00:00+08:00',
    location: '看乐艺术 2 号教室',
    coverImageUrl: '/images/hero-studio.webp',
    tags: ['成人课程', '免费预约'],
  },
  {
    id: 'practice-workshop',
    title: '如何建立有效练习',
    description: '教师与家长共同讨论练习目标、反馈方式与长期学习节奏。',
    startTime: '2026-09-19T10:00:00+08:00',
    endTime: '2026-09-19T11:30:00+08:00',
    location: '看乐艺术分享空间',
    coverImageUrl: '/images/score.webp',
    tags: ['家长工作坊', '学习方法'],
  },
]
