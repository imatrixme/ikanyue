// The only binding to the platform. Porting to another mini program platform starts here and in api.js.

export const host = wx;
export const registerApp = (options) => App(options);
export const registerPage = (options) => Page(options);
export const registerComponent = (options) => Component(options);
export const pageStack = () => getCurrentPages();
