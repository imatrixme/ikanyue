import { KANYUE_INFO_LINKS } from './kanyueInfoLinks.js';

// Membership cards on the profile page: one per studio the user belongs to. The profile itself stays
// studio-neutral; a studio's own information only shows after the user opens its card.
// The mini program serves one studio today; the list keeps the shape for more.
const CARD_THEMES = Object.freeze(['mint', 'apricot', 'sky', 'sage']);

const STUDIOS = Object.freeze([
    Object.freeze({ id: 'kanyue', name: '看乐艺术', tagline: '声乐课程与预约', theme: 'mint', infoLinks: KANYUE_INFO_LINKS }),
]);

const findStudio = (id) => STUDIOS.find((studio) => studio.id === id) || null;

// A studio without its own theme still gets a stable look from its id, so cards differ from one another.
function cardTheme(studio = {}) {
    if (CARD_THEMES.includes(studio.theme)) return studio.theme;
    let hash = 0;
    for (const char of String(studio.id || '')) hash = (hash * 31 + char.charCodeAt(0)) % 9973;
    return CARD_THEMES[hash % CARD_THEMES.length];
}

function lessonTotals(courses = []) {
    return courses.reduce((totals, course) => ({
        remaining: totals.remaining + (Number(course.remainingLessons) || 0),
        scheduled: totals.scheduled + (Number(course.scheduledLessons) || 0),
    }), { remaining: 0, scheduled: 0 });
}

// `courses` is null while unknown, so a failed load never reads as "no lessons".
function cardSummary(role, courses) {
    if (role === 'teacher') return '任教机构';
    if (!courses) return '会员卡';
    if (!courses.length) return '暂无课程';
    return `剩余 ${lessonTotals(courses).remaining} 课时`;
}

function memberCard(studio, { role = 'student', courses = null, coverUrl = '' } = {}) {
    return {
        coverUrl,
        id: studio.id,
        name: studio.name,
        summary: cardSummary(role, courses),
        tagline: studio.tagline,
        theme: cardTheme(studio),
    };
}

const memberCards = (context) => STUDIOS.map((studio) => memberCard(studio, context));

export { CARD_THEMES, cardTheme, findStudio, lessonTotals, memberCard, memberCards };
