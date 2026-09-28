import { startApp } from './app.ts';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('#app is missing');
startApp(root);
