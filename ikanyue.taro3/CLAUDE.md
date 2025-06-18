# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"看乐艺术" (ikanyue) is a Taro-based mini-program for art activities, built with Vue 3 and NutUI-Taro. The project supports multiple platforms including WeChat mini-program, H5, Alipay mini-program, and others.

## Development Commands

### Development (Watch Mode)
- `npm run dev:weapp` - WeChat mini-program development
- `npm run dev:h5` - H5 development  
- `npm run dev:alipay` - Alipay mini-program development
- `npm run dev:tt` - ByteDance mini-program development

### Production Build
- `npm run build:weapp` - Build for WeChat mini-program
- `npm run build:h5` - Build for H5
- `npm run build:alipay` - Build for Alipay mini-program
- `npm run build:tt` - Build for ByteDance mini-program

### Linting and Type Checking
No dedicated lint/typecheck commands found in package.json - project uses basic ESLint setup.

## Architecture Overview

### Tech Stack
- **Framework**: Taro 4.0.9 + Vue 3 Composition API
- **UI Library**: NutUI-Taro 3.3.8  
- **Build Tool**: Webpack 5
- **Styling**: SCSS with NutUI variables
- **Design Width**: 375px

### Core Structure
```
src/
├── app.js              # Application entry
├── app.config.js       # App config (pages, tabBar, etc.)
├── pages/              # Page components
├── data/               # Static data files
├── imgs/               # Image assets
└── index.html          # H5 entry

utils/
├── request.js          # Network request wrapper
├── apis.js            # API definitions
├── usermanager.js     # User state management  
└── favoriteManager.js # Favorites functionality
```

### Page Structure Convention
Each page directory contains:
- `index.vue` - Vue 3 component with Composition API
- `index.config.js` - Page configuration (navigation, pull-to-refresh)
- `index.scss` - Page styles with NutUI variables

### Key Configuration Files
- `config/index.js` - Main Taro configuration
- `config/dev.js` - Development environment config
- `config/prod.js` - Production environment config
- `src/app.config.js` - App pages and tabBar configuration

## Development Patterns

### API Management
- Network requests use centralized `utils/request.js` wrapper
- API endpoints defined in `utils/apis.js`
- User authentication/state managed via `utils/usermanager.js`
- Follow Promise-based pattern with proper error handling

### Styling Guidelines
- Import NutUI variables: `@import "@nutui/nutui-taro/dist/styles/variables.scss"`
- NutUI component classes (`nut-*`) excluded from px transformation
- Use SCSS for all styling
- Follow mobile-first responsive design

### Vue 3 Patterns
- Use `<script setup>` syntax exclusively
- Leverage Composition API features
- Component naming: PascalCase
- Use `definePageConfig` for page configurations

### Multi-Platform Considerations
- Test changes across WeChat mini-program and H5 platforms
- Platform-specific configurations in `mini` and `h5` config sections
- Be aware of platform API differences and limitations

## Current Features

### Tab Navigation
- 活动 (Activity) - Main activities page
- 音频 (Audio) - Audio materials with player
- 视频 (Video) - Video materials with player  
- 我的 (Profile) - User profile and settings

### Core Functionality
- User authentication and profile management
- Audio/video material browsing and playback
- Activity listings and details
- Favorites management
- WebView integration for external content