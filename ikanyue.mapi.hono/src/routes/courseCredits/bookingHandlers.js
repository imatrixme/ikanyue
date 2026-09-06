const { invariant } = require('../../services/courseCredits/domain');

function createCourseBookingHandlers(options) {
    const {
        capability,
        commandMetadata,
        loadServices,
        metrics,
        queryParams,
        readOptionalJsonBody,
        requireCapability,
        requireStudent,
        safeCommand,
        safeQuery,
        featureGate,
    } = options;
    const studentCommand = (name, run) => async (c) => safeCommand(c, name, async () => {
        const user = requireStudent(c.get('user'));
        const body = await readOptionalJsonBody(c);
        const services = await loadServices();
        return run(c, services, user, body, commandMetadata(c, user));
    }, metrics);
    const teacherCommand = (name, run, feature) => async (c) => safeCommand(c, name, async () => {
        if (feature) featureGate.require(feature);
        const user = requireBookingTeacher(c.get('user'), capability, requireCapability);
        const body = await readOptionalJsonBody(c);
        const services = await loadServices();
        return run(c, services, user, body, commandMetadata(c, user));
    }, metrics);
    const opsCommand = (name, run, feature) => async (c) => safeCommand(c, name, async () => {
        if (feature) featureGate.require(feature);
        const user = requireBookingOperator(c.get('user'), capability, requireCapability);
        const body = await readOptionalJsonBody(c);
        const services = await loadServices();
        return run(c, services, user, body, { ...commandMetadata(c, user), actorRole: 'admin' });
    }, metrics);

    return {
        async listStudentBookingOptions(c) {
            return safeQuery(c, async () => {
                const user = requireStudent(c.get('user'));
                return (await loadServices()).bookingQueryService.studentOptions(user.id,
                    queryParams(c, ['courseId']));
            });
        },
        async listStudentBookingSlots(c) {
            return safeQuery(c, async () => {
                const user = requireStudent(c.get('user'));
                return (await loadServices()).bookingQueryService.availableSlots(user.id,
                    queryParams(c, ['offeringId', 'from', 'to']));
            });
        },
        async listStudentAppointments(c) {
            return safeQuery(c, async () => {
                const user = requireStudent(c.get('user'));
                return (await loadServices()).bookingQueryService.listStudentAppointments(user.id,
                    queryParams(c, ['page', 'perPage', 'status']));
            });
        },
        async getStudentAppointment(c) {
            return safeQuery(c, async () => {
                const user = requireStudent(c.get('user'));
                return (await loadServices()).bookingQueryService.getStudentAppointment(
                    user.id, c.req.param('appointmentId')
                );
            });
        },
        async previewStudentCancellation(c) {
            return safeQuery(c, async () => {
                const user = requireStudent(c.get('user'));
                return (await loadServices()).appointmentCancellationService.preview(user.id, c.req.param('appointmentId'));
            });
        },
        createStudentAppointment: studentCommand('requestAppointment', (c, services, user, body, metadata) => (
            services.appointmentRequestService.createRequest({
                ...body, ...metadata, studentId: user.id,
            })
        )),
        withdrawStudentAppointment: studentCommand('withdrawAppointment', (c, services, user, body, metadata) => (
            services.pendingAppointmentService.withdraw({
                ...body, ...metadata, appointmentId: c.req.param('appointmentId'), studentId: user.id,
            })
        )),
        cancelStudentAppointment: studentCommand('cancelAppointment', (c, services, user, body, metadata) => (
            services.appointmentCancellationService.cancel({
                ...body, ...metadata, appointmentId: c.req.param('appointmentId'), studentId: user.id,
            })
        )),

        async getTeacherBookingDashboard(c) {
            return safeQuery(c, async () => {
                const user = requireBookingTeacher(c.get('user'), capability, requireCapability);
                return (await loadServices()).bookingQueryService.teacherDashboard(user.id);
            });
        },
        async listTeacherAppointments(c) {
            return safeQuery(c, async () => {
                const user = requireBookingTeacher(c.get('user'), capability, requireCapability);
                return (await loadServices()).bookingQueryService.listTeacherAppointments(user.id,
                    queryParams(c, ['page', 'perPage', 'status']));
            });
        },
        async getTeacherAppointment(c) {
            return safeQuery(c, async () => {
                const user = requireBookingTeacher(c.get('user'), capability, requireCapability);
                return (await loadServices()).bookingQueryService.getTeacherAppointment(
                    user.id, c.req.param('appointmentId')
                );
            });
        },
        async getTeacherCalendar(c) {
            return safeQuery(c, async () => {
                const user = requireBookingTeacher(c.get('user'), capability, requireCapability);
                return (await loadServices()).bookingQueryService.teacherCalendar(user.id,
                    queryParams(c, ['page', 'perPage', 'from', 'to']));
            });
        },
        async getTeacherAvailability(c) {
            return safeQuery(c, async () => {
                const user = requireBookingTeacher(c.get('user'), capability, requireCapability);
                return (await loadServices()).bookingQueryService.teacherAvailability(
                    user.id, c.req.param('offeringId')
                );
            });
        },
        confirmTeacherAppointment: teacherCommand('confirmAppointment', (c, services, user, body, metadata) => (
            services.appointmentDecisionService.confirm({
                ...body, ...metadata, appointmentId: c.req.param('appointmentId'), teacherId: user.id,
            })
        ), 'reservation'),
        declineTeacherAppointment: teacherCommand('declineAppointment', (c, services, user, body, metadata) => (
            services.pendingAppointmentService.decline({
                ...body, ...metadata, appointmentId: c.req.param('appointmentId'), teacherId: user.id,
            })
        )),
        cancelTeacherAppointment: teacherCommand('cancelAppointment', (c, services, user, body, metadata) => (
            services.appointmentCancellationService.cancel({
                ...body, ...metadata, appointmentId: c.req.param('appointmentId'), teacherId: user.id,
            })
        )),
        rescheduleTeacherAppointment: teacherCommand('rescheduleAppointment', (c, services, user, body, metadata) => (
            services.appointmentRescheduleService.reschedule({
                ...body, ...metadata, appointmentId: c.req.param('appointmentId'), teacherId: user.id,
            })
        )),
        saveTeacherAvailability: teacherCommand('saveTeacherAvailability', (c, services, user, body, metadata) => (
            services.teacherAvailabilityService.saveWeekly({
                ...body, ...metadata, offeringId: c.req.param('offeringId'), teacherId: user.id,
            })
        )),
        createTeacherAvailabilityOverride: teacherCommand(
            'createTeacherAvailabilityOverride', (c, services, user, body, metadata) => (
                services.teacherAvailabilityService.createOverride({
                    ...body, ...metadata, offeringId: c.req.param('offeringId'), teacherId: user.id,
                })
            )
        ),
        cancelTeacherAvailabilityOverride: teacherCommand(
            'cancelTeacherAvailabilityOverride', (c, services, user, body, metadata) => (
                services.teacherAvailabilityService.cancelOverride({
                    ...body, ...metadata, overrideId: c.req.param('overrideId'), teacherId: user.id,
                })
            )
        ),

        async getOpsBookingDashboard(c) {
            return safeQuery(c, async () => {
                requireBookingOperator(c.get('user'), capability, requireCapability);
                return (await loadServices()).bookingOpsQueryService.dashboard();
            });
        },
        async getOpsBookingReferenceData(c) {
            return safeQuery(c, async () => {
                requireBookingOperator(c.get('user'), capability, requireCapability);
                return (await loadServices()).bookingOpsQueryService.referenceData();
            });
        },
        async listOpsAppointments(c) {
            return safeQuery(c, async () => {
                requireBookingOperator(c.get('user'), capability, requireCapability);
                return (await loadServices()).bookingOpsQueryService.listAppointments(queryParams(c, [
                    'page', 'perPage', 'status', 'teacherId', 'studentId', 'courseSpecId', 'from', 'to',
                ]));
            });
        },
        async getOpsAppointment(c) {
            return safeQuery(c, async () => {
                requireBookingOperator(c.get('user'), capability, requireCapability);
                return (await loadServices()).bookingOpsQueryService.getAppointment(c.req.param('appointmentId'));
            });
        },
        async listOpsBookingPolicies(c) {
            return safeQuery(c, async () => {
                requireBookingOperator(c.get('user'), capability, requireCapability);
                return (await loadServices()).bookingOpsQueryService.listPolicies(
                    queryParams(c, ['page', 'perPage', 'status'])
                );
            });
        },
        async listOpsBookingOfferings(c) {
            return safeQuery(c, async () => {
                requireBookingOperator(c.get('user'), capability, requireCapability);
                return (await loadServices()).bookingOpsQueryService.listOfferings(queryParams(c, [
                    'page', 'perPage', 'status', 'teacherId', 'courseSpecId',
                ]));
            });
        },
        async listOpsBookingAvailability(c) {
            return safeQuery(c, async () => {
                requireBookingOperator(c.get('user'), capability, requireCapability);
                return (await loadServices()).bookingOpsQueryService.listAvailability(
                    queryParams(c, ['status', 'teacherId', 'offeringId'])
                );
            });
        },
        async listOpsBookingConflicts(c) {
            return safeQuery(c, async () => {
                requireBookingOperator(c.get('user'), capability, requireCapability);
                return (await loadServices()).bookingOpsQueryService.listConflicts(
                    queryParams(c, ['page', 'perPage', 'status', 'teacherId'])
                );
            });
        },
        createOpsBookingPolicy: opsCommand('configureBookingPolicy', (_c, services, _user, body, metadata) => (
            services.bookingAdminService.createPolicyRevision({ ...body, ...metadata })
        )),
        saveOpsBookingOffering: opsCommand('configureBookingOffering', (c, services, _user, body, metadata) => (
            services.bookingAdminService.saveOffering({
                ...body, ...metadata, offeringId: c.req.param('offeringId') || body.offeringId || '',
            })
        )),
        saveOpsBookingAvailability: opsCommand(
            'saveTeacherAvailability', (c, services, _user, body, metadata) => (
                services.teacherAvailabilityService.saveWeeklyForOperator({
                    ...body, ...metadata, offeringId: c.req.param('offeringId'),
                })
            )
        ),
        createOpsBookingAvailabilityOverride: opsCommand(
            'createTeacherAvailabilityOverride', (c, services, _user, body, metadata) => (
                services.teacherAvailabilityService.createOverrideForOperator({
                    ...body, ...metadata, offeringId: c.req.param('offeringId'),
                })
            )
        ),
        cancelOpsBookingAvailabilityOverride: opsCommand(
            'cancelTeacherAvailabilityOverride', (c, services, _user, body, metadata) => (
                services.teacherAvailabilityService.cancelOverrideForOperator({
                    ...body, ...metadata, overrideId: c.req.param('overrideId'),
                })
            )
        ),
        cancelOpsAppointment: opsCommand('cancelAppointment', (c, services, user, body, metadata) => {
            if (body.cancellationType === 'institution') requireCapability(user, capability.FINANCE);
            return services.appointmentCancellationService.cancel({
                ...body, ...metadata, appointmentId: c.req.param('appointmentId'),
            });
        }),
        confirmOpsAppointment: opsCommand('confirmAppointment', (c, services, _user, body, metadata) => (
            services.appointmentDecisionService.confirm({
                ...body, ...metadata, appointmentId: c.req.param('appointmentId'),
            })
        ), 'reservation'),
        declineOpsAppointment: opsCommand('declineAppointment', (c, services, _user, body, metadata) => (
            services.pendingAppointmentService.decline({
                ...body, ...metadata, appointmentId: c.req.param('appointmentId'),
            })
        )),
        rescheduleOpsAppointment: opsCommand('rescheduleAppointment', (c, services, _user, body, metadata) => (
            services.appointmentRescheduleService.reschedule({
                ...body, ...metadata, appointmentId: c.req.param('appointmentId'),
            })
        )),
        resolveOpsBookingConflict: opsCommand('resolveBookingConflict', (c, services, _user, body, metadata) => (
            services.bookingAdminService.resolveConflict({
                ...body, ...metadata, conflictId: c.req.param('conflictId'),
            })
        )),
        previewOpsScheduleBackfill: async (c) => safeQuery(c, async () => {
            requireBookingOperator(c.get('user'), capability, requireCapability);
            return (await loadServices()).scheduleClaimBackfillService.preview(queryParams(c, ['from', 'to']));
        }),
        applyOpsScheduleBackfill: opsCommand('backfillScheduleClaims', (_c, services, _user, body, metadata) => (
            services.scheduleClaimBackfillService.apply({ ...body, ...metadata })
        )),
        cancelOpsSession: opsCommand('cancelSession', (c, services, _user, body, metadata) => (
            services.sessionCancellationService.cancelSession({
                ...body, ...metadata, sessionId: c.req.param('sessionId'),
            })
        )),
        expireAppointmentWorker: opsCommand('expireAppointments', (_c, services, _user, body, metadata) => (
            services.appointmentWorkerService.expirePending({ ...body, ...metadata })
        )),
        fulfillAppointmentWorker: opsCommand('fulfillAppointments', (_c, services, _user, body, metadata) => (
            services.appointmentWorkerService.fulfillCompleted({ ...body, ...metadata })
        )),
    };
}

function requireBookingTeacher(user, capability, requireCapability) {
    invariant(user?.role === 'teacher' && user.id,
        'BOOKING_TEACHER_REQUIRED', '仅教师可以使用预约工作台');
    return requireCapability(user, capability.TEACHER);
}

function requireBookingOperator(user, capability, requireCapability) {
    return requireCapability(user, capability.ACADEMIC);
}

module.exports = { createCourseBookingHandlers, requireBookingOperator, requireBookingTeacher };
