# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ikanyue-hono is a complete rewrite of the ikanyue API service from Sails.js to Hono.js, maintaining full compatibility with the original project. This is an educational platform API serving both students and teachers with JWT-based authentication and PocketBase as the backend database.

## Commands

### Development
- `npm run dev` - Start development server with Node.js watch mode
- `npm run dev:bun` - Start development server with Bun watch mode
- `npm run start` - Start production server with Node.js
- `npm run start:bun` - Start production server with Bun

### Quality Control
- `npm run lint` - Run ESLint with zero warnings tolerance
- `npm run test` - Run Node.js built-in test runner
- `npm run check-docs` - Verify documentation completeness and quality

## Architecture

### Core Components

**Application Entry**: `src/app.js`
- Supports both Node.js and Bun runtime environments
- Uses custom route builder system for flexible route definition
- Implements global response middleware for consistent API responses

**Route Builder System**: `src/utils/routeBuilder.js`
- Custom chainable API for route definition with middleware inheritance
- Supports route grouping, conditional middleware, and permission chaining
- Example: `routes.post('/v1/user/login').auth(authMiddleware).handler(loginHandler)`

**Middleware Architecture**:
- `src/middleware/response.js` - Standardizes all API responses to `{code, message, data}` format
- `src/middleware/auth.js` - JWT token validation and user context injection
- `src/middleware/isAdmin.js` - Admin permission validation
- `src/middleware/isTeacher.js` - Teacher permission validation

**Database Integration**: `src/utils/pocketbase.js`
- Centralized PocketBase client configuration
- Connection management and error handling
- Maintains compatibility with original Sails.js data operations

### Route Organization
Routes are organized by entity type in `src/routes/`:
- `user/` - Authentication, profile management
- `student/` - Student CRUD operations
- `teacher/` - Teacher CRUD operations
- `activity/` - Activity management
- `audioMaterial/` and `videoMaterial/` - Media content management

Each route module follows the pattern: `index.js`, `find.js`, `create.js`, `update.js`, `delete.js`

## Documentation Standards

### Critical Requirements
1. **Every .js file MUST have a corresponding .md documentation file**
2. **All documentation MUST include mermaid flowcharts**
3. **Always read existing documentation before modifying code**
4. **Update documentation after code changes**

### Documentation Workflow
1. Read existing .md files to understand current implementation
2. Examine mermaid flowcharts to understand data flow
3. Make code changes
4. Update mermaid flowcharts to reflect changes
5. Update documentation content
6. Run `npm run check-docs` to verify completeness

### Documentation Elements
- Function description and purpose
- Mermaid flowchart (flowchart TD, sequenceDiagram, or graph LR)
- Request/response examples for API endpoints
- Dependency references using `[file](mdc:path)` format
- Update history

## API Response Format

All endpoints return standardized responses:
```json
// Success
{
  "code": 10000,
  "message": null,
  "data": { /* response data */ }
}

// Error
{
  "code": 400,
  "message": "Error description",
  "data": null
}
```

## Authentication & Permissions

### Permission Levels
1. Public - No authentication required
2. Authenticated - Valid JWT token required
3. Teacher - Teacher role or higher
4. Admin - Admin role required

### Context Usage
- Authentication middleware injects user data: `c.set('user', userData)`
- Route handlers access user data: `const user = c.get('user')`

## Environment Configuration

Copy `env.example` to `.env` and configure:
- `PB_URL` - PocketBase server URL
- `PORT` - API server port (default: 1337)
- `NODE_ENV` - Environment (development/production)
- `DEFAULT_AVATAR` - Default user avatar URL
- `JWT_SECRET` - JWT signing secret

## Development Practices

### Before Making Changes
1. Read the corresponding .md file for the component you're modifying
2. Understand the mermaid flowchart showing the current data flow
3. Check dependencies referenced in the documentation

### After Making Changes
1. Update the mermaid flowchart if the data flow changed
2. Update the .md documentation to reflect code changes
3. Run `npm run check-docs` to ensure documentation quality
4. Run `npm run lint` to check code quality

### Route Definition Pattern
Use the custom route builder for consistency:
```javascript
// Group routes by prefix
routes.group('/v1/user', (user) => {
  // Public endpoint
  user.post('/login').handler(loginHandler);
  
  // Authenticated endpoint
  user.post('/update').use(authMiddleware).handler(updateHandler);
  
  // Admin-only endpoint
  user.post('/admin/action').use(authMiddleware, isAdminMiddleware).handler(adminHandler);
});
```

## Compatibility Requirements

This project maintains 100% compatibility with the original Sails.js implementation:
- Identical API endpoints and parameters
- Same response format and error codes
- Compatible authentication mechanism
- Same PocketBase database operations
- Identical business logic and validation rules

When implementing new features or fixing bugs, ensure compatibility is preserved so frontend applications can use this API as a drop-in replacement.