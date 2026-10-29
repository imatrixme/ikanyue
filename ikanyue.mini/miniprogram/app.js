import { defineApp } from './kit/app.js';
import { RoleManager } from './services/rolemanager.js';

defineApp({
    onShow() {
        RoleManager.applyTabBar();
    },
});
