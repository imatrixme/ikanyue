class OpsAuthorizationError extends Error {
    constructor(message = '权限不足') {
        super(message);
        this.name = 'OpsAuthorizationError';
        this.code = 403;
    }
}

class OpsRbacService {
    constructor(repository, auditService) {
        this.repository = repository;
        this.auditService = auditService;
    }

    assertTeacher(user) {
        if (!user?.id || user.role !== 'teacher') {
            throw new OpsAuthorizationError('后台仅允许教师或管理员访问');
        }
    }

    assertAdmin(user) {
        this.assertTeacher(user);
        if (!user.isAdmin) {
            throw new OpsAuthorizationError('需要管理员权限');
        }
    }

    async assertStudentAccess(user, studentId, action = 'ops.student.access') {
        this.assertTeacher(user);
        if (user.isAdmin) {
            return true;
        }

        const result = await this.repository.list('teacher_student_relations', 1, 1, {
            filter: `teacherId = "${user.id}" && studentId = "${studentId}" && status = "active"`,
        });

        if (result.items?.length > 0) {
            return true;
        }

        await this.auditService.denied(user, action, 'student', studentId);
        throw new OpsAuthorizationError('无权访问该学员');
    }
}

module.exports = { OpsAuthorizationError, OpsRbacService };
