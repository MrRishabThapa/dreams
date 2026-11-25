import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import './styles/index.css';
import { initKeyboardInset } from './ui/Sheet';

initKeyboardInset();

const root = ReactDOM.createRoot(document.getElementById('root')!);
const path = location.pathname.replace(/\/+$/, '');

async function boot() {
  if (path === '/_kit') {
    const { Kit } = await import('./screens/Kit');
    root.render(
      <React.StrictMode>
        <MotionConfig reducedMotion="user"><Kit /></MotionConfig>
      </React.StrictMode>,
    );
    return;
  }
  const { App } = await import('./App');
  root.render(
    <React.StrictMode>
      <MotionConfig reducedMotion="user"><App /></MotionConfig>
    </React.StrictMode>,
  );
}
void boot();
