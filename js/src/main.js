import './menu.js';
import { switchCalc } from './calculator.js';
import { toggleFaq } from './faq.js';
import './scroll-animations.js';

// Exposed for inline onclick="..." handlers in HTML
window.switchCalc = switchCalc;
window.toggleFaq = toggleFaq;
