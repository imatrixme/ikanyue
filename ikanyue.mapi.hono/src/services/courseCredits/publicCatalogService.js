const { invariant } = require('./domain');
const { relationId } = require('./queryService');

class PublicCourseCatalogService {
    constructor(repository, options = {}) {
        this.repository = repository;
        this.clock = options.clock || Date.now;
    }

    async catalog() {
        const [courseSpecs, packages, creditTypes, grantLines, priceVersions] = await Promise.all([
            this.repository.list('course_specs', { filter: 'status="active"', sort: 'name,code' }),
            this.repository.list('packages', { filter: 'status="active"', sort: 'name,code' }),
            this.repository.list('credit_types', { filter: 'status="active"', sort: 'kind,name' }),
            this.repository.list('package_grant_lines', { sort: 'packageId,creditTypeId' }),
            this.repository.list('price_versions', { filter: 'status="active"', sort: 'packageId,-validFrom,-version' }),
        ]);
        const now = this.clock();
        const coursesById = byId(courseSpecs.filter(isActive));
        const creditsById = byId(creditTypes.filter(isActive));
        const activePackages = packages.filter(isActive);
        const publicPackages = activePackages.map((item) => projectPackage(item, {
            coursesById,
            creditsById,
            grantLines,
            priceVersions,
            now,
        })).filter(Boolean);
        const packageCodesByCourse = packagesForCourses(publicPackages);
        return {
            courses: [...coursesById.values()].map((course) => projectCourse(
                course, packageCodesByCourse.get(course.code) || []
            )),
            packages: publicPackages,
        };
    }

    async course(code) {
        const catalog = await this.catalog();
        const course = catalog.courses.find((item) => item.code === code);
        invariant(course, 'PUBLIC_COURSE_NOT_FOUND', '公开课程不存在');
        return { ...course, packages: catalog.packages.filter((item) => course.packageCodes.includes(item.code)) };
    }

    async package(code) {
        const catalog = await this.catalog();
        const item = catalog.packages.find((entry) => entry.code === code);
        invariant(item, 'PUBLIC_PACKAGE_NOT_FOUND', '公开课包不存在');
        return item;
    }
}

function projectCourse(course, packageCodes) {
    return {
        code: String(course.code || ''),
        deliveryMode: String(course.deliveryMode || ''),
        durationMinutes: Number(course.durationMinutes || 0),
        name: String(course.name || ''),
        packageCodes,
        teacherTier: String(course.teacherTier || ''),
    };
}

function projectPackage(item, relations) {
    const price = currentPrice(relations.priceVersions.filter((entry) => (
        relationId(entry.packageId) === item.id && isActive(entry)
    )), relations.now);
    if (!price) return null;
    const grants = relations.grantLines.filter((line) => relationId(line.packageId) === item.id)
        .map((line) => projectGrant(line, relations)).filter(Boolean);
    return {
        code: String(item.code || ''),
        description: String(item.description || ''),
        grants,
        name: String(item.name || ''),
        price: {
            currency: String(price.currency || ''),
            listAmount: Number(price.listAmount || 0),
            saleAmount: Number(price.saleAmount || 0),
        },
        purchaseMode: ['wechat', 'all'].includes(item.saleChannel) ? 'mini_program' : 'contact',
        validity: {
            activationDeadlineDays: nullableNumber(item.activationDeadlineDays),
            activationMode: String(item.activationMode || ''),
            expiryPolicy: String(item.expiryPolicy || ''),
            validityDurationDays: nullableNumber(item.validityDurationDays),
        },
    };
}

function projectGrant(line, relations) {
    const credit = relations.creditsById.get(relationId(line.creditTypeId));
    if (!credit) return null;
    const course = relations.coursesById.get(relationId(credit.courseSpecId));
    return {
        courseCode: course?.code || null,
        courseName: course?.name || null,
        creditName: String(credit.name || ''),
        quantity: Number(line.quantity || 0),
        unitLabel: String(credit.unitLabel || '课点'),
    };
}

function currentPrice(prices, now) {
    const timestamp = new Date(now).getTime();
    return prices.filter((price) => (
        Number.isFinite(Date.parse(price.validFrom))
        && Date.parse(price.validFrom) <= timestamp
        && (!price.validTo || Date.parse(price.validTo) >= timestamp)
    )).sort((left, right) => (
        Date.parse(right.validFrom) - Date.parse(left.validFrom)
        || Number(right.version || 0) - Number(left.version || 0)
    ))[0] || null;
}

function packagesForCourses(packages) {
    const result = new Map();
    for (const item of packages) {
        for (const code of new Set(item.grants.map((grant) => grant.courseCode).filter(Boolean))) {
            result.set(code, [...(result.get(code) || []), item.code]);
        }
    }
    return result;
}

function byId(items) {
    return new Map(items.map((item) => [item.id, item]));
}

function isActive(item) {
    return item?.status === 'active';
}

function nullableNumber(value) {
    return value === undefined || value === null || value === '' ? null : Number(value);
}

module.exports = {
    PublicCourseCatalogService,
    currentPrice,
    packagesForCourses,
    projectCourse,
    projectGrant,
    projectPackage,
};
