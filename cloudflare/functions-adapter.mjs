import {waitUntil as defer} from 'cloudflare:workers';
export const waitUntil=promise=>defer(promise);
