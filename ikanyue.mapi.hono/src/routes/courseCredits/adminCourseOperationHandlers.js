const RESOURCE_CAPABILITIES = Object.freeze({
    courseSpecs: 'FINANCE',
    packages: 'FINANCE',
    grantLines: 'FINANCE',
    priceVersions: 'FINANCE',
    classes: 'ACADEMIC',
    lessons: 'ACADEMIC',
});

function createAdminCourseOperationHandlers(options) {
    const {
        capability,
        commandMetadata,
        loadServices,
        readJsonBody,
        requireAnyCapability,
        requireCapability,
        safeCommand,
        safeQuery,
    } = options;

    const createResource = (resource) => async (c) => safeCommand(c, `create${resource}`, async () => {
        const user = resourceUser(c, resource, capability, requireCapability);
        const body = await readJsonBody(c);
        const services = await loadServices();
        return services.adminResourceCommandService.createResource(resource, {
            ...commandMetadata(c, user), data: body,
        });
    });
    const updateResource = (resource) => async (c) => safeCommand(c, `update${resource}`, async () => {
        const user = resourceUser(c, resource, capability, requireCapability);
        const body = await readJsonBody(c);
        const services = await loadServices();
        return services.adminResourceCommandService.updateResource(resource, c.req.param('id'), {
            ...commandMetadata(c, user), data: body,
        });
    });
    const setStatus = (resource) => async (c) => safeCommand(c, `set${resource}Status`, async () => {
        const user = resourceUser(c, resource, capability, requireCapability);
        const body = await readJsonBody(c);
        const services = await loadServices();
        return services.adminResourceCommandService.setStatus(resource, c.req.param('id'), body.status, {
            ...commandMetadata(c, user), reason: body.reason,
        });
    });

    return {
        createCourseSpec: createResource('courseSpecs'),
        updateCourseSpec: updateResource('courseSpecs'),
        setCourseSpecStatus: setStatus('courseSpecs'),
        createPackage: createResource('packages'),
        updatePackage: updateResource('packages'),
        setPackageStatus: setStatus('packages'),
        createGrantLine: createResource('grantLines'),
        updateGrantLine: updateResource('grantLines'),
        createPriceVersion: createResource('priceVersions'),
        revisePriceVersion: updateResource('priceVersions'),
        setPriceVersionStatus: setStatus('priceVersions'),
        createClass: createResource('classes'),
        updateClass: updateResource('classes'),
        setClassStatus: setStatus('classes'),
        createLesson: createResource('lessons'),
        updateLesson: updateResource('lessons'),
        setLessonStatus: setStatus('lessons'),

        async createEnrollment(c) {
            return safeCommand(c, 'automaticEnrollment', async () => {
                const body = await readJsonBody(c);
                const user = requireCapability(c.get('user'), capability.FINANCE);
                if (body.classId) requireCapability(user, capability.ACADEMIC);
                const services = await loadServices();
                return services.automaticEnrollmentService.enroll({
                    ...body,
                    ...commandMetadata(c, user),
                    reason: body.reason,
                });
            });
        },

        async previewEnrollmentSync(c) {
            return safeQuery(c, async () => {
                requireCapability(c.get('user'), capability.ACADEMIC);
                const services = await loadServices();
                return services.enrollmentRosterSyncService.preview({ orderId: c.req.param('orderId') });
            });
        },

        async confirmEnrollmentSync(c) {
            return safeCommand(c, 'confirmEnrollmentRosterSync', async () => {
                const user = requireCapability(c.get('user'), capability.ACADEMIC);
                const body = await readJsonBody(c);
                const services = await loadServices();
                return services.enrollmentRosterSyncService.confirm({
                    ...body,
                    ...commandMetadata(c, user),
                    orderId: c.req.param('orderId'),
                });
            });
        },

        async setManualAttendance(c) {
            return safeCommand(c, 'setManualAttendance', async () => {
                const user = requireAnyCapability(c.get('user'), [capability.ACADEMIC, capability.TEACHER]);
                const body = await readJsonBody(c);
                const services = await loadServices();
                return services.manualAttendanceService.setAttendance({
                    ...body,
                    ...commandMetadata(c, user),
                    actorTeachingScope: teachingScope(user, capability),
                    sessionId: c.req.param('sessionId'),
                    sessionStudentId: c.req.param('sessionStudentId'),
                });
            });
        },

        async markAllPresent(c) {
            return safeCommand(c, 'markAllPresent', async () => {
                const user = requireAnyCapability(c.get('user'), [capability.ACADEMIC, capability.TEACHER]);
                const body = await readJsonBody(c);
                const services = await loadServices();
                return services.manualAttendanceService.markAllPresent({
                    ...body,
                    ...commandMetadata(c, user),
                    actorTeachingScope: teachingScope(user, capability),
                    sessionId: c.req.param('sessionId'),
                });
            });
        },

        async setActualTeacher(c) {
            return safeCommand(c, 'setActualTeacher', async () => {
                const user = requireAnyCapability(c.get('user'), [capability.ACADEMIC, capability.TEACHER]);
                const body = await readJsonBody(c);
                const services = await loadServices();
                return services.manualAttendanceService.setActualTeacher({
                    ...body,
                    ...commandMetadata(c, user),
                    actorTeachingScope: teachingScope(user, capability),
                    sessionId: c.req.param('sessionId'),
                    sessionTeacherId: c.req.param('sessionTeacherId'),
                });
            });
        },

        async previewSessionSettlement(c) {
            return safeQuery(c, async () => {
                requireCapability(c.get('user'), capability.SETTLEMENT);
                const services = await loadServices();
                return services.manualAttendanceService.previewSettlement(c.req.param('sessionId'));
            });
        },
    };
}

function resourceUser(c, resource, capability, requireCapability) {
    return requireCapability(c.get('user'), capability[RESOURCE_CAPABILITIES[resource]]);
}

function teachingScope(user, capability) {
    return user.isAdmin || (user.courseCreditCapabilities || []).includes(capability.ACADEMIC)
        ? 'global' : 'assigned';
}

module.exports = { RESOURCE_CAPABILITIES, createAdminCourseOperationHandlers, resourceUser, teachingScope };
