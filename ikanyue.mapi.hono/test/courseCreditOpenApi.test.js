const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROUTE_FILE = path.resolve(__dirname, '../src/routes/courseCredits/index.js');
const SWAGGER_FILE = path.resolve(__dirname, '../docs/swagger.json');

test('every registered course-credit route has an OpenAPI operation', () => {
    const source = fs.readFileSync(ROUTE_FILE, 'utf8');
    const swagger = JSON.parse(fs.readFileSync(SWAGGER_FILE, 'utf8'));
    const directRoutes = [...source.matchAll(/routes\.(get|post|put|delete|patch)\('([^']+)'\)/g)]
        .map((match) => ({ method: match[1], path: openApiPath(match[2]) }));
    const generatedGets = [...source.matchAll(/\['([^']+)', handlers\.[A-Za-z0-9_]+\]/g)]
        .map((match) => ({ method: 'get', path: openApiPath(match[1]) }));
    const routes = [...directRoutes, ...generatedGets];

    assert.ok(routes.length >= 20);
    for (const route of routes) {
        assert.ok(swagger.paths[route.path], `missing OpenAPI path ${route.path}`);
        assert.ok(swagger.paths[route.path][route.method], `missing ${route.method.toUpperCase()} ${route.path}`);
        assert.deepEqual(swagger.paths[route.path][route.method].security, [{ BearerAuth: [] }]);
    }
});

test('course-credit OpenAPI references resolve and command envelopes expose tracing fields', () => {
    const swagger = JSON.parse(fs.readFileSync(SWAGGER_FILE, 'utf8'));
    const coursePaths = Object.fromEntries(Object.entries(swagger.paths)
        .filter(([pathname]) => pathname.includes('course-credits')));
    for (const reference of collectReferences(coursePaths)) {
        assert.ok(resolveReference(swagger, reference), `unresolved OpenAPI reference ${reference}`);
    }
    const envelope = swagger.components.schemas.CourseCreditResponse
        || swagger.components.schemas.CourseCreditCommandResponse;
    assert.ok(envelope.properties.operationId);
    assert.ok(envelope.properties.traceId);
});

function openApiPath(routePath) {
    return routePath.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function collectReferences(value, found = []) {
    if (Array.isArray(value)) {
        value.forEach((item) => collectReferences(item, found));
        return found;
    }
    if (!value || typeof value !== 'object') return found;
    for (const [key, nested] of Object.entries(value)) {
        if (key === '$ref' && typeof nested === 'string') found.push(nested);
        else collectReferences(nested, found);
    }
    return found;
}

function resolveReference(document, reference) {
    if (!reference.startsWith('#/')) return true;
    return reference.slice(2).split('/').reduce((value, segment) => (
        value?.[segment.replaceAll('~1', '/').replaceAll('~0', '~')]
    ), document);
}

module.exports = {
    collectReferences,
    openApiPath,
    resolveReference,
};
