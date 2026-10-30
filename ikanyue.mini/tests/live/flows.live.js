// The host stand-in must load before any mini program module binds `wx`.
import { act, log, mount, open, settle, tap } from './host.js';
import { describe, expect, it } from 'vitest';

// Device-regression stand-in: drives the real pages against the local stack through the API gateway.
// Run with `pnpm test:live` while `node scripts/native-stack.mjs up` is running; it creates and settles
// appointments and a mock-paid order in the local data, the same way a tester on a phone would.
const accounts = {
    student: { cellphone: process.env.LIVE_STUDENT_CELLPHONE, password: process.env.LIVE_STUDENT_PASSWORD },
    teacher: { cellphone: process.env.LIVE_TEACHER_CELLPHONE, password: process.env.LIVE_TEACHER_PASSWORD },
    // The owner is an administrator teacher: same workbench, more sections.
    owner: { cellphone: process.env.LIVE_OWNER_CELLPHONE, password: process.env.LIVE_OWNER_PASSWORD },
};
const state = { offering: null, slots: [], appointments: {}, waiting: null };

async function login(role) {
    const profile = await open('pages/profile');
    if (profile.data.isLogin) {
        await act((await open('pages/userinfo')).confirmLogout());
        await act(profile.refreshUserInfo());
        expect(profile.data.isLogin).toBe(false);
    }
    const { cellphone, password } = accounts[role];
    await act(profile.showLoginPopup());
    await act(profile.toggleAgreed());
    await act(profile.handlePasswordCellphoneInput(tap({}, { value: cellphone })));
    await act(profile.onField(tap({ field: 'passwordValue' }, { value: password })));
    await act(profile.handlePasswordLogin());
    expect(log.toasts.at(-1)).toBe('登录成功');
    expect(profile.data).toMatchObject({ isLogin: true, role: role === 'owner' ? 'teacher' : role, passwordValue: '' });
}

// Every request a page makes goes through the gateway (except dev-only mock payment) and succeeds.
async function smoke(path, query) {
    const from = log.requests.length;
    const page = await open(path, query);
    const failed = log.requests.slice(from).filter((entry) => entry.status >= 400 || entry.direct);
    expect(failed, path).toEqual([]);
    expect(page.data.errorMessage || page.data.error || '', path).toBe('');
    return page;
}

async function book() {
    const page = await open('pages/appointmentSlots', {
        offeringId: state.offering.offeringId, courseName: state.offering.course.name, teacherName: state.offering.teacher.name,
    });
    expect(page.data.state).toBe('ready');
    // Take slots from the far end of the window, one per booking, so cancellations stay free and runs do not collide.
    const groups = page.data.slotGroups;
    const candidates = groups.flatMap((group, g) => group.slots.map((slot, s) => ({ g, s, startAt: slot.startAt })))
        .filter((item) => !state.slots.includes(item.startAt));
    const pick = candidates[candidates.length - 1 - Math.floor(Math.random() * Math.min(10, candidates.length))];
    state.slots.push(pick.startAt);
    await act(page.selectSlot(tap({ group: pick.g, slot: pick.s })));
    expect(page.data.canSubmit).toBe(true);
    const navigations = log.navigations.length;
    await act(page.submitBooking());
    expect(log.toasts.at(-1)).toBe('预约申请已发送');
    await new Promise((resolve) => setTimeout(resolve, 400));
    const redirect = log.navigations.slice(navigations).find((entry) => entry.type === 'redirectTo');
    const id = new URL(redirect.url, 'https://mini.local').searchParams.get('id');
    expect(id).toBeTruthy();
    return id;
}

async function detail(id) {
    const page = await open('pages/appointmentDetail', { id });
    expect(page.data.state).toBe('ready');
    return page;
}

