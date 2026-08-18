const { createDefaultCourseCreditServices } = require('../../services/courseCredits');
const { CourseCreditError } = require('../../services/courseCredits/domain');
const { PublicCourseCatalogService } = require('../../services/courseCredits/publicCatalogService');

function publicCourseCatalogRoutes(routes, handlers = createPublicCourseCatalogHandlers()) {
    routes.get('/v1/public/course-catalog').handler(handlers.catalog);
    routes.get('/v1/public/course-catalog/courses/:code').handler(handlers.course);
    routes.get('/v1/public/course-catalog/packages/:code').handler(handlers.package);
}

function createPublicCourseCatalogHandlers(loadServices = createDefaultCourseCreditServices) {
    const run = (query) => async (c) => {
        try {
            const services = await loadServices();
            const catalog = new PublicCourseCatalogService(services.repository);
            return c.data(await query(catalog, c));
        } catch (error) {
            const notFound = error instanceof CourseCreditError && error.code.endsWith('_NOT_FOUND');
            if (!notFound) console.error('公开课程投影失败:', error?.code || error?.message || error);
            return c.json({
                code: notFound ? 404 : 500,
                message: notFound ? error.message : '公开课程暂时不可用',
                data: null,
                errorCode: error instanceof CourseCreditError ? error.code : 'PUBLIC_CATALOG_UNAVAILABLE',
            }, 200);
        }
    };
    return {
        catalog: run((service) => service.catalog()),
        course: run((service, c) => service.course(c.req.param('code'))),
        package: run((service, c) => service.package(c.req.param('code'))),
    };
}

module.exports = publicCourseCatalogRoutes;
module.exports.createPublicCourseCatalogHandlers = createPublicCourseCatalogHandlers;
