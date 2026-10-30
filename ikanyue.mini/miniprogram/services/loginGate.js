import { UserManager } from './usermanager.js';

// Pages that show a guest view spread these into their methods and render
// <login-sheet visible="{{showLogin}}" bind:close="closeLogin" bind:success="handleLoginSuccess" />.
// Nothing asks a guest to sign in up front: an action that needs an account runs at once when signed in;
// otherwise the sheet opens on this page, which reloads (onShow) after signing in and continues the action.
const loginGate = {
    withAccount(action) {
        if (UserManager.isLogin()) return action?.();
        this.afterLogin = action || null;
        return this.set({ showLogin: true });
    },
    closeLogin() {
        this.afterLogin = null;
        return this.set({ showLogin: false });
    },
    async handleLoginSuccess() {
        const action = this.afterLogin;
        this.afterLogin = null;
        await this.set({ showLogin: false });
        await this.onShow();
        // A teacher lands on their own workbench instead; a student's tapped action continues.
        if (action && UserManager.getRole() === 'student') await action();
    },
};

export { loginGate };