describe.sequential('live mini program flows', () => {
    it('has local credentials', () => {
        for (const [role, account] of Object.entries(accounts)) expect(account.cellphone && account.password, role).toBeTruthy();
    });

    it('student signs in with a password and sees home, courses and booking options', async () => {
        await login('student');
        const home = await smoke('pages/home');
        expect(home.data.state).not.toBe('error');
        await smoke('pages/courses');
        const booking = await smoke('pages/appointmentBooking');
        expect(booking.data.options.length, 'seeded booking options').toBeGreaterThan(0);
        state.offering = booking.data.options[0];
    });

    it('student read-only pages load through the gateway', async () => {
        for (const path of ['pages/courseLessons', 'pages/courseRecords', 'pages/points', 'pages/pointsHistory', 'pages/rewardCatalog',
            'pages/activity', 'pages/appointments', 'pages/venues', 'pages/userinfo', 'pages/agreement', 'pages/courseShop']) {
            await smoke(path);
        }
    });

    it('home renewal reminders subscribe when a template is configured', async () => {
        const home = await open('pages/home');
        if (!home.data.subscribeTemplateId) {
            console.error('live: WECHAT_RENEWAL_TEMPLATE_ID is not set locally; the subscribe entry stays hidden as designed');
            return;
        }
        await act(home.subscribeReminders());
        expect(log.toasts.at(-1)).toBe('已开启微信提醒');
    });

    // A course allows one pending request at a time, so each request is settled before the next one.
    it('student requests a lesson and the teacher confirms it', async () => {
        state.appointments.confirm = await book();
        await login('teacher');
        for (const path of ['pages/home', 'pages/appointmentBooking', 'pages/appointments']) await smoke(path);
        const page = await detail(state.appointments.confirm);
        expect(page.data.appointment.canConfirm).toBe(true);
        await act(page.confirmAppointment());
        expect(log.toasts.at(-1)).toBe('预约已确认');
        expect(page.data.appointment.status).toBe('confirmed');
    });

    it('teacher reloads and saves weekly availability', async () => {
        const page = await smoke('pages/teacherAvailability', { offeringId: state.offering.offeringId });
        await act(page.saveWeekly());
        expect(log.toasts.at(-1)).toBe('可预约时间已保存');
    });

    it('student requests another lesson and the teacher declines it with a reason', async () => {
        await login('student');
        state.appointments.decline = await book();
        await login('teacher');
        const page = await detail(state.appointments.decline);
        await act(page.openDecline());
        await act(page.onField(tap({ field: 'reason' }, { value: '时间冲突，换个时间' })));
        await act(page.submitReasonAction());
        expect(log.toasts.at(-1)).toBe('预约状态已更新');
        expect(page.data.appointment.status).toBe('declined');
    });

    it('student withdraws a pending request', async () => {
        await login('student');
        state.appointments.withdraw = await book();
        const page = await detail(state.appointments.withdraw);
        expect(page.data.appointment.canWithdraw).toBe(true);
        await act(page.withdrawAppointment());
        expect(log.toasts.at(-1)).toBe('预约申请已撤回');
        expect(page.data.appointment.canWithdraw).toBe(false);
    });

    it('student cancels the confirmed appointment with a quoted refund', async () => {
        const page = await detail(state.appointments.confirm);
        expect(page.data.appointment.canCancel).toBe(true);
        await act(page.openCancel());
        expect(page.data.cancellationQuote).toBeTruthy();
        expect(page.data.cancellationText).not.toBe('');
        await act(page.onField(tap({ field: 'reason' }, { value: '临时有事' })));
        await act(page.submitReasonAction());
        expect(log.toasts.at(-1)).toBe('预约状态已更新');
        expect(page.data.appointment.canCancel).toBe(false);
    });

    it('student buys a course with mock payment, then asks for a refund', async () => {
        const shop = await smoke('pages/courseShop');
        expect(shop.data.offers.length, 'seeded course offers').toBeGreaterThan(0);
        const navigations = log.navigations.length;
        await act(shop.buy(tap({ index: 0 })));
        const opened = log.navigations.slice(navigations).find((entry) => entry.url?.startsWith('/pages/courseOrder/index'));
        const id = new URL(opened.url, 'https://mini.local').searchParams.get('id');

        const order = await smoke('pages/courseOrder', { id });
        expect(order.data.order.status).toBe('pending');
        expect(order.data.order.mockPayment).toBe(true);
        await act(order.pay());
        for (let attempt = 0; attempt < 10 && order.data.order.status !== 'completed'; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 300));
            await act(order.refresh());
        }
        expect(order.data.order.status).toBe('completed');
        expect(order.data.bookable).toBe(true);

        await act(order.refund());
        expect(log.modals.at(-1)).toMatch(/^预计退款 ¥/);
        expect(order.data.order.refundPending || order.data.order.refunded > 0).toBeTruthy();
    });

    // Owner workbench (add-owner-workbench). Confirming needs a started lesson waiting locally, e.g. a confirmed
    // appointment moved into the past; without one the confirm and undo steps are skipped.
    it('hired teacher sees only teaching sections and confirms a started lesson', async () => {
        await login('teacher');
        const home = await mount('components/teacher-booking-home');
        expect(home.data.sections).toMatchObject({ available: true, teach: true, students: false, grant: false, undo: false });
        state.waiting = home.data.lessons[0] || null;
        if (!state.waiting) {
            console.error('live: no started lesson waits for confirmation locally; confirm and undo are skipped');
            return;
        }
        await act(home.openConfirm(tap({ id: state.waiting.sessionId })));
        await act(home.submitConfirm());
        expect(log.toasts.at(-1)).toBe('已确认上课');
        expect(home.data.lessons.map((lesson) => lesson.sessionId)).not.toContain(state.waiting.sessionId);
    });

    it('owner adds a student and grants a discounted package', async () => {
        await login('owner');
        const home = await mount('components/teacher-booking-home');
        expect(home.data.sections).toMatchObject({ teach: true, students: true, grant: true, undo: true });
        const students = await smoke('pages/workbenchStudents');
        await act(students.openAdd());
        await act(students.onField(tap({ field: 'draft.realName' }, { value: '工作台联调' })));
        await act(students.onField(tap({ field: 'draft.cellphone' }, { value: `199${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}` })));
        const navigations = log.navigations.length;
        await act(students.submitAdd());
        expect(log.toasts.at(-1)).toBe('学员已添加');
        const opened = log.navigations.slice(navigations).find((entry) => entry.url?.startsWith('/pages/workbenchStudent/index'));
        const id = new URL(opened.url, 'https://mini.local').searchParams.get('id');
        expect((await smoke('pages/workbenchStudent', { id })).data.ledger.courses).toEqual([]);

        const grant = await smoke('pages/workbenchGrant', { id, name: '工作台联调' });
        expect(grant.data.packages.length, 'seeded packages').toBeGreaterThan(0);
        const [price] = grant.data.chosen.prices;
        await act(grant.onField(tap({ field: 'paidAmount' }, { value: String(Math.max(0, price.saleAmount - 1)) })));
        await act(grant.submit());
        expect(log.toasts.at(-1)).toBe('课时已发放');
        expect((await smoke('pages/workbenchStudent', { id })).data.ledger.courses[0].remaining).toBeGreaterThan(0);
    });

    it('owner undoes the confirmation and confirms the lesson again', async () => {
        if (!state.waiting) return;
        const students = await smoke('pages/workbenchStudents');
        await act(students.onField(tap({ field: 'keyword' }, { value: accounts.student.cellphone })));
        await act(students.search());
        const ledger = await smoke('pages/workbenchStudent', { id: students.data.students[0].studentId });
        expect(ledger.data.ledger.confirmedLessons.map((lesson) => lesson.sessionId)).toContain(state.waiting.sessionId);
        await act(ledger.openUndo(tap({ id: state.waiting.sessionId })));
        await act(ledger.onField(tap({ field: 'reason' }, { value: '学员实际缺席' })));
        await act(ledger.submitUndo());
        expect(log.toasts.at(-1)).toBe('已撤销，课时已退回');

        const home = await mount('components/teacher-booking-home');
        const lesson = home.data.lessons.find((item) => item.sessionId === state.waiting.sessionId);
        expect(lesson?.reconfirm).toBe(true);
        await act(home.openConfirm(tap({ id: lesson.sessionId })));
        await act(home.toggleAbsent(tap({ id: lesson.students[0].sessionStudentId })));
        await act(home.submitConfirm());
        expect(log.toasts.at(-1)).toBe('已确认上课');
    });

    it('signs out cleanly', async () => {
        await act((await open('pages/userinfo')).confirmLogout());
        const profile = await open('pages/profile');
        expect(profile.data.isLogin).toBe(false);
        await settle();
    });
});
